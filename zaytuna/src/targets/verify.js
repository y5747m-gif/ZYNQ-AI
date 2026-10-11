'use strict';

// ==========================================================================
//  زيتونة — التحقق من المخرجات المترجمة
//  قاعدتان ثابتتان:
//    1) لا نقول «تحقّقنا» إلا إذا شُغّل مدقّق/مترجم حقيقي ونجح.
//    2) نستطيع تشغيل المخرج فعلًا (بايثون، سي++، جافاسكربت…) فنقارن النتيجة
//       بمخرج جافاسكربت — وهذا أقوى دليل على أن الترجمة أمينة.
//  وإن غاب المترجم عن الجهاز نقول صريحًا: لم نتحقق.
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { verifyText } = require('../checkers');
const { TARGETS } = require('./index');
const { structuralCheck, structuralAvailable } = require('./parsecheck');

const RUNNERS = {
  js:   { tier: 'run', ext: '.mjs', build: (f) => ['node', [f]] },
  py:   { tier: 'run', ext: '.py',  build: (f) => ['python3', [f]] },
  rb:   { tier: 'run', ext: '.rb',  build: (f) => ['ruby', [f]] },
  php:  { tier: 'run', ext: '.php', build: (f) => ['php', [f]] },
  sh:   { tier: 'run', ext: '.sh',  build: (f) => ['bash', [f]] },
  pl:   { tier: 'run', ext: '.pl',  build: (f) => ['perl', [f]] },
  cpp:  { tier: 'compile', ext: '.cpp', build: (f, exe) => ['g++', ['-std=c++17', '-O0', '-o', exe, f]] },
  c:    { tier: 'compile', ext: '.c',   build: (f, exe) => ['gcc', ['-std=c11', '-O0', '-o', exe, f]] },
  rs:   { tier: 'compile', ext: '.rs',  build: (f, exe) => ['rustc', ['-O', '-o', exe, f]] },
  go:   { tier: 'compile', ext: '.go',  build: (f, exe) => ['go', ['build', '-o', exe, f]] },
  java: { tier: 'run', ext: '.java', build: (f) => ['java', [f]] },
};

