#!/usr/bin/env node
'use strict';

// ==========================================================================
//  زيتونة — واجهة الويب (زر الترجمة)
//  خادم صغير بلا أي مكتبات: يعرض محرّرًا عربيًا، وزر «ترجم» مع قائمة لغات،
//  وينفّذ الترجمة + التحقق الحقيقي على الخادم (نفس منطق الطرفية).
//  التشغيل: node ui/server.js [--port 4173]
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const api = require('../src/index');

const HERE = __dirname;
const PORT = Number((process.argv.find((a) => a.startsWith('--port=')) || '').split('=')[1]) || Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const EXAMPLES = path.join(HERE, '..', 'examples');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
  res.end(buf);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('الطلب كبير جدًا')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function listExamples() {
  try {
    return fs.readdirSync(EXAMPLES).filter((f) => f.endsWith('.zy')).map((f) => ({
      name: f,
      size: fs.statSync(path.join(EXAMPLES, f)).size,
    }));
  } catch (_) { return []; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (p === '/' || p === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(HERE, 'index.html')), MIME['.html']);
    }
    if (p === '/app.js' || p === '/style.css') {
      const f = path.join(HERE, p.slice(1));
      if (fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)]);
    }
    if (p === '/api/targets') {
      return send(res, 200, JSON.stringify({ targets: api.listTargets() }));
    }
    if (p === '/api/examples') {
      return send(res, 200, JSON.stringify({ examples: listExamples() }));
    }
    if (p === '/api/example') {
      const name = String(url.searchParams.get('name') || '');
      const safe = path.basename(name);
      const f = path.join(EXAMPLES, safe);
      if (!fs.existsSync(f)) return send(res, 404, JSON.stringify({ error: 'المثال غير موجود' }));
      return send(res, 200, JSON.stringify({ name: safe, source: fs.readFileSync(f, 'utf8') }));
    }
    if (p === '/api/translate' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const source = String(body.source || '');
      const target = String(body.target || 'بايثون');
      if (!source.trim()) return send(res, 400, JSON.stringify({ ok: false, reason: 'لا يوجد كود عربي لترجمته.' }));
      const run = body.run !== false;
      const started = Date.now();
      const r = api.translateReport(source, target, { file: body.file || 'المحرّر.zy', verify: true, run, compare: run });
      const payload = {
        ok: r.ok,
        reason: r.reason || null,
        target: r.target, label: r.label, ext: r.ext,
        code: r.code,
        unsupported: r.unsupported || [],
        notes: r.notes || [],
        diagnostics: (r.diagnostics || []).map((d) => ({ code: d.code, message: d.message, line: d.line, col: d.col, severity: d.severity, suggestion: d.suggestion })),
        verification: r.verification ? {
          verified: r.verification.verified,
          tier: r.verification.tier,
          structural: r.verification.structural ? {
            verified: r.verification.structural.verified,
            ok: r.verification.structural.ok,
            grammar: r.verification.structural.grammar,
            note: r.verification.structural.note || '',
            errors: (r.verification.structural.errors || []).slice(0, 6),
          } : null,
          summary: r.verification.summary,
          syntaxOk: r.verification.syntax.ok,
          syntaxOutput: (r.verification.syntax.output || '').slice(0, 2000),
          kind: r.verification.kind,
          ran: r.verification.run.ran,
          runOk: r.verification.run.ok,
          tool: r.verification.run.tool,
          stdout: (r.verification.run.stdout || '').slice(0, 4000),
          stderr: (r.verification.run.stderr || '').slice(0, 2000),
        } : null,
        reference: r.reference ? { match: r.reference.match } : null,
        ms: Date.now() - started,
      };
      return send(res, 200, JSON.stringify(payload));
    }
    return send(res, 404, JSON.stringify({ error: 'مسار غير معروف' }));
  } catch (err) {
    return send(res, 500, JSON.stringify({ ok: false, reason: String(err && err.message ? err.message : err) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`زيتونة — واجهة الترجمة تعمل على http://${HOST}:${PORT}`);
  console.log('اختر لغة من القائمة، اكتب كودًا عربيًا، ثم اضغط «ترجم».');
});
