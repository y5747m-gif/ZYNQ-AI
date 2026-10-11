'use strict';

// ==========================================================================
//  زيتونة — التحقق الخارجي متعدد اللغات
//  الهدف: لا تُقبل أي «إصلاحات» إلا بعد التحقق من المترجم/المفسّر الحقيقي.
//  اللغات والمدقّقات معرّفة في src/languages.js، وهذا الملف ينفّذها:
//    node --check · py_compile · مترجم زيتونة · tsc · javac · gofmt · rustc
//    php -l · ruby -c · bash -n · perl -c · gcc/g++ -fsyntax-only · swiftc · kotlinc
//  وقاعدة الصدق: إن لم يوجد المدقّق على الجهاز ⇒ نقول ذلك ولا نعلن «نجاحًا».
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { LANGS, LANG_LABEL, detectLang, langInfo } = require('./languages');

const DEFAULT_TIMEOUT = 60000;

// ------------------------------------------------------------------ أدوات
const TOOL_CACHE = new Map();

/** هل الأداة موجودة؟ يعيد مسارها التنفيذي أو null */
function resolveTool(tools) {
  for (const t of tools) {
    if (TOOL_CACHE.has(t)) {
      const hit = TOOL_CACHE.get(t);
      if (hit) return { name: t, path: hit };
      continue;
    }
    let found = null;
    try {
      const r = spawnSync('bash', ['-c', 'command -v "$1"', '-', t], { encoding: 'utf8', timeout: 5000 });
      const p = (r.stdout || '').trim().split('\n')[0];
      if (r.status === 0 && p) found = p;
    } catch (_) { /* تجاهل */ }
    TOOL_CACHE.set(t, found);
    if (found) return { name: t, path: found };
  }
  return null;
}

