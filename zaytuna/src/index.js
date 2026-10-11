'use strict';

// ==========================================================================
//  زيتونة — الواجهة البرمجية الموحّدة
//  تُستخدم من الطرفية (bin/zaytuna.js) ومن أي محرر/إضافة لاحقًا (LSP).
// ==========================================================================

const fs = require('fs');
const { parse } = require('./parser');
const { transpile } = require('./transpiler');
const { scanText } = require('./security');
const { fixText } = require('./fixer');
const { detectLang, runChecker, verifyText, arabizeCheckerOutput, extractPosition, LANG_LABEL } = require('./checkers');
const { translateTo, findTarget, listTargets } = require('./targets');
const { verifyOutput, runProgram, sameOutput } = require('./targets/verify');

const isFat = (d) => d.severity === 'error' || d.severity === 'security';

/** ترجمة نص زيتونة إلى جافاسكربت + خريطة أسطر */
function compile(source, opts = {}) {
  const diagnostics = [];
  try {
    const { ast } = parse(source, { file: opts.file, diagnostics });
    const { code, map } = transpile(ast, { types: !!opts.types });
    return { ok: true, code, map, diagnostics: dedupe(diagnostics) };
  } catch (err) {
    if (err && err.isZaytunaError) {
      diagnostics.push(err.toDiagnostic());
      return { ok: false, code: null, map: null, diagnostics: dedupe(diagnostics), error: err };
    }
    throw err;
  }
}

function dedupe(diags) {
  const seen = new Set();
  const out = [];
  for (const d of diags) {
    const key = `${d.code}|${d.line}|${d.col}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** فحص نصّي لأي لغة مدعومة (بدون تشغيل مدقّق خارجي) */
function checkSource(source, opts = {}) {
  const lang = opts.lang || 'zy';
  const file = opts.file || '<ذاكرة>';
  let diagnostics = [];
  if (lang === 'zy') {
    diagnostics = scanText(source, { lang: 'zy' });
    const res = compile(source, { file });
    diagnostics = diagnostics.concat(res.diagnostics);
  } else {
    diagnostics = scanText(source, { lang });
  }
  diagnostics = dedupe(diagnostics);
  return { lang, diagnostics, ok: !diagnostics.some(isFat) };
}

/** فحص ملف: فحوص زيتونة + مدقّق اللغة الحقيقي (تحقق خارجي) */
function checkFile(filePath, opts = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const lang = opts.lang || detectLang(filePath);
  const res = checkSource(source, { lang, file: filePath });
  const external = runChecker(filePath, lang);
  if (!external.ok) {
    const pos = extractPosition(lang, external.output) || { line: 1, col: 1 };
    const arab = arabizeCheckerOutput(lang, external.output);
    res.diagnostics.push({
      severity: 'error',
      code: 'Z401',
      message: arab[0].ar,
      line: pos.line,
      col: pos.col,
      length: 1,
      hint: 'من مدقّق اللغة: ' + arab[0].raw,
    });
  }
  res.diagnostics = dedupe(res.diagnostics);
  res.external = external;
  res.ok = !res.diagnostics.some(isFat) && external.ok;
  return res;
}

/** إصلاح نصّي (مستوى 0 أو 1) مع فحص ما تبقّى */
function fix(source, opts = {}) {
  return fixText(source, opts);
}

/**
 * ترجمة نصّ زيتونة إلى لغة هدف (زر الترجمة).
 * @param {string} source نصّ زيتونة
 * @param {string} target اسم اللغة (عربي أو إنجليزي: «بايثون» · py · Python …)
 */
function translate(source, target, opts = {}) {
  const t = findTarget(target);
  if (!t) {
    return {
      ok: false, reason: `لغة هدف غير معروفة: «${target}». المتاح: ${listTargets().filter((x) => !x.planned).map((x) => x.label).join('، ')}.`,
      targets: listTargets(),
    };
  }
  const diagnostics = [];
  try {
    const { ast } = parse(source, { file: opts.file, diagnostics });
    const r = translateTo(ast, target, opts);
    return { ...r, target: t.id, diagnostics: dedupe(diagnostics) };
  } catch (err) {
    if (err && err.isZaytunaError) {
      return { ok: false, code: null, unsupported: [], notes: [], map: null, target: t.id, label: t.label, ext: t.ext, reason: err.message, diagnostics: dedupe(diagnostics.concat([err.toDiagnostic()])) };
    }
    throw err;
  }
}

/**
 * تقرير ترجمة كامل: مخرج + تحقق حقيقي (بنية + تشغيل) + مقارنة بجافاسكربت.
 * لا نقول «تحقّق» إلا إذا نجح مدقّق/مترجم حقيقي.
 */
function translateReport(source, target, opts = {}) {
  const res = translate(source, target, opts);
  if (!res.ok) return res;
  const doVerify = opts.verify !== false;
  if (!doVerify) return res;
  const verification = verifyOutput(res.code, res.target, { runProgram: opts.run !== false, timeout: opts.timeout });
  let reference = null;
  if (opts.compare !== false && res.target !== 'js' && opts.run !== false) {
    const js = translate(source, 'js', opts);
    if (js.ok) {
      const jsRun = runProgram(js.code, 'js', { timeout: opts.timeout });
      if (jsRun.ran && jsRun.ok && verification.run.ran) {
        reference = { ran: true, match: sameOutput(jsRun.stdout, verification.run.stdout), jsStdout: jsRun.stdout, outStdout: verification.run.stdout };
      }
    }
  }
  return { ...res, verification, reference };
}

module.exports = {
  compile,
  checkSource,
  checkFile,
  fix,
  scanText,
  detectLang,
  runChecker,
  verifyText,
  LANG_LABEL,
  translate,
  translateReport,
  listTargets,
  findTarget,
};