function mkTmpDir() {
  const d = path.join(os.tmpdir(), `zaytuna-run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function rmDir(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

function which(name) {
  const r = spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8', timeout: 5000 });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/**
 * تشغيل كود مترجم فعلًا.
 * @returns {{attempted:boolean, ran:boolean, ok:boolean, tool:string|null, stdout:string,
 *            stderr:string, exitCode:number|null, note?:string, ms:number}}
 */
function runProgram(code, targetId, opts = {}) {
  const info = RUNNERS[targetId];
  const started = Date.now();
  if (!info) {
    return { attempted: false, ran: false, ok: false, tool: null, stdout: '', stderr: '', exitCode: null, note: 'لا طريقة تشغيل معروفة لهذه اللغة بعد.', ms: 0 };
  }
  if (opts.disabled) {
    return { attempted: false, ran: false, ok: false, tool: null, stdout: '', stderr: '', exitCode: null, note: 'التشغيل معطّل بطلب المستخدم.', ms: 0 };
  }
  const dir = mkTmpDir();
  const tool = info.build('x', 'exe')[0];
  if (!which(tool)) {
    rmDir(dir);
    return { attempted: true, ran: false, ok: false, tool, stdout: '', stderr: '', exitCode: null, note: `الأداة «${tool}» غير مثبّتة على هذا الجهاز — لم أُشغّل المخرج.`, ms: Date.now() - started };
  }
  const src = path.join(dir, `المخرج${info.ext}`);
  const exe = path.join(dir, 'المخرج.bin');
  const time = opts.timeout || 30000;
  try {
    fs.writeFileSync(src, code, 'utf8');
    if (info.tier === 'compile') {
      const [cmd, args] = info.build(src, exe);
      const build = spawnSync(cmd, args, { encoding: 'utf8', timeout: time });
      if (build.status !== 0) {
        return { attempted: true, ran: false, ok: false, tool: cmd, stdout: build.stdout || '', stderr: build.stderr || '', exitCode: build.status, note: `فشل التجميع بـ${cmd}.`, ms: Date.now() - started };
      }
      const run = spawnSync(exe, [], { encoding: 'utf8', timeout: time, input: opts.stdin || '' });
      return { attempted: true, ran: true, ok: run.status === 0, tool: cmd, stdout: run.stdout || '', stderr: run.stderr || '', exitCode: run.status, ms: Date.now() - started };
    }
    const [cmd, args] = info.build(src, exe);
    const run = spawnSync(cmd, args, { encoding: 'utf8', timeout: time, input: opts.stdin || '' });
    return { attempted: true, ran: true, ok: run.status === 0, tool: cmd, stdout: run.stdout || '', stderr: run.stderr || '', exitCode: run.status, ms: Date.now() - started };
  } catch (e) {
    return { attempted: true, ran: false, ok: false, tool, stdout: '', stderr: String(e && e.message ? e.message : e), exitCode: null, note: 'خطأ غير متوقع أثناء التشغيل.', ms: Date.now() - started };
  } finally {
    rmDir(dir);
  }
}

/**
 * تحقّق كامل من مخرج مترجم، بثلاث درجات صراحةً:
 *   1) «مترجم» — مدقّق/مترجم اللغة الحقيقي (ونُشغّل المخرج إن أمكن).
 *   2) «بنيوي» — لا مترجم على الجهاز، لكن القواعد النحوية الرسمية (tree-sitter) قبلت المخرج.
 *      وهذا **ليس** تحققًا بمترجم، ونقولها صريحة.
 *   3) «بلا تحقق» — نقول ذلك ولا نعلن نجاحًا.
 * @returns {{syntax, structural, run, verified, structuralVerified, tier, kind, summary}}
 */
function verifyOutput(code, targetId, opts = {}) {
  const t = TARGETS[targetId];
  const langForCheck = (t && t.verifierLang) || targetId;
  let syntax;
  try {
    syntax = verifyText(code, langForCheck, opts);
  } catch (e) {
    syntax = { ok: false, verified: false, output: String(e && e.message ? e.message : e), kind: 'مدقّق' };
  }
  const compilerTier = !!syntax.verified;
  let structural = null;
  if (!compilerTier && opts.structural !== false && structuralAvailable()) {
    structural = structuralCheck(code, targetId, opts);
  }
  const run = opts.runProgram === false
    ? { attempted: false, ran: false, ok: false, tool: null, stdout: '', stderr: '', exitCode: null, note: 'التشغيل لم يُطلب.', ms: 0 }
    : runProgram(code, targetId, opts);

  const verified = !!(compilerTier && syntax.ok);
  const structuralVerified = !!(structural && structural.verified && structural.ok);
  const tier = compilerTier ? 'compiler' : (structural && structural.verified ? 'structural' : 'none');

  const parts = [];
  if (compilerTier) parts.push(syntax.ok ? `فحص البنية بمترجم حقيقي (${syntax.kind}) ✅` : `فحص البنية بمترجم حقيقي فشل (${syntax.kind}) ❌`);
  else if (structural && structural.verified) {
    parts.push(structural.ok
      ? `فحص بنيوي بقواعد ${structural.grammar} (tree-sitter) ✅ — *لا يوجد مترجم لهذه اللغة على هذا الجهاز، وليس هذا تحققًا بمترجم*`
      : `فحص بنيوي بقواعد ${structural.grammar} فشل ❌`);
    if (structural.note && structural.ok) parts.push(structural.note);
  } else {
    parts.push(`لم نتحقق من البنية: ${(structural && structural.note) || syntax.note || 'لا مدقّق ولا قواعد متاحة'} ⚠`);
  }
  if (run.ran) parts.push(run.ok ? `التشغيل بـ${run.tool} نجح ✅` : `التشغيل بـ${run.tool} فشل (رمز ${run.exitCode}) ❌`);
  else if (run.attempted) parts.push(`لم نُشغّل المخرج: ${run.note} ⚠`);

  return { syntax, structural, run, verified, structuralVerified, executed: !!(run.ran && run.ok), tier, kind: syntax.kind, summary: parts.join(' · ') };
}

/** هل المخرجان متطابقان سلوكيًا؟ (تطابق نصّ المخرجات) */
function sameOutput(a, b) {
  const norm = (s) => String(s || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
  return norm(a) === norm(b);
}

module.exports = { runProgram, verifyOutput, sameOutput, RUNNERS };
