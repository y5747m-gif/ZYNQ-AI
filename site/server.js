#!/usr/bin/env node
'use strict';

// ==========================================================================
//  ZYNQ FX — مكتبة الموشن جرافيك والمؤثرات الضوئية
//  خادم بلا مكتبات: واجهة + كتالوج بحجم الملفات الحقيقية + تحميل مرفقات
//  + توليد باقات ZIP عند الطلب. يعمل محليًا (node site/server.js) وعلى فيرسل.
// ==========================================================================

const http = require('http');
const https = require('https');
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
// تطبيق «ستيريو» لأندرويد — مصدر APK داخل الموقع نفسه
// ---------------------------------------------------------------------------
// الهدف: زر التثبيت في الصفحة يفتح لوحة تثبيت داخل الموقع وينزّل الملف مباشرة،
// بلا انتقال إلى صفحة GitHub (كانت Artifacts تتطلب تسجيل دخول وتُخرج الزائر).
// ترتيب البحث عن الملف:
//   1) STEREO_APK_URL — رابط APK مباشر يعيّنه صاحب النشر (استضافة/CDN).
//   2) نسخة مبنية محليًا: app/build/outputs/apk/debug/app-debug.apk (خارج git).
//   3) أحدث إصدار عام على GitHub Releases — يُنزَّل بلا حساب، فيمرّره الخادم.
const GH_API = 'https://api.github.com';
const GH_REPO = 'y5747m-gif/ZYNQ-AI';
const APK_FILENAME = 'stereo-sound.apk';
const APK_LOCAL_CANDIDATES = [
  path.join(DOWNLOADS, 'stereo-sound', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  path.join(DOWNLOADS, 'stereo-sound', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
];
const INSTALL_STEPS = [
  'اضغط «⬇ نزّل APK» في هذه اللوحة — يبدأ التنزيل وتبقى في الموقع نفسه.',
  'افتح الإشعار أو مدير الملفات على هاتفك، ثم اضغط ملف stereo-sound.apk.',
  'إن ظهر تحذير، اسمح بالتثبيت من هذا المصدر (الإعدادات ← التطبيقات ← تثبيت تطبيقات غير معروفة).',
  'افتح «ستيريو» من شاشة التطبيقات، اختر ملفًا صوتيًا، واضبط القنوات والصوت.',
];
const apkCache = { at: 0, info: null };
const APK_CACHE_MS = 10 * 60 * 1000;

// جلب HTTP(S) بسيط يتبع إعادة التوجيه — بلا أي مكتبات خارجية.
function httpGet(url, { timeout = 8000, headers = {}, redirects = 3, collect = true } = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers: Object.assign({ 'User-Agent': 'ZYNQ-FX-site' }, headers) }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(httpGet(next, { timeout, headers, redirects: redirects - 1, collect }));
        return;
      }
      if (!collect) { resolve({ status, headers: res.headers, body: Buffer.alloc(0), stream: res }); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks), stream: res }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error('انتهت مهلة الاتصال')));
    req.on('error', reject);
  });
}

async function fetchJson(url) {
  const r = await httpGet(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status !== 200) return null;
  try { return JSON.parse(r.body.toString('utf8')); } catch (_) { return null; }
}

function localApk() {
  for (const f of APK_LOCAL_CANDIDATES) {
    try {
      const st = fs.statSync(f);
      if (st.isFile() && st.size > 0) return { file: f, size: st.size };
    } catch (_) { /* غير مبني محليًا */ }
  }
  return null;
}

function pickApkAsset(release) {
  const assets = (release && release.assets) || [];
  const apks = assets.filter((a) => /\.apk$/i.test(a.name || ''));
  if (!apks.length) return null;
  return apks.find((a) => /debug/i.test(a.name)) || apks[0];
}

