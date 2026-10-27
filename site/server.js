#!/usr/bin/env node
'use strict';

// ==========================================================================
//  ZYNQ FX — مكتبة الموشن جرافيك والمؤثرات الضوئية
//  خادم بلا مكتبات: واجهة + كتالوج بحجم الملفات الحقيقية + تحميل مرفقات
//  + توليد باقات ZIP عند الطلب. يعمل محليًا (node site/server.js) وعلى فيرسل.
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function findSiteDir() {
  const candidates = [
    __dirname,
    path.join(__dirname, 'site'),
    path.resolve(__dirname, '..', 'site'),
    path.join(process.cwd(), 'site'),
    process.cwd(),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c, 'public', 'index.html'))) return c; } catch (_) { /* تجاهل */ }
  }
  return __dirname;
}

const SITE = findSiteDir();
const PUBLIC = path.join(SITE, 'public');
const DOWNLOADS = path.join(SITE, 'downloads');
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1]) || Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.manifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.cube': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.apk': 'application/vnd.android.package-archive',
};

function send(res, code, body, type, extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' }, extra));
  res.end(buf);
}

// ---------------------------------------------------------------------------
// ZIP بسيط (Deflate) لتوليد الباقات عند الطلب — بلا أي مكتبات خارجية
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useStore = deflated.length >= data.length;
    const payload = useStore ? data : deflated;
    const method = useStore ? 0 : 8;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); // وقت/تاريخ
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

// ---------------------------------------------------------------------------
// الكتالوج — البيانات من catalog.json + الأحجام الحقيقية من القرص
// ---------------------------------------------------------------------------
function loadCatalog() {
  const raw = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'catalog.json'), 'utf8'));
  for (const item of raw.items) {
    const f = path.join(SITE, item.file);
    try { item.size = fs.statSync(f).size; } catch (_) { item.size = 0; }
  }
  return raw;
}

function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(root)) return null;
  return p;
}

// ---------------------------------------------------------------------------
// المعالج
// ---------------------------------------------------------------------------
async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = decodeURIComponent(url.pathname);

  try {
    if (p === '/' || p === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html')), MIME['.html']);
    }

    if (p === '/api/catalog') {
      return send(res, 200, JSON.stringify(loadCatalog()), MIME['.json']);
    }

    // تطبيق «ستيريو» يحتاج الشرطة المائلة في النهاية حتى تعمل المسارات النسبية
    // (app.js · sw.js · manifest) داخل نطاقه على أي خادم أو استضافة.
    if (p === '/stereo') {
      res.writeHead(301, { Location: '/stereo/' });
      return res.end();
    }

    // الأيقونة الافتراضية للمتصفح حتى لا يظهر 404 في الكونسول
    if (p === '/favicon.ico') {
      const ico = path.join(PUBLIC, 'stereo', 'icons', 'icon-192.png');
      if (fs.existsSync(ico)) return send(res, 200, fs.readFileSync(ico), MIME['.png']);
    }

    // مشروع أندرويد كامل كملف ZIP — يُفتح مباشرة في Android Studio ويُبنى منه APK.
    // (لا يوجد APK جاهز مُخزَّن في المستودع: البناء يحتاج JDK + Android SDK،
    //  وملف APK مُلفَّق يدويًا لا يُثبَّت على أي هاتف.)
    if (p === '/api/app/source.zip') {
      const root = path.join(DOWNLOADS, 'stereo-sound');
      const skip = new Set(['build', '.gradle', '.idea', 'node_modules']);
      const entries = [];
      (function walk(dir) {
        for (const name of fs.readdirSync(dir)) {
          if (skip.has(name)) continue;
          const full = path.join(dir, name);
          const st = fs.statSync(full);
          if (st.isDirectory()) { walk(full); continue; }
          const rel = path.relative(root, full).split(path.sep).join('/');
          entries.push({ name: `stereo-sound/${rel}`, data: fs.readFileSync(full) });
        }
      })(root);
      if (!entries.length) return send(res, 404, JSON.stringify({ error: 'مشروع التطبيق غير موجود' }), MIME['.json']);
      return send(res, 200, makeZip(entries), MIME['.zip'], {
        'Content-Disposition': 'attachment; filename="stereo-sound-source.zip"',
      });
    }

    if (p.startsWith('/api/pack/')) {
      const key = p.slice('/api/pack/'.length).replace(/\.zip$/i, '');
      const catalog = loadCatalog();
      let items;
      if (key === 'all') items = catalog.items;
      else items = catalog.items.filter((it) => it.category === key);
      if (!items.length) return send(res, 404, JSON.stringify({ error: 'لا توجد ملفات في هذه الباقة' }), MIME['.json']);
      const entries = [];
      for (const it of items) {
        const f = safeJoin(SITE, it.file);
        if (f && fs.existsSync(f)) entries.push({ name: path.basename(f), data: fs.readFileSync(f) });
      }
      entries.push({
        name: 'ZYNQ-FX-README.txt',
        data: Buffer.from(
          'ZYNQ FX — Professional Motion & Light FX Pack\n' +
          '================================================\n' +
          'هذه الباقة من مكتبة ZYNQ FX — استخدم الملفات بحرية في مشاريعك التجارية.\n' +
          'Lottie JSON: أفتر إيفكت/بريمير عبر إضافة Lottie — أو أي ويب/موبايل.\n' +
          'PNG Sequence: استورد كـ Image Sequence بشفافية كاملة.\n' +
          'GIF: أوفرلاي بوضع الدمج Screen.\n' +
          'LUT .cube: عبر Lumetri / Resolve / Final Cut.\n', 'utf8'),
      });
      const zip = makeZip(entries);
      return send(res, 200, zip, MIME['.zip'], {
        'Content-Disposition': `attachment; filename="ZYNQ-FX-${key}.zip"`,
      });
    }

    // تحميل مرفق مع Content-Disposition
    if (p.startsWith('/downloads/')) {
      const f = safeJoin(DOWNLOADS, p.slice('/downloads/'.length));
      if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        return send(res, 404, JSON.stringify({ error: 'الملف غير موجود' }), MIME['.json']);
      }
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', {
        'Content-Disposition': `attachment; filename="${path.basename(f)}"`,
      });
    }

    // ملفات الواجهة الثابتة (مع دعم المجلدات: /stereo/ ⇒ /stereo/index.html)
    const rel = p === '/' ? 'index.html' : p.slice(1);
    let f = safeJoin(PUBLIC, rel);
    if (f && fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      f = path.join(f, 'index.html');
    }
    if (f && fs.existsSync(f) && fs.statSync(f).isFile()) {
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
    }

    return send(res, 404, MIME['.json'] ? JSON.stringify({ error: 'مسار غير معروف' }) : 'Not found', MIME['.json']);
  } catch (err) {
    return send(res, 500, JSON.stringify({ ok: false, reason: String(err && err.message ? err.message : err) }), MIME['.json']);
  }
}

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, HOST, () => {
    console.log(`ZYNQ FX — مكتبة المؤثرات تعمل على http://${HOST}:${PORT}`);
    console.log('المكتبة جاهزة: مؤثرات ضوئية، انتقالات، لوكات، تعابير — كلها تحميل مباشر.');
  });
}

module.exports = handler;