function tmpFile(ext, content) {
  const p = path.join(os.tmpdir(), `zaytuna-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function tmpDir() {
  const d = path.join(os.tmpdir(), `zaytuna-out-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function rm(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }

function sniffJsModule(code) { return /^[ \t]*(import|export)\b/m.test(code); }

/** امتداد مناسب لكتابة نصّ بلغة معيّنة على القرص للتحقق */
function extFor(lang) {
  const info = LANGS[lang];
  return (info && info.exts[0]) || '.txt';
}

// -------------------------------------------------- أوامر المدقّقات الحقيقية
/** يبني أمر المدقّق للّغة المعيّنة، أو يشرح لماذا لا يمكن التحقق */
function buildCommand(lang, file) {
  const info = langInfo(lang);
  const v = info.verifier;

  if (v.internal) return { internal: true, kind: v.kind };

  if (v.none) {
    return { unverified: true, kind: 'بلا مدقّق', note: v.none };
  }

  if (v.needsProject) {
    const tool = resolveTool(v.tools);
    return {
      unverified: true,
      kind: v.kind,
      note: tool
        ? `«${v.tools[0]}» موجود، لكن التحقق الحقيقي يحتاج مشروعًا مهيّأً (ملف مشروع/إعداد) — ولا نُعطي نتيجة مضلّلة على ملف منفرد.`
        : `لم أجد ${v.tools.join('/')} — لم أتحقق من الملف${v.install ? ` (لتثبيته: ${v.install})` : ''}.`,
    };
  }

  const tool = resolveTool(v.tools);

  // خاصية جو: gofmt هو المدقّق الصحيح؛ وإن لم يوجد نبحث عنه داخل GOROOT
  if (lang === 'go') {
    if (tool && tool.name === 'gofmt') return { cmd: tool.path, args: ['-e', file], kind: v.kind };
    if (tool && tool.name === 'go') {
      try {
        const g = spawnSync(tool.path, ['env', 'GOROOT'], { encoding: 'utf8', timeout: 10000 });
        const cand = path.join((g.stdout || '').trim(), 'bin', 'gofmt');
        if (fs.existsSync(cand)) return { cmd: cand, args: ['-e', file], kind: v.kind };
      } catch (_) { /* تجاهل */ }
    }
    return {
      unverified: true, kind: v.kind,
      note: tool
        ? 'وجدت «go» لكن لم أجد gofmt (مدقّق البنية) — لم أتحقق من الملف.'
        : `لم أجد ${v.tools.join('/')} — لم أتحقق من الملف (لتثبيته: ${v.install}).`,
    };
  }

  if (!tool) {
    return {
      unverified: true, kind: 'بلا مدقّق',
      note: `لم أجد المدقّق «${v.tools[0]}» (${info.label}) — لم أتحقق من الملف${v.install ? ` · للتثبيت: ${v.install}` : ''}.`,
    };
  }

  switch (lang) {
    case 'ts':
      return {
        cmd: tool.path, kind: v.kind, timeout: 90000,
        args: ['--noEmit', '--pretty', 'false', '--skipLibCheck', '--target', 'esnext', '--module', 'esnext', '--moduleResolution', 'bundler', file],
        post: 'tsSyntaxOnly',
      };
    case 'java': {
      // javac يفرض أن يطابق اسم الملف اسم الصنف العام ⇒ ننسخه إلى مجلد مؤقت بالاسم الصحيح
      const out = tmpDir();
      let local = file;
      try {
        const src = fs.readFileSync(file, 'utf8');
        const m = src.match(/\b(?:class|interface|enum|record)\s+([\p{L}\p{M}\p{Nd}_$]+)/u);
        if (m) {
          local = path.join(out, `${m[1]}.java`);
          fs.writeFileSync(local, src, 'utf8');
        }
      } catch (_) { /* تجاهل: نختبر الملف كما هو */ }
      return { cmd: tool.path, kind: v.kind, args: ['-proc:none', '-nowarn', '-d', out, local], cleanup: out };
    }
    case 'rs': {
      const out = tmpDir();
      return { cmd: tool.path, kind: v.kind, args: ['--edition', '2021', '--crate-type', 'lib', '--emit=metadata', '-o', path.join(out, 'out.rmeta'), file], cleanup: out };
    }
    case 'c':
      return { cmd: tool.path, kind: v.kind, args: ['-fsyntax-only', '-x', 'c', file] };
    case 'cpp':
      return { cmd: tool.path, kind: v.kind, args: ['-fsyntax-only', '-x', 'c++', file] };
    case 'php': return { cmd: tool.path, kind: v.kind, args: ['-l', file] };
    case 'rb': return { cmd: tool.path, kind: v.kind, args: ['-c', file] };
    case 'sh': return { cmd: tool.path, kind: v.kind, args: ['-n', file] };
    case 'pl': return { cmd: tool.path, kind: v.kind, args: ['-c', file], note: 'تنبيه: «perl -c» يفحص البنية لكنه ينفّذ كتل BEGIN إن وُجدت.' };
    case 'swift': return { cmd: tool.path, kind: v.kind, args: ['-parse', file] };
    case 'kt': { const out = tmpDir(); return { cmd: tool.path, kind: v.kind, args: ['-nowarn', file, '-d', out], timeout: 150000, cleanup: out }; }
    default: return { unverified: true, kind: 'بلا مدقّق', note: 'لا مدقّق معرّف لهذه اللغة بعد.' };
  }
}

/**
 * تشغيل المدقّق الحقيقي للغة معيّنة.
 * @returns {{ok:boolean, verified:boolean, output:string, kind:string, note?:string}}
 */
function runChecker(filePath, lang, opts = {}) {
  try {
    // جافاسكربت: node --check على نسخة بالامتداد الصحيح (ESM/CJS)
    if (lang === 'js') {
      const code = fs.readFileSync(filePath, 'utf8');
      const esm = sniffJsModule(code);
      const tmp = tmpFile(esm ? '.mjs' : '.cjs', code);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: DEFAULT_TIMEOUT });
      rm(tmp);
      if (r.error) return { ok: false, verified: false, output: String(r.error.message), kind: 'node --check' };
      return {
        ok: r.status === 0,
        verified: true,
        output: (r.stderr || '') + (r.stdout || ''),
        kind: esm ? 'node --check (ESM)' : 'node --check (CJS)',
      };
    }

    // بايثون: py_compile (ترجمة بلا تنفيذ)
    if (lang === 'py') {
      const pyc = path.join(os.tmpdir(), `zaytuna-${process.pid}-${Date.now()}.pyc`);
      const script = 'import py_compile,sys; py_compile.compile(sys.argv[1], cfile=sys.argv[2], doraise=True)';
      const py = resolveTool(['python3', 'python']);
      if (!py) return { ok: true, verified: false, output: '', kind: 'بلا مدقّق', note: 'لم أجد python3 — لم أتحقق من الملف.' };
      const r = spawnSync(py.path, ['-c', script, filePath, pyc], { encoding: 'utf8', timeout: DEFAULT_TIMEOUT });
      rm(pyc);
      if (r.error) return { ok: false, verified: false, output: String(r.error.message), kind: 'py_compile' };
      return { ok: r.status === 0, verified: true, output: (r.stderr || '') + (r.stdout || ''), kind: 'py_compile' };
    }

    const built = buildCommand(lang, filePath);
    if (built.internal) {
      return {
        ok: true, verified: true, output: '', kind: built.kind,
        note: 'التحقق يتم بمترجم زيتونة نفسه (النتائج في التشخيصات أعلاه).',
      };
    }
    if (built.unverified) {
      return { ok: true, verified: false, output: '', kind: built.kind, note: built.note };
    }

    const r = spawnSync(built.cmd, built.args, { encoding: 'utf8', timeout: built.timeout || DEFAULT_TIMEOUT });
    if (built.cleanup) rm(built.cleanup);
    if (r.error) {
      return { ok: false, verified: true, output: String(r.error.message), kind: built.kind, note: built.note };
    }
    let output = (r.stderr || '') + (r.stdout || '');
    let ok = r.status === 0;
    let note = built.note;

    // تايبسكربت: نفصل أخطاء البنية (TS1xxx) عن تحذيرات المشروع/الوحدات (لا تُفشل الفحص)
    if (built.post === 'tsSyntaxOnly') {
      const lines = output.split('\n').filter((l) => /error TS\d+/.test(l));
      const syntax = lines.filter((l) => {
        const m = l.match(/error TS(\d+)/);
        return m && Number(m[1]) < 2000;
      });
      const soft = lines.filter((l) => !syntax.includes(l));
      output = syntax.concat(soft).join('\n');
      if (syntax.length) ok = false;
      note = syntax.length
        ? 'أخطاء بنية تايبسكربت (TS1xxx) — هذه التي نُصلحها.'
        : (soft.length ? `لا أخطاء بنية؛ تجاهلنا ${soft.length} رسالة نوعية/وحدات تحتاج إعداد مشروع.` : 'لا أخطاء بنية.');
    }

    return { ok, verified: true, output, kind: built.kind, note };
  } catch (err) {
    return { ok: false, verified: false, output: String(err && err.message), kind: 'خطأ في تشغيل المدقّق' };
  }
}

