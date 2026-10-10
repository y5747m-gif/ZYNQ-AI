'use strict';

// ==========================================================================
//  زيتونة — التحقق الخارجي متعدد اللغات
//  الهدف: لا تُقبل أي «إصلاحات» إلا بعد التحقق من المترجم/المفسّر الحقيقي.
//  المدعوم اليوم: جافاسكربت/نود (node --check) · بايثون (py_compile) · زيتونة.
//  قابل للتوسيع: أضف مدقّقًا جديدًا في CHECKERS.
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const EXT_LANG = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
  '.ts': 'ts', '.tsx': 'ts',
  '.py': 'py',
  '.zy': 'zy',
};

function detectLang(filePath) {
  return EXT_LANG[path.extname(filePath).toLowerCase()] || 'unknown';
}

const LANG_LABEL = { js: 'جافاسكربت', ts: 'تايبسكربت', py: 'بايثون', zy: 'زيتونة', unknown: 'غير معروفة' };

function sniffJsModule(code) {
  return /^[ \t]*(import|export)\b/m.test(code);
}

function tmpFile(ext, content) {
  const p = path.join(os.tmpdir(), `zaytuna-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

/**
 * تشغيل المدقّق الحقيقي للغة.
 * @returns {{ok:boolean, output:string, note?:string, kind:string}}
 */
function runChecker(filePath, lang) {
  try {
    if (lang === 'js') {
      const code = fs.readFileSync(filePath, 'utf8');
      const tmp = tmpFile(sniffJsModule(code) ? '.mjs' : '.cjs', code);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      fs.unlinkSync(tmp);
      return { ok: r.status === 0, output: (r.stderr || '') + (r.stdout || ''), kind: sniffJsModule(code) ? 'node --check (ESM)' : 'node --check (CJS)' };
    }
    if (lang === 'py') {
      const pyc = path.join(os.tmpdir(), `zaytuna-${process.pid}-${Date.now()}.pyc`);
      const script = 'import py_compile,sys; py_compile.compile(sys.argv[1], cfile=sys.argv[2], doraise=True)';
      const r = spawnSync('python3', ['-c', script, filePath, pyc], { encoding: 'utf8' });
      try { fs.unlinkSync(pyc); } catch (_) {}
      return { ok: r.status === 0, output: (r.stderr || '') + (r.stdout || ''), kind: 'py_compile' };
    }
    if (lang === 'zy') {
      // التحقق يتم بمترجم زيتونة نفسه (يُنفّذ في index.js قبل الاستدعاء)
      return { ok: true, output: '', kind: 'مترجم زيتونة', note: 'الملف مكتوب بلغة زيتونة — التحقق داخلي.' };
    }
    if (lang === 'ts') {
      const has = spawnSync('tsc', ['--version'], { encoding: 'utf8' });
      if (has.status === 0) {
        return { ok: true, output: '', kind: 'tsc', note: 'لو حُدّد tsc: يحتاج مشروعًا مهيّأً (tsconfig) للتحقق الكامل — نتخطّاه هنا كي لا نُعطي نتيجة مضلّلة.' };
      }
      return { ok: true, output: '', kind: 'بلا مدقّق', note: 'tsc غير متاح في هذه البيئة — تم إجراء فحوص Unicode والترقيم فقط.' };
    }
    return { ok: true, output: '', kind: 'بلا مدقّق', note: 'لغة غير مدعومة بعد — الفحوص العامة (Unicode/ترقيم) فقط.' };
  } catch (err) {
    return { ok: false, output: String(err && err.message), kind: 'خطأ في تشغيل المدقّق' };
  }
}

// ---- ترجمة رسائل المترجمين إلى العربية (اقتراحات مفهومة) ----
const JS_RULES = [
  { re: /Invalid or unexpected token/i, ar: 'رمز غير متوقع — أشيع أسبابه: رقم عربي/هندي في عدد، أو ترقيم عربي (، ؛ ؟ ٫)، أو علامة تنصيص غير مقفلة.' },
  { re: /Illegal character/i, ar: 'حرف غير مسموح به في الكود.' },
  { re: /Unexpected token '?(.+?)'?/i, ar: 'رمز غير متوقع — قد يكون فاصلة أو قوسًا زائدًا/ناقصًا.' },
  { re: /missing \) after argument list/i, ar: 'قوس ناقص «)» في قائمة الوسائط.' },
  { re: /Unexpected end of input/i, ar: 'الملف غير مكتمل — قوس أو كتلة { } غير مغلقة.' },
  { re: /Identifier '(.+)' has already been declared/i, ar: 'الاسم «$1» معرّف مرتين في نفس النطاق.' },
  { re: /Unexpected reserved word/i, ar: 'كلمة محجوزة استُخدمت في موضع خاطئ.' },
];

const PY_RULES = [
  { re: /invalid character '(.)' \(U\+([0-9A-Fa-f]+)\)/i, ar: 'حرف غير مسموح به في بايثون: «$1» (U+$2) — الأرقام العربية والترقيم العربي لا تصلح في الكود.' },
  { re: /unterminated string literal/i, ar: 'نص غير مغلق — نهاية السطر قبل علامة الإغلاق.' },
  { re: /IndentationError/i, ar: 'خطأ في الإزاحة (المسافات البادئة) — بايثون حسّاس جدًا لها.' },
  { re: /Missing parentheses in call to '([^']+)'/i, ar: 'قوس ناقص في نداء «$1».' },
  { re: /invalid syntax/i, ar: 'بنية غير صحيحة — راجع السطر والعمود المذكورين.' },
  { re: /expected ':'/i, ar: 'نقطتان «:» ناقصتان.' },
  { re: /unexpected indent/i, ar: 'إزاحة غير متوقعة في بداية السطر.' },
];

/** تحويل مخرجات المدقّق الأجنبي إلى جمل عربية مفيدة (مع الحفاظ على الأصل) */
function arabizeCheckerOutput(lang, output) {
  if (!output) return [];
  const rules = lang === 'py' ? PY_RULES : JS_RULES;
  const hits = [];
  for (const r of rules) {
    const m = output.match(r.re);
    if (m) hits.push({ ar: r.ar.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? ''), raw: m[0] });
  }
  if (!hits.length) hits.push({ ar: 'فشل التحقق — تفاصيل المترجم بالأسفل.', raw: output.trim().split('\n')[0] });
  return hits;
}

/** استخراج (سطر، عمود) من مخرجات المدقّق إن أمكن */
function extractPosition(lang, output) {
  if (!output) return null;
  if (lang === 'py') {
    const py = output.match(/line (\d+)/i);
    return py ? { line: Number(py[1]), col: 1 } : null;
  }
  // نود يطبع:  مسار/الملف.js:12   (بلا عمود)
  const nodeLine = output.match(/\.(?:c|m)?js:(\d+)\s*$/m);
  if (nodeLine) return { line: Number(nodeLine[1]), col: 1 };
  const withCol = output.match(/\((\d+):(\d+)\)/);
  if (withCol) return { line: Number(withCol[1]), col: Number(withCol[2]) };
  const pyLike = output.match(/line (\d+)/i);
  return pyLike ? { line: Number(pyLike[1]), col: 1 } : null;
}

module.exports = { detectLang, runChecker, arabizeCheckerOutput, extractPosition, LANG_LABEL };