// حالة ملف التثبيت: تُخزَّن 10 دقائق حتى لا نبطئ الصفحة بكثرة الطلبات.
async function apkInfo(force = false) {
  const now = Date.now();
  if (!force && apkCache.info && now - apkCache.at < APK_CACHE_MS) return apkCache.info;

  let info;
  try {
    const envUrl = (process.env.STEREO_APK_URL || '').trim();
    const local = localApk();
    if (envUrl) {
      info = {
        ready: true, source: 'custom', version: '', size: null, url: envUrl,
        steps: INSTALL_STEPS,
        note: 'الرابط معيّن من إعدادات النشر (STEREO_APK_URL)، والتنزيل يمرّ عبر هذا الموقع.',
      };
    } else if (local) {
      info = {
        ready: true, source: 'local', version: '', size: local.size, url: null, file: local.file,
        steps: INSTALL_STEPS,
        note: 'نسخة مبنية على هذا الجهاز (assembleDebug) — تُخدم مباشرة من الموقع.',
      };
    } else {
      const release = (await fetchJson(`${GH_API}/repos/${GH_REPO}/releases/latest`))
        || (await fetchJson(`${GH_API}/repos/${GH_REPO}/releases?per_page=5`) || []).find((r) => pickApkAsset(r));
      const asset = pickApkAsset(release);
      if (asset && asset.browser_download_url) {
        info = {
          ready: true, source: 'release', version: release.tag_name || '', size: asset.size || null,
          url: asset.browser_download_url, steps: INSTALL_STEPS,
          note: 'أحدث إصدار منشور — ينزّله الخادم ويعيد إرساله إليك، فلا تغادر الصفحة.',
        };
      } else {
        info = {
          ready: false, source: null, version: '', size: null, url: null, steps: INSTALL_STEPS,
          reason: release
            ? 'لا يوجد ملف APK منشور في الإصدارات العامة بعد.'
            : 'لم يُنشر بعد أي إصدار عام يحتوي ملف APK.',
        };
      }
    }
  } catch (err) {
    info = {
      ready: false, source: null, version: '', size: null, url: null, steps: INSTALL_STEPS,
      reason: 'تعذّر التحقق من مصدر ملف التثبيت الآن.',
      error: String((err && err.message) || err),
    };
  }

  // نتيجة «غير متاح» تُخزَّن دقيقتين فقط حتى يظهر النشر الجديد بسرعة.
  apkCache.info = info;
  apkCache.at = info.ready ? now : now - (APK_CACHE_MS - 2 * 60 * 1000);
  return info;
}

// بثّ ملف APK إلى المتصفح: من القرص إن كان محليًا، وإلا بتمرير الرابط العام.
async function streamApk(res, info) {
  const head = {
    'Content-Type': MIME['.apk'],
    'Content-Disposition': `attachment; filename="${APK_FILENAME}"`,
    'Cache-Control': 'no-store',
  };
  if (info.file) {
    const st = fs.statSync(info.file);
    res.writeHead(200, Object.assign(head, { 'Content-Length': st.size }));
    fs.createReadStream(info.file).pipe(res);
    return;
  }
  const upstream = await httpGet(info.url, { timeout: 20000, collect: false });
  if (upstream.status !== 200) throw new Error(`مصدر التحميل ردّ بالحالة ${upstream.status}`);
  const len = upstream.headers['content-length'];
  res.writeHead(200, len ? Object.assign(head, { 'Content-Length': Number(len) }) : head);
  upstream.stream.pipe(res);
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

    // حالة ملف تثبيت تطبيق «ستيريو» — تستعلم عنها لوحة التثبيت داخل الصفحة.
    if (p === '/api/app/status') {
      const info = await apkInfo(url.searchParams.get('refresh') === '1');
      const body = {
        ready: !!info.ready,
        version: info.version || '',
        size: info.size || null,
        source: info.source || null,
        note: info.note || null,
        reason: info.reason || null,
        steps: info.steps,
        download: info.ready ? '/api/app/apk' : null,
      };
      return send(res, info.ready ? 200 : 503, JSON.stringify(body), MIME['.json']);
    }

    // تنزيل APK نفسه من داخل الموقع (بلا مغادرة الصفحة إلى GitHub).
    if (p === '/api/app/apk') {
      const info = await apkInfo();
      if (!info.ready) {
        return send(res, 404, JSON.stringify({
          error: 'لا يوجد ملف APK جاهز للتنزيل المباشر بعد',
          reason: info.reason || null,
          alternative: '/api/app/source.zip',
        }), MIME['.json']);
      }
      return streamApk(res, info);
    }

    // مشروع أندرويد كامل كملف ZIP — يُفتح مباشرة في Android Studio ويُبنى منه APK.
    // (لا يوجد APK جاهز مُخزَّن في المستودع: البناء يحتاج JDK + Android SDK،
    //  وملف APK مُلفَّق يدويًا لا يُثبَّت على أي هاتف.)
    if (p === '/api/app/source.zip') {
      const root = path.join(DOWNLOADS, 'stereo-sound');
      const skip = new Set(['build', '.gradle', '.idea', 'node_modules', 'local.properties']);
      const entries = [];
      (function walk(dir) {
        for (const name of fs.readdirSync(dir)) {
          if (skip.has(name) || /^\.env(?:\.|$)/i.test(name) || /\.(?:jks|keystore|p12|pfx)$/i.test(name)) continue;
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
    // إن بدأ الإرسال فعلًا (بث APK) فلا يمكن كتابة ترويسات جديدة — أغلق الاتصال.
    if (res.headersSent) { try { res.destroy(); } catch (_) { /* تجاهل */ } return undefined; }
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