/** التحقق من نصّ (بلا ملف على القرص): يُستخدم قبل أي كتابة إصلاح */
function verifyText(text, lang, opts = {}) {
  if (lang === 'zy') {
    const { parse } = require('./parser');
    const { transpile } = require('./transpiler');
    try {
      const { ast } = parse(text, { file: opts.file || '<تحقق>' });
      transpile(ast);
      return { ok: true, verified: true, output: '', kind: 'مترجم زيتونة' };
    } catch (err) {
      return { ok: false, verified: true, output: err && err.message ? String(err.message) : String(err), kind: 'مترجم زيتونة' };
    }
  }
  const tmp = tmpFile(extFor(lang), text);
  const r = runChecker(tmp, lang, opts);
  rm(tmp);
  return r;
}

// ---- ترجمة رسائل المترجمين إلى العربية (اقتراحات مفهومة) ----
const JS_RULES = [
  { re: /Invalid or unexpected token/i, ar: 'رمز غير متوقع — أشيع أسبابه: رقم عربي/هندي في عدد، أو ترقيم عربي (، ؛ ؟ ٫)، أو علامة تنصيص غير مقفلة.' },
  { re: /Illegal character/i, ar: 'حرف غير مسموح به في الكود.' },
  { re: /Unexpected token '?(.+?)'?/i, ar: 'رمز غير متوقع — قد يكون فاصلة أو قوسًا زائدًا/ناقصًا.' },
  { re: /missing \)\)? after argument list/i, ar: 'قوس ناقص «)» في قائمة الوسائط.' },
  { re: /Unexpected end of input/i, ar: 'الملف غير مكتمل — قوس أو كتلة { } غير مغلقة.' },
  { re: /Identifier '(.+)' has already been declared/i, ar: 'الاسم «$1» معرّف مرتين في نفس النطاق.' },
  { re: /Unexpected reserved word/i, ar: 'كلمة محجوزة استُخدمت في موضع خاطئ.' },
];

const PY_RULES = [
  { re: /invalid character '(.)' \(U\+([0-9A-Fa-f]+)\)/i, ar: 'حرف غير مسموح به في بايثون: «$1» (U+$2) — الأرقام العربية والترقيم العربي لا تصلح في الكود.' },
  { re: /unterminated string literal/i, ar: 'نص غير مغلق — نهاية السطر قبل علامة الإغلاق.' },
  { re: /IndentationError|expected an indented block/i, ar: 'خطأ في الإزاحة (المسافات البادئة) — بايثون حسّاس جدًا لها.' },
  { re: /Missing parentheses in call to '([^']+)'/i, ar: 'قوس ناقص في نداء «$1».' },
  { re: /invalid syntax/i, ar: 'بنية غير صحيحة — راجع السطر والعمود المذكورين.' },
  { re: /expected ':'/i, ar: 'نقطتان «:» ناقصتان.' },
  { re: /unexpected indent/i, ar: 'إزاحة غير متوقعة في بداية السطر.' },
  { re: /non-ASCII character/i, ar: 'حرف غير آسكي في ملف بايثون 2 — تأكّد من الترميز أو استخدم بايثون 3.' },
];

