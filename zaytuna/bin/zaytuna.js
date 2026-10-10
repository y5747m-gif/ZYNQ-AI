#!/usr/bin/env node
'use strict';

// ==========================================================================
//  زيتونة — واجهة الطرفية
//  الاستخدام: zaytuna <أمر> <ملف> [خيارات]
//  الأوامر بالعربية والإنجليزية: بناء/ابنِ · تشغيل/شغّل · فحص/افحص ·
//  إصلاح/أصلح · شرح/اشرح · خريطة · اختبار · مساعدة · إصدار
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const api = require('../src/index');
const { runChecker, arabizeCheckerOutput, extractPosition } = require('../src/checkers');
const { detectLang, langInfo, LANG_LABEL, LANGS } = require('../src/languages');
const { formatAll, summaryLine, summarize, lineDiff, paint } = require('../src/diagnostics');
const { fixText } = require('../src/fixer');

const VERSION = require('../package.json').version;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

// ------------------------------------------------------------------ أدوات
function die(msg, code = 2) { console.error(paint('✖ ' + msg, 'error', useColor)); process.exit(code); }

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { flags[k] = argv[++i]; }
      else flags[k] = true;
    } else if (a === '-h') flags.help = true;
    else if (a === '-v') flags.version = true;
    else if (a === '-w') flags.write = true;
    else positional.push(a);
  }
  return { positional, flags };
}