const C_RULES = [
  { re: /'[^']*?\\U0*([0-9A-Fa-f]{2,6})[^']*?'?\s*(?:undeclared|was not declared)/i, ar: 'حرف عربي في موضع لا تفهمه اللغة (U+$1) — الأرقام الهندية والترقيم العربي لا تصلح في الكود.' },
  { re: /stray '(\\\\?[0-7]{2,3}|.)'/i, ar: 'حرف غريب في الكود: «$1» — أشيعه رقم هندي أو ترقيم عربي في موضع لا تفهمه اللغة.' },
  { re: /expected ['‘]?[;)]*(?: before| at end)/i, ar: 'رمز ناقص (فاصلة منقوطة أو قوس) قبل الموضع المشار إليه.' },
  { re: /extended character is not valid in an identifier/i, ar: 'حرف ممتد غير مسموح في اسم — جرّب أسماء لاتينية أو حدّث المترجم.' },
  { re: /invalid suffix|invalid digit/i, ar: 'لاحقة أو رقم غير صحيح في عدد — تحقّق من الأرقام العربية (٥ ≠ 5).' },
  { re: /error: (.+)/i, ar: 'خطأ من المترجم: $1' },
];

const GENERIC_RULES = [
  { re: /Unrecognized character/i, ar: 'حرف غير مسموح به في هذه اللغة (غالبًا حرف عربي) — أشيعه: رقم هندي أو ترقيم عربي داخل الكود.' },
  { re: /invalid character '(.)'/i, ar: 'حرف غير مسموح به في هذه اللغة: «$1».' },
  { re: /invalid character|illegal character/i, ar: 'حرف غير مسموح به في هذه اللغة (غالبًا رقم عربي أو ترقيم عربي داخل الكود).' },
  { re: /syntax error[,:]?\s*(.*)/i, ar: 'خطأ بنية: $1' },
  { re: /unexpected token|unexpected symbol|unterminated/i, ar: 'رمز غير متوقع أو نص غير مغلق.' },
  { re: /undefined (variable|method|name)/i, ar: 'اسم غير معرّف.' },
];

function rulesFor(lang) {
  if (lang === 'js' || lang === 'ts') return JS_RULES;
  if (lang === 'py') return PY_RULES;
  if (['c', 'cpp', 'java', 'cs', 'go', 'rs', 'swift', 'kt'].includes(lang)) return C_RULES.concat(GENERIC_RULES);
  return GENERIC_RULES;
}

/** تحويل مخرجات المدقّق الأجنبي إلى جمل عربية مفيدة (مع الحفاظ على الأصل) */
function arabizeCheckerOutput(lang, output) {
  if (!output) return [];
  const hits = [];
  for (const r of rulesFor(lang)) {
    const m = output.match(r.re);
    if (m) hits.push({ ar: r.ar.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? ''), raw: m[0] });
  }
  if (!hits.length) hits.push({ ar: 'فشل التحقق — تفاصيل المترجم بالأسفل.', raw: output.trim().split('\n')[0] });
  return hits;
}

/** استخراج (سطر، عمود) من مخرجات المدقّق إن أمكن */
function extractPosition(lang, output) {
  if (!output) return null;
  // نود:  مسار/الملف.mjs:12   (بلا عمود)
  const nodeLine = output.match(/\.(?:c|m)?js:(\d+)\s*$/m);
  if (nodeLine) return { line: Number(nodeLine[1]), col: 1 };
  // تايبسكربت:  الملف.ts(3,5): error TS...
  const ts = output.match(/\((\d+),(\d+)\)/);
  if (ts) return { line: Number(ts[1]), col: Number(ts[2]) };
  // gcc/g++/gofmt/rustc/javac/ruby:  الملف:3:5:
  const lc = output.match(/[^\s:(]+:(\d+):(\d+)/);
  if (lc) return { line: Number(lc[1]), col: Number(lc[2]) };
  // rustc:  --> الملف:3:5
  const arrow = output.match(/-->\s*([^\s:]+):(\d+):(\d+)/);
  if (arrow) return { line: Number(arrow[2]), col: Number(arrow[3]) };
  // بايثون/شل/بيرل/بي إتش بي:  line 3  ·  on line 3  (+ أحيانًا near column 9)
  const py = output.match(/line[: ]+(\d+)/i);
  if (py) {
    const col = output.match(/near column (\d+)/i);
    return { line: Number(py[1]), col: col ? Number(col[1]) : 1 };
  }
  return null;
}

module.exports = {
  detectLang,
  LANG_LABEL,
  runChecker,
  verifyText,
  arabizeCheckerOutput,
  extractPosition,
  resolveTool,
};