function tmpPath(ext, content) {
  const p = path.join(os.tmpdir(), `zaytuna-${crypto.randomBytes(4).toString('hex')}${ext}`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function readSource(file) {
  if (!fs.existsSync(file)) die(`الملف غير موجود: ${file}`, 2);
  return fs.readFileSync(file, 'utf8');
}

function printDiagnostics(diags, source, file) {
  if (!diags.length) { console.log(paint(`✔ ${file}: لا مشاكل — نظيف.`, 'green', useColor)); return; }
  console.log(formatAll(diags, source, { useColor, file }));
}

// ------------------------------------------------------------------ الأوامر
function cmdBuild(file, flags) {
  const source = readSource(file);
  const res = api.compile(source, { file });
  printDiagnostics(res.diagnostics, source, file);
  if (!res.ok) return 1;
  const out = flags.out || file.replace(/\.zy$/, '') + '.js';
  fs.writeFileSync(out, res.code, 'utf8');
  if (flags.map) fs.writeFileSync(out + '.map.json', JSON.stringify(res.map, null, 2), 'utf8');
  console.log(paint(`✔ تمت الترجمة: ${out}`, 'green', useColor) + (flags.map ? ' (+ خريطة الأسطر)' : ''));
  if (flags.print) console.log('\n' + res.code);
  return 0;
}

function cmdRun(file, flags) {
  const source = readSource(file);
  const res = api.compile(source, { file });
  if (!res.ok) { printDiagnostics(res.diagnostics, source, file); return 1; }
  const tmp = tmpPath('.mjs', res.code);
  const r = spawnSync(process.execPath, [tmp], { stdio: 'inherit' });
  try { fs.unlinkSync(tmp); } catch (_) {}
  return r.status ?? 1;
}

function cmdCheck(file, flags) {
  const source = readSource(file);
  const lang = flags.lang || detectLang(file);
  const res = api.checkFile(file, { lang });
  if (flags.json) {
    console.log(JSON.stringify({
      file, lang, ok: res.ok,
      external: { kind: res.external.kind, ok: res.external.ok, note: res.external.note || null },
      diagnostics: res.diagnostics.map(({ severity, code, message, line, col, suggestion, hint }) => ({ severity, code, message, line, col, suggestion: suggestion || null, hint: hint || null })),
      summary: summarize(res.diagnostics),
    }, null, 2));
  } else {
    console.log(paint(`  اللغة: ${LANG_LABEL[lang] || lang}`, 'dim', useColor));
    printDiagnostics(res.diagnostics, source, file);
    if (res.external.note) console.log(paint('  ⓘ ' + res.external.note, 'dim', useColor));
    if (res.external.ok && !res.external.note && res.external.kind !== 'بلا مدقّق') {
      console.log(paint(`  ✔ التحقق الخارجي (${res.external.kind}): سليم.`, 'green', useColor));
    } else if (!res.external.ok) {
      const arab = arabizeCheckerOutput(lang, res.external.output);
      const pos = extractPosition(lang, res.external.output);
      console.log(paint(`  ✖ التحقق الخارجي (${res.external.kind}) فشل${pos ? ` عند السطر ${pos.line}:${pos.col}` : ''}: ${arab[0].ar}`, 'error', useColor));
      const rawLines = res.external.output.trim().split('\n').filter((l) => l.trim());
      const keyLine = rawLines.find((l) => /error|فشل|Error/.test(l)) || rawLines[0] || '';
      console.log(paint('     ' + keyLine.trim(), 'dim', useColor));
    }
  }
  return res.ok ? 0 : 1;
}

async function cmdFix(file, flags) {
  const source = readSource(file);
  const lang = flags.lang || detectLang(file);
  const tier = flags.tier !== undefined ? Number(flags.tier) : (flags.ai ? 2 : 0);
  console.log(paint(`  اللغة: ${LANG_LABEL[lang] || lang}${langInfo(lang).en ? ' (' + langInfo(lang).en + ')' : ''}`, 'dim', useColor));
  const before = api.checkSource(source, { lang, file });
  if (flags.verbose) printDiagnostics(before.diagnostics, source, file);
  else console.log(summaryLine(before.diagnostics, file, useColor));
  console.log('');

  let fixedText = source;
  let allApplied = [];

  if (tier <= 1) {
    const res = fixText(source, { lang, tier });
    fixedText = res.text;
    allApplied = res.applied;
    if (!res.changed) console.log(paint('ℹ لا إصلاحات حتمية في هذا الملف.', 'info', useColor));
    for (const a of res.applied) {
      console.log(paint(`  ✔ [${a.code}] سطر ${a.line}:${a.col} — ${a.why}`, 'green', useColor) + (a.from ? paint(`  («${a.from}» ← «${a.to}»)`, 'dim', useColor) : ''));
    }
    for (const s of res.skipped) console.log(paint(`  ⚠ [${s.code}] ${s.message}`, 'warning', useColor));
  } else {
    const { aiRepair, pickKey } = require('../src/ai');
    const attempts = Number(flags.attempts || 3);
    let current = source;
    let diags = before.diagnostics;
    let success = false;
    for (let i = 1; i <= attempts; i++) {
      console.log(paint(`⏳ محاولة إصلاح بالنموذج (${i}/${attempts})…`, 'info', useColor));
      const r = await aiRepair({ code: current, lang, diagnostics: diags, apiKey: pickKey({}), model: flags.model, attempt: i });
      if (!r.ok) { console.log(paint('  ✖ ' + r.error, 'error', useColor)); break; }
      const verify = api.verifyText(r.code, lang);
      if (!verify.verified) {
        console.log(paint(`  ✖ لا أستطيع التحقق من هذا الإصلاح (${verify.kind}): ${verify.note || 'لا مدقّق متاح'} — لا نطبّق إصلاحًا غير مُتحقّق منه.`, 'error', useColor));
        break;
      }
      if (verify.ok) {
        fixedText = r.code; success = true;
        console.log(paint('  ✔ إصلاح اجتاز التحقق.', 'green', useColor));
        break;
      }
      console.log(paint('  ⚠ الإصلاح لم يجتز التحقق — إعادة المحاولة مع الرسائل الجديدة.', 'warning', useColor));
      current = r.code;
      diags = api.checkSource(current, { lang }).diagnostics;
    }
    if (!success) {
      console.log(paint('✖ لم يُنتج النموذج إصلاحًا يجتاز التحقق. لم يُكتب أي تغيير (لا نطبّق إصلاحًا غير مُتحقّق منه).', 'error', useColor));
      return 1;
    }
  }

  if (fixedText !== source) {
    if (!flags.quiet) {
      console.log('\n' + paint('— الفرق —', 'bold', useColor));
      console.log(lineDiff(source, fixedText, useColor));
    }
    const verify = api.verifyText(fixedText, lang, { file });
    console.log('');
    if (verify.verified && verify.ok) console.log(paint(`✔ التحقق بعد الإصلاح (${verify.kind}): سليم.`, 'green', useColor));
    else if (verify.verified) console.log(paint('✖ التحقق بعد الإصلاح فشل — لا يُكتب الملف. راجع يدويًا.', 'error', useColor));
    else console.log(paint(`⚠ لم أستطع التحقق (${verify.kind}) — ${verify.note || 'لا مدقّق متاح'}`, 'warning', useColor));

    const after = api.checkSource(fixedText, { lang, file });
    console.log(summaryLine(after.diagnostics, 'بعد الإصلاح', useColor));

    if (flags.write) {
      if (!verify.verified && !flags['no-verify']) {
        console.log(paint('✖ لم أكتب الملف: القاعدة الذهبية — لا يُكتب إصلاح قبل اجتيازه مدقّق اللغة الحقيقي.', 'error', useColor));
        console.log(paint('  · ثبّت المدقّق ثم أعد المحاولة، أو استخدم --no-verify للمخاطرة الصريحة على مسؤوليتك.', 'dim', useColor));
        return 1;
      }
      if (!verify.verified) console.log(paint('⚠ كتابة بلا تحقق (--no-verify) — على مسؤوليتك.', 'warning', useColor));
      const bak = file + '.bak';
      fs.writeFileSync(bak, source, 'utf8');
      fs.writeFileSync(file, fixedText, 'utf8');
      console.log(paint(`✔ كُتب الملف: ${file} (نسخة احتياطية: ${bak})`, 'green', useColor));
    } else {
      console.log(paint('ℹ لم يُكتب شيء. أضف --write للتطبيق.', 'info', useColor));
    }
  }
  if (flags.json) {
    console.log(JSON.stringify({ file, lang, tier, applied: allApplied, changed: fixedText !== source }, null, 2));
  }
  return 0;
}

function cmdExplain(file) {
  const source = readSource(file);
  const res = api.compile(source, { file });
  if (!res.ok) { printDiagnostics(res.diagnostics, source, file); return 1; }
  const lines = res.code.split('\n');
  const { parse } = require('../src/parser');
  const parsed = parse(source, { file });
  const out = ['# شرح البرنامج بالعربية', ''];
  const describe = (node, indent) => {
    const pad = '  '.repeat(indent);
    const map = {
      VarDecl: `تعريف ${node.kind === 'const' ? 'ثابت' : 'متغيّر'}: ${node.decls.map((d) => `«${d.name}»`).join('، ')}`,
      FuncDecl: `تعريف دالة «${node.name}» بمعاملات (${node.params.join('، ')})`,
      ClassDecl: `تعريف صنف «${node.name}»${node.superClass ? ` يمتد من «${node.superClass}»` : ''}`,
      IfStmt: 'شرط «إذا»',
      WhileStmt: 'حلقة «طالما»',
      ForStmt: 'حلقة «كرر»',
      ForOfStmt: `حلقة «لكل» على العناصر باسم «${node.name}»`,
      SwitchStmt: `اختيار متعدد «اختر» بـ ${node.cases.length} حالة`,
      ReturnStmt: 'إرجاع قيمة',
      TryStmt: 'كتلة «جرب/التقط»',
      ExprStmt: 'تعبير',
      ImportStmt: 'استيراد وحدة',
      ThrowStmt: 'إطلاق خطأ',
      BreakStmt: 'خروج من الحلقة',
      ContinueStmt: 'متابعة الحلقة',
      Block: 'كتلة',
    };
    out.push(`${pad}• سطر ${node.line}: ${map[node.type] || node.type}`);
    if (node.type === 'FuncDecl' || node.type === 'ClassDecl' || node.type === 'IfStmt' || node.type === 'WhileStmt' || node.type === 'ForStmt' || node.type === 'ForOfStmt' || node.type === 'TryStmt') {
      const body = node.body?.body || node.consequent?.body || node.block?.body || [];
      for (const s of body) describe(s, indent + 1);
      if (node.alternate && node.alternate.body) for (const s of node.alternate.body.body) describe(s, indent + 1);
    }
  };
  for (const s of parsed.ast.body) describe(s, 0);
  out.push('', '# الجافاسكربت المولَّد (خروج بلا قفل)', '', '```js', res.code.trimEnd(), '```');
  console.log(out.join('\n'));
  return 0;
}

function cmdMap(file, flags) {
  const source = readSource(file);
  const res = api.compile(source, { file });
  if (!res.ok) { printDiagnostics(res.diagnostics, source, file); return 1; }
  if (flags.json) console.log(JSON.stringify(res.map, null, 2));
  else {
    console.log('خريطة الأسطر: سطر زيتونة ← سطر جافاسكربت');
    for (const m of res.map) if (m.arLine) console.log(`  ${String(m.arLine).padStart(4)} ← ${String(m.jsLine).padStart(4)}`);
  }
  return 0;
}

function cmdTest() {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tests', 'run.js')], { stdio: 'inherit' });
  return r.status ?? 1;
}

/** جدول اللغات لعرضه في «مساعدة» */
function langTable() {
  const rows = [];
  for (const [id, info] of Object.entries(LANGS)) {
    if (id === 'unknown') continue;
    const v = info.verifier || {};
    const how = v.internal ? 'مترجم زيتونة' : (v.none ? 'بلا تحقق' : (v.tools ? v.tools.join('/') : '—'));
    rows.push(`  ${info.label.padEnd(12)} ${(info.exts.join(' ')).padEnd(24)} ${how}`);
  }
  return rows.join('\n');
}

function help() {
  console.log(`
${paint('زيتونة', 'bold', useColor)} — لغة برمجة عربية + مصحّح أكواد تلقائي  (v${VERSION})

${paint('الاستخدام:', 'cyan', useColor)}  zaytuna <أمر> <ملف> [خيارات]

${paint('الأوامر:', 'cyan', useColor)}
  بناء | build <ملف.zy>      ترجمة زيتونة إلى جافاسكربت            [--out ملف] [--map] [--print]
  تشغيل | run <ملف.zy>       بناء ثم تشغيل البرنامج
  فحص | check <ملف>          تشخيص عربي مفصّل + تحقق من مدقّق اللغة      [--json] [--lang]
  إصلاح | fix <ملف>          إصلاح تلقائي        [--write] [--tier 0|1] [--ai] [--model م] [--json]
  شرح | explain <ملف.zy>     شرح البرنامج بالعربية مع الجافاسكربت المولَّد
  خريطة | map <ملف.zy>       خريطة الأسطر (زيتونة ← جافاسكربت)
  اختبار | test              تشغيل الاختبارات الذاتية
  مساعدة | help  ·  إصدار | version

${paint('مستويات الإصلاح:', 'cyan', useColor)}
  0 = حتمي وآمن (حروف مخفية، ترقيم وأرقام عربية، فاصلة عشرية)
  1 = + إعادة تسمية متسقة للأسماء المتشابهة
  2 = + نموذج لغوي (يحتاج ZAYTUNA_API_KEY) — ولا يُطبَّق أي إصلاح قبل اجتيازه التحقق

${paint('اللغات المدعومة (الفحص + الإصلاح):', 'cyan', useColor)}
${langTable()}

${paint('قاعدة ثابتة:', 'cyan', useColor)}
  لا يُكتب أي إصلاح قبل اجتيازه مدقّق اللغة الحقيقي — وإن لم يوجد المدقّق نقول ذلك ولا نكتب.
  (للكتابة بلا تحقق صريحًا: --no-verify)

${paint('أمثلة:', 'cyan', useColor)}
  zaytuna فحص examples/كود_به_أخطاء.js
  zaytuna إصلاح examples/كود_به_أخطاء.js --write
  zaytuna تشغيل examples/حاسبة.zy
`);
}

// ------------------------------------------------------------------ main
async function main() {
  const argv = process.argv.slice(2);
  const { positional, flags } = parseArgs(argv);
  if (flags.version || positional[0] === 'إصدار' || positional[0] === 'version') { console.log(VERSION); return 0; }
  if (flags.help || !positional.length || positional[0] === 'مساعدة' || positional[0] === 'help') { help(); return 0; }

  const cmd = positional[0];
  const file = positional[1];

  switch (cmd) {
    case 'بناء': case 'build':
      if (!file) die('حدّد ملفًا: zaytuna بناء ملف.zy');
      return cmdBuild(file, flags);
    case 'تشغيل': case 'run':
      if (!file) die('حدّد ملفًا: zaytuna تشغيل ملف.zy');
      return cmdRun(file, flags);
    case 'فحص': case 'check': case 'افحص':
      if (!file) die('حدّد ملفًا: zaytuna فحص ملف');
      return cmdCheck(file, flags);
    case 'إصلاح': case 'fix': case 'أصلح':
      if (!file) die('حدّد ملفًا: zaytuna إصلاح ملف');
      return cmdFix(file, flags);
    case 'شرح': case 'explain': case 'اشرح':
      if (!file) die('حدّد ملفًا: zaytuna شرح ملف.zy');
      return cmdExplain(file);
    case 'خريطة': case 'map':
      if (!file) die('حدّد ملفًا: zaytuna خريطة ملف.zy');
      return cmdMap(file, flags);
    case 'اختبار': case 'test':
      return cmdTest();
    default:
      die(`أمر غير معروف: «${cmd}». اكتب: zaytuna مساعدة`);
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(paint('✖ خطأ داخلي: ' + (err && err.stack || err), 'error', true));
  process.exit(3);
});
