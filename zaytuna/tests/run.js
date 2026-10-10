'use strict';

// ==========================================================================
//  زيتونة — الاختبارات الذاتية  (node tests/run.js)
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const api = require('../src/index');
const { fixText } = require('../src/fixer');
const { scanText } = require('../src/security');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; console.log('  ✔ ' + name); }
  catch (e) { failed++; failures.push({ name, message: e.message }); console.log('  ✘ ' + name + '\n      ' + e.message); }
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'قيمتان مختلفتان'}\n      المتوقع: ${JSON.stringify(expected)}\n      الفعلي:  ${JSON.stringify(actual)}`);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'التوقع: قيمة صحيحة'); }
function includes(hay, needle, msg) { if (!String(hay).includes(needle)) throw new Error(`${msg || 'لا يحتوي'}: ${needle}\n      النص: ${String(hay).slice(0, 400)}`); }
function tmp(ext, content) {
  const p = path.join(os.tmpdir(), `zt-${crypto.randomBytes(4).toString('hex')}${ext}`);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}
function compile(src) { return api.compile(src, { file: '<اختبار>' }); }
function runZy(src) {
  const res = compile(src);
  if (!res.ok) throw new Error('فشلت الترجمة: ' + res.diagnostics.map((d) => `${d.code}: ${d.message}`).join(' | '));
  const p = tmp('.mjs', res.code);
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8' });
  fs.unlinkSync(p);
  if (r.status !== 0) throw new Error('فشل التشغيل: ' + r.stderr);
  return r.stdout.trim();
}
function hasDiag(res, code) { return res.diagnostics.some((d) => d.code === code); }

console.log('\n═══ اختبارات زيتونة ═══\n');

// ---------------------------------------------------------------- اللغة
console.log('اللغة والمترجم:');

test('برنامج ترحيبي يعمل', () => {
  eq(runZy('اطبع("مرحبا يا عالم");'), 'مرحبا يا عالم');
});

test('أرقام عربية في الأعداد تُحوَّل تلقائيًا + ملاحظة', () => {
  const res = compile('متغير س = ٥;');
  ok(res.ok, 'يجب أن تُقبل');
  includes(res.code, 'let س = 5;');
  ok(hasDiag(res, 'Z205'), 'يجب أن تظهر ملاحظة Z205');
});

test('الترقيم العربي (، ؛) مقبول في اللغة', () => {
  const res = compile('متغير أ = 1، ب = 2؛');
  ok(res.ok);
  includes(res.code, 'let أ = 1, ب = 2;');
});

test('شروط إذا/وإلا وإلا إذا', () => {
  const out = runZy(`
    دالة صنّف(ع) {
      إذا (ع > 10) { أرجع "كبير" }
      وإلا إذا (ع > 5) { أرجع "متوسط" }
      وإلا { أرجع "صغير" }
    }
    اطبع(صنّف(12)، صنّف(7)، صنّف(2));
  `);
  eq(out, 'كبير متوسط صغير');
});

test('حلقة طالما', () => {
  const out = runZy('متغير ع = 0\nطالما (ع < 3) {\n  اطبع(ع)\n  ع++\n}');
  eq(out, '0\n1\n2');
});

test('حلقة كرر (for) بالشكل الكلاسيكي', () => {
  const out = runZy('كرر (متغير i = 0; i < 3; i++) { اطبع(i * 2) }');
  eq(out, '0\n2\n4');
});

test('حلقة لكل … في', () => {
  const out = runZy('لكل عنصر في ["أ", "ب"] { اطبع(عنصر) }');
  eq(out, 'أ\nب');
});

test('الدوال وإرجاع القيم', () => {
  const out = runZy('دالة اجمع(أ، ب) { أرجع أ + ب }\nاطبع(اجمع(3، 4));');
  eq(out, '7');
});

test('الأصناف والمنشئ وهذا', () => {
  const out = runZy(`
    صنف مركبة {
      منشئ(الاسم) { هذا.الاسم = الاسم }
      دالة نادِ() { أرجع "أنا " + هذا.الاسم }
    }
    ثابت س = جديد مركبة("صهيل")
    اطبع(س.نادِ())
  `);
  eq(out, 'أنا صهيل');
});

test('الدوال السهمية', () => {
  const out = runZy('ثابت ضعف = (س) => س * 2\nاطبع([1,2,3].map(ضعف).join("، "))');
  eq(out, '2، 4، 6');
});

test('الدوال المدمجة: طول، أضف، نص، مفاتيح', () => {
  const out = runZy(`
    متغير ق = [1, 2]
    أضف(ق، 3)
    اطبع(طول(ق), نص(9), مفاتيح({أ: 1, ب: 2}).join("-"))
  `);
  eq(out, '3 9 أ-ب');
});

test('العمليات المنطقية: و / أو / ليس', () => {
  eq(runZy('اطبع(صحيح و باطل, صحيح أو باطل, ليس (1 > 2))'), 'false true true');
});

test('الشرط الثلاثي (؟ : )', () => {
  eq(runZy('اطبع(3 > 2 ? "نعم" : "لا")'), 'نعم');
});

test('الفاصلة المنقوطة اختيارية والفاصلة العربية كذلك', () => {
  const out = runZy('متغير أ = 1\nمتغير ب = 2\nاطبع(أ + ب)');
  eq(out, '3');
});

test('التعليقات العربية تُنقل إلى الجافاسكربت', () => {
  const res = compile('# تعليق عربي\n// تعليق آخر\nمتغير س = 1');
  includes(res.code, '// تعليق عربي');
  includes(res.code, '// تعليق آخر');
});

test('النصوص بعلامات عربية «…»', () => {
  eq(runZy('اطبع(«مرحبا من زيتونة»)'), 'مرحبا من زيتونة');
});

test('جرب / ارفع / أخيرًا', () => {
  const out = runZy(`
    دالة اختبر() {
      جرب { ارفع "خطأ مقصود" }
      التقط (خطأ) { أرجع "التُقط: " + خطأ }
      أخيرًا {  }
    }
    اطبع(اختبر())
  `);
  eq(out, 'التُقط: خطأ مقصود');
});

test('الاستيراد والتصدير يُترجمان صحيحًا', () => {
  const res = compile('استورد { اقرأ } من "fs"\nصدّر دالة أ() { أرجع 1 }');
  ok(res.ok);
  includes(res.code, 'import { اقرأ } from "fs";');
  includes(res.code, 'export function أ()');
});

test('نوع (typeof) والعوامل الأحادية', () => {
  eq(runZy('اطبع(نوع 5, نوع "ن")'), 'number string');
});

test('خريطة الأسطر بعدد أسطر الكود', () => {
  const res = compile('متغير أ = 1\nدالة ب() { أرجع 2 }\nاطبع(ب())');
  eq(res.map.length, res.code.split('\n').length - 1);
});

// ------------------------------------------------------------- التشخيصات
console.log('\nالتشخيصات العربية:');

test('خطأ: اسم مفقود بعد «متغير»', () => {
  const res = compile('متغير = 5;');
  ok(!res.ok);
  ok(hasDiag(res, 'Z013'), 'يجب أن يظهر Z013');
});

test('اقتراح كلمة مفتاحية عند الخطأ الإملائي (طالم → طالما)', () => {
  const res = compile('طالم (صحيح) { }');
  ok(!res.ok);
  const d = res.diagnostics[0];
  includes(d.message + ' ' + (d.suggestion || ''), 'طالما', 'يجب أن يقترح «طالما»');
});

test('خطأ: قوس غير مغلق', () => {
  const res = compile('اطبع("مرحبا"');
  ok(!res.ok);
  ok(res.diagnostics.length > 0);
});

test('خطأ: ثابت بلا قيمة', () => {
  const res = compile('ثابت س');
  ok(!res.ok);
  ok(hasDiag(res, 'Z014'));
});

test('تحذير: اسم يخلط عربيًا ولاتينيًا', () => {
  const res = compile('متغير قيمه_total = 1');
  ok(hasDiag(res, 'Z209'));
});

// ---------------------------------------------------------------- الأمان
console.log('\nالأمان والحروف المخفية:');

test('كشف حرف اتجاه مخفي (Trojan Source)', () => {
  const res = compile('متغير س = 1 \u202E\nاطبع(س)');
  ok(!res.ok);
  ok(hasDiag(res, 'Z101'), 'يجب أن يظهر Z101');
  eq(res.diagnostics.find((d) => d.code === 'Z101').severity, 'security');
});

test('كشف الحرف صفري العرض', () => {
  const res = compile('متغير س\u200B = 1');
  ok(!res.ok);
  ok(hasDiag(res, 'Z102'));
});

test('فاحص عام (scanText) على ملف جافاسكربت', () => {
  const findings = scanText('let س = ٥، ع = 1؛', { lang: 'js' });
  ok(findings.some((f) => f.code === 'Z211'), 'رقم عربي في عدد');
  ok(findings.some((f) => f.code === 'Z201'), 'ترقيم عربي');
});

// --------------------------------------------------------------- الإصلاح
console.log('\nالمصحّح التلقائي:');

test('المستوى 0: إصلاح ملف جافاسكربت به أخطاء عربية', () => {
  const bad = 'let س = ٥، ع = ٣؛\nlet ن = س + ع\nif (ن > 7) { console.log("كبير") }\n';
  const res = fixText(bad, { lang: 'js', tier: 0 });
  ok(res.changed);
  includes(res.text, 'let س = 5, ع = 3;');
  eq(res.remaining.filter((d) => d.severity === 'error').length, 0, 'لا أخطاء متبقية');
});

test('المستوى 0: يحذف حرف الاتجاه المخفي', () => {
  const bad = 'let ا\u202Eلسر = 2;\n';
  const res = fixText(bad, { lang: 'js', tier: 0 });
  eq(res.text, 'let السر = 2;\n');   // ا + (حرف مخفي) + لسر  ←  السر
  ok(res.applied.some((a) => a.code === 'Z101'));
});

test('الإصلاح لا يمسّ النصوص: "٥،" تبقى كما هي', () => {
  const bad = 'let s = "٥،";\nlet ع = ٣;\n';
  const res = fixText(bad, { lang: 'js', tier: 0 });
  includes(res.text, '"٥،"');
  includes(res.text, 'ع = 3;');
});

test('الإصلاح لا يمسّ التعليقات', () => {
  const bad = '// تعليق: ٫ ٥،\nlet س = ٥;\n';
  const res = fixText(bad, { lang: 'js', tier: 0 });
  includes(res.text, '// تعليق: ٫ ٥،');
  includes(res.text, 'let س = 5;');
});

test('الإصلاح مُتعادل (idempotent): تشغيله مرتين لا يغيّر شيئًا', () => {
  const bad = 'let س = ٥، ع = ٣؛\n';
  const once = fixText(bad, { lang: 'js', tier: 0 });
  const twice = fixText(once.text, { lang: 'js', tier: 0 });
  eq(twice.changed, false);
});

test('المستوى 0: الفاصلة العشرية العربية ٫ ← .', () => {
  const res = fixText('let س = ٣٫٥;\n', { lang: 'js', tier: 0 });
  includes(res.text, 'let س = 3.5;');
});

test('المستوى 1: إعادة تسمية متسقة للأسماء التي تحوي أرقامًا عربية', () => {
  const res = fixText('let متغير١ = 5;\nconsole.log(متغير١);\n', { lang: 'js', tier: 1 });
  includes(res.text, 'let متغير1 = 5;');
  includes(res.text, 'console.log(متغير1);');
});

test('تحقق حقيقي: الإصلاح يجتاز node --check', () => {
  const bad = 'let س = ٥، ع = ٣؛\nconsole.log(س + ع)\n';
  const res = fixText(bad, { lang: 'js', tier: 0 });
  const p = tmp('.mjs', res.text);
  const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  fs.unlinkSync(p);
  eq(r.status, 0, 'node --check يجب أن ينجح: ' + r.stderr);
});

test('علامة الاستفهام «؟» تُصلح في الشرط الثلاثي فقط', () => {
  const good = fixText('let وصف = ن > 7 ؟ "كبير" : "صغير";\n', { lang: 'js', tier: 0 });
  includes(good.text, 'ن > 7 ? "كبير"');
  const ambiguous = fixText('let ن = س + ع؟\n', { lang: 'js', tier: 0 });
  includes(ambiguous.text, '؟', 'بلا قرينة: لا تُصلح تلقائيًا');
  ok(ambiguous.skipped.some((s) => s.code === 'Z213'));
});

test('تكامل: إصلاح الملف المثال يجتاز node --check', () => {
  const f = path.join(__dirname, '..', 'examples', 'كود_به_أخطاء.js');
  const src = fs.readFileSync(f, 'utf8');
  const res = fixText(src, { lang: 'js', tier: 1 });
  const p = tmp('.mjs', res.text);
  const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  fs.unlinkSync(p);
  eq(r.status, 0, 'يجب أن ينجح: ' + r.stderr);
});

// --------------------------------------------------------------- بايثون
console.log('\nتعدد اللغات (بايثون):');

test('فحص ملف بايثون: تشخيص عربي لرقم عربي في عدد', () => {
  const p = tmp('.py', 'س = ٥\nاطبع = 1\n');
  const res = api.checkFile(p);
  fs.unlinkSync(p);
  ok(!res.ok);
  ok(res.diagnostics.some((d) => d.code === 'Z211' || d.code === 'Z401'), 'يجب رصد المشكلة');
});

test('إصلاح ملف بايثون ثم اجتيازه py_compile', () => {
  let text = 'س = ٥\nنتيجة = س + ١\nprint(نتيجة)\n';
  const res = fixText(text, { lang: 'py', tier: 0 });
  includes(res.text, 'س = 5');
  const p = tmp('.py', res.text);
  const chk = require('../src/checkers').runChecker(p, 'py');
  fs.unlinkSync(p);
  eq(chk.ok, true, 'py_compile يجب أن ينجح: ' + chk.output);
});

test('ملف بايثون سليم يمرّ بلا تشخيصات', () => {
  const p = tmp('.py', 'عدد = 5\nprint(عدد)\n');
  const res = api.checkFile(p);
  fs.unlinkSync(p);
  eq(res.ok, true, JSON.stringify(res.diagnostics));
});

// ------------------------------------------------------------ تكامل CLI
console.log('\nتكامل واجهة الطرفية:');

test('CLI: فحص ملف به أخطاء يرجع كود خروج 1 ويطبع «خطأ»', () => {
  const f = tmp('.js', 'let س = ٥، ع = ٣؛\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'zaytuna.js'), 'فحص', f], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  fs.unlinkSync(f);
  eq(r.status, 1);
  includes(r.stdout, 'خطأ');
});

test('CLI: إصلاح مع --write يكتب الملف ويحفظ نسخة احتياطية', () => {
  const f = tmp('.js', 'let س = ٥؛\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'zaytuna.js'), 'إصلاح', f, '--write'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const after = fs.readFileSync(f, 'utf8');
  const bakExists = fs.existsSync(f + '.bak');
  fs.unlinkSync(f); if (bakExists) fs.unlinkSync(f + '.bak');
  eq(r.status, 0);
  includes(after, 'let س = 5;');
  eq(bakExists, true, 'يجب إنشاء نسخة احتياطية');
});

test('CLI: تشغيل ملف زيتونة كامل', () => {
  const src = 'دالة ضاعف(س) { أرجع س * 2 }\nاطبع(ضاعف(٢١))\n';
  const f = tmp('.zy', src);
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'zaytuna.js'), 'تشغيل', f], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  fs.unlinkSync(f);
  eq(r.status, 0, r.stderr);
  eq(r.stdout.trim(), '42');
});


// ------------------------------------------------- توسيع اللغة (اختر/بسط/سهم/…)
console.log('\nتوسيع اللغة:');

test('«اختر/حالة/غير_ذلك» تعمل مثل switch', () => {
  const src = [
    'متغير ن = ٢',
    'متغير النتيجة = ""',
    'اختر (ن) {',
    '  حالة ١:',
    '    النتيجة = "واحد"',
    '    كسر',
    '  حالة ٢:',
    '    النتيجة = "اثنان"',
    '    كسر',
    '  غير_ذلك:',
    '    النتيجة = "غير ذلك"',
    '}',
    'اطبع(النتيجة)',
  ].join('\n');
  eq(runZy(src), 'اثنان');
});

test('«انشر» للبسط في الوسائط والمعامل الباقي في الدوال', () => {
  const src = ['دالة جمع(انشر القيم) {', '  متغير م = 0', '  لكل ق في القيم { م += ق }', '  أرجع م', '}', 'اطبع(جمع(انشر [١، ٢، ٣]))'].join('\n');
  eq(runZy(src), '6');
});

test('«الأصل» (super) تُترجم صحيحة والصنف يمتد', () => {
  const res = compile(['صنف أ {', '  منشئ() { هذا.س = 1 }', '}', 'صنف ب موسع أ {', '  منشئ() { الأصل() }', '}'].join('\n'));
  ok(res.ok, JSON.stringify(res.diagnostics));
  includes(res.code, 'super()');
  includes(res.code, 'class ب extends أ');
});

test('«احذف» تحذف خاصية فعلًا', () => {
  const src = ['متغير ك = { أ: 1، ب: 2 }', 'احذف ك.أ', 'اطبع(نوع ك.أ)'].join('\n');
  eq(runZy(src), 'undefined');
});

test('الأدوات النصية العربية الجديدة تعمل', () => {
  eq(runZy('اطبع(اقسم("أ-ب-ج"، "-")[1])'), 'ب');
  eq(runZy('اطبع(انضم([١، ٢، ٣]، "+"))'), '1+2+3');
  eq(runZy('اطبع(يحتوي("مرحبا"، "حب"))'), 'true');
  eq(runZy('اطبع(استبدل("مرحبا"، "م"، "س"))'), 'سرحبا');
});

// ------------------------------------------------- تعدد اللغات (المحرّك الموسّع)
console.log('\nتعدد اللغات (المحرّك الموسّع):');

const { verifyText } = require('../src/checkers');
const { LANGS, LANG_LABEL } = require('../src/languages');

test('سجلّ اللغات: تعرّف صحيح على الامتدادات + مدقّق لكل لغة', () => {
  const cases = { 'a.js': 'js', 'a.cpp': 'cpp', 'a.rb': 'rb', 'a.sh': 'sh', 'a.go': 'go', 'a.rs': 'rs', 'a.php': 'php', 'a.cs': 'cs', 'a.kt': 'kt', 'a.mmm': 'unknown' };
  for (const [f, want] of Object.entries(cases)) eq(api.detectLang(f), want, f);
  for (const [id, info] of Object.entries(LANGS)) {
    if (id === 'unknown') continue;
    ok(info.label && info.exts.length, `لغة ${id} بلا اسم/امتداد`);
    ok(info.verifier && (info.verifier.tools || info.verifier.internal || info.verifier.none), `لغة ${id} بلا مدقّق معرّف`);
  }
  ok(LANG_LABEL.c && LANG_LABEL.go && LANG_LABEL.rb);
});

function toolMissing(tools) { return require('../src/checkers').resolveTool(tools) === null; }

test('سي (C): خطأ حقيقي من gcc ← إصلاح ← اجتياز التحقق', () => {
  const bad = '#include <stdio.h>\nint main(void) {\n  int س = ٥;\n  printf("%d", س);\n  return 0;\n}\n';
  if (toolMissing(['gcc', 'cc', 'clang'])) {
    const f = tmp('.c', bad);
    const r = api.checkFile(f);
    fs.unlinkSync(f);
    eq(r.external.verified, false, 'بلا gcc يجب أن نقول صريحًا إننا لم نتحقق');
    ok(/لم أجد/.test(r.external.note || ''), r.external.note);
    return;
  }
  const f = tmp('.c', bad);
  const chk = api.checkFile(f);
  fs.unlinkSync(f);
  eq(chk.ok, false, 'يجب رصد الخطأ');
  eq(chk.external.verified, true);
  eq(chk.external.ok, false);
  ok(chk.diagnostics.some((d) => d.code === 'Z401'), 'يجب إضافة تشخيص عربي من المدقّق');
  const fixed = fixText(bad, { lang: 'c', tier: 0 });
  includes(fixed.text, 'int س = 5;');
  const v = verifyText(fixed.text, 'c');
  eq(v.ok, true, 'gcc -fsyntax-only يجب أن ينجح بعد الإصلاح: ' + v.output);
});

test('شل: حرف مخفي داخل «if» يكسر bash ← الإصلاح يُصلحه فعلًا', () => {
  if (toolMissing(['bash'])) return;
  const bad = 'i\u200bf [ 1 -eq 1 ]; then\n  echo نعم\nfi\n';
  const f = tmp('.sh', bad);
  const chk = api.checkFile(f);
  fs.unlinkSync(f);
  eq(chk.ok, false, 'bash -n يجب أن يفشل بسبب الحرف المخفي');
  ok(chk.diagnostics.some((d) => d.code === 'Z102'), 'يجب رصد الحرف صفري العرض');
  const fixed = fixText(bad, { lang: 'sh', tier: 0 });
  ok(!fixed.text.includes('\u200b'), 'يجب حذف الحرف المخفي');
  const v = verifyText(fixed.text, 'sh');
  eq(v.ok, true, 'bash -n يجب أن ينجح بعد الإصلاح: ' + v.output);
});

test('بيرل: رقم عربي في عدد ← إصلاح ← perl -c', () => {
  if (toolMissing(['perl'])) return;
  const bad = 'my $x = ٥;\nprint $x;\n';
  const fixed = fixText(bad, { lang: 'pl', tier: 0 });
  includes(fixed.text, 'my $x = 5;');
  const v = verifyText(fixed.text, 'pl');
  eq(v.ok, true, 'perl -c يجب أن ينجح: ' + v.output);
});

test('لغة بلا مدقّق: نقولها صريحة ولا نكتب ملفًا', () => {
  const missing = Object.entries(LANGS).find(([id, i]) => id !== 'unknown' && !i.verifier.internal && !i.verifier.none && !i.verifier.needsProject && toolMissing(i.verifier.tools || []));
  if (!missing) return; // كل المدقّقات متوفّرة في هذه البيئة
  const [id, info] = missing;
  const ext = info.exts[0];
  const src = 'x = ٥\n';
  const v = verifyText(src, id);
  eq(v.verified, false, `لغة ${id} بلا مدقّق يجب أن تُعلن عدم التحقق`);
  ok(/لم أجد|تحتاج|gofmt/.test(v.note || ''), v.note);
  // CLI: الكتابة ترفض
  const f = tmp(ext, 'x = ٥\n');
  const before = fs.readFileSync(f, 'utf8');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'zaytuna.js'), 'إصلاح', f, '--tier', '0', '--write'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const after = fs.readFileSync(f, 'utf8');
  fs.unlinkSync(f);
  eq(r.status, 1, 'يجب أن يرفض الكتابة بدون تحقق');
  eq(after, before, 'لا يجوز تغيير الملف');
  includes(r.stdout, 'لم أكتب الملف');
});

test('CLI: فحص ملف سي يعرض اسم اللغة العربية ويشرح خطأ المترجم', () => {
  if (toolMissing(['gcc', 'cc', 'clang'])) return;
  const f = tmp('.c', 'int main(void) {\n  int س = ٥;\n  return 0;\n}\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'zaytuna.js'), 'فحص', f], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  fs.unlinkSync(f);
  eq(r.status, 1);
  includes(r.stdout, 'اللغة: سي');
  includes(r.stdout, 'Z401');
});


// ------------------------------------------------- الأنماط (طابق) والأنواع
console.log('\nالأنماط (طابق) والأنواع:');

test('«طابق/مع»: قيمة · بدائل · مدى', () => {
  const src = [
    'دالة صنّف(قيمة) {',
    '  طابق (قيمة) {',
    '    مع ٠: أرجع "صفر"',
    '    مع ١، ٢، ٣: أرجع "صغير"',
    '    مع من ٤ إلى ١٠: أرجع "متوسط"',
    '    غير_ذلك: أرجع "كبير"',
    '  }',
    '}',
    'اطبع(صنّف(٠) + "|" + صنّف(٢) + "|" + صنّف(٧) + "|" + صنّف(٥٠))',
  ].join('\n');
  eq(runZy(src), 'صفر|صغير|متوسط|كبير');
});

test('«طابق/مع»: نوع · نمط قائمة · نمط كائن مع ربط الأسماء', () => {
  const src = [
    'دالة صنّف(قيمة) {',
    '  طابق (قيمة) {',
    '    مع نوع "string": أرجع "نصّ: " + قيمة',
    '    مع نوع "قائمة": أرجع "قائمة طولها " + طول(قيمة)',
    '    مع [أ، ب]: أرجع "زوج مجموعه " + (أ + ب)',
    '    مع {اسم، عمر}: أرجع اسم + " عمره " + عمر',
    '    غير_ذلك: أرجع "آخر"',
    '  }',
    '}',
    'اطبع(صنّف("مرحبا"))',
    'اطبع(صنّف([١، ٢، ٣]))',
    'اطبع(صنّف([١٠، ٢٠]))',   // أول نمط مطابق يفوز: «نوع "قائمة"» قبل نمط الزوج
    'اطبع(صنّف({ اسم: "سارة"، عمر: ٣٠ }))',
    'اطبع(صنّف(صحيح))',
  ].join('\n');
  eq(runZy(src), ['نصّ: مرحبا', 'قائمة طولها 3', 'قائمة طولها 2', 'سارة عمره 30', 'آخر'].join('\n'));
});

test('«طابق/مع»: شرط إضافي (إذا) على الحالة', () => {
  const src = [
    'متغير ن = 15',
    'طابق (ن) {',
    '  مع نوع "number" إذا (ن > 10): اطبع("كبير")',
    '  مع نوع "number": اطبع("صغير")',
    '  غير_ذلك: اطبع("ليس رقمًا")',
    '}',
  ].join('\n');
  eq(runZy(src), 'كبير');
});

test('«طابق» بلا حالة مطابقة وبلا «غير_ذلك» يمرّ بسلام', () => {
  const src = ['طابق (٥) {', '  مع ١: اطبع("واحد")', '}', 'اطبع("بعد")'].join('\n');
  eq(runZy(src), 'بعد');
});

test('الأنواع تُشطب في جافاسكربت والبرنامج يعمل', () => {
  const src = [
    'دالة هوية عام <س>(قيمة: س): س { أرجع قيمة }',
    'ثابت الأسماء: نص[] = ["سارة"، "علي"]',
    'ثابت الضاعف = (س: عدد): عدد => س * 2',
    'اطبع(هوية(الضاعف(٢١)) + " " + الأسماء[0])',
  ].join('\n');
  const res = compile(src);
  ok(res.ok, JSON.stringify(res.diagnostics.filter((d) => d.severity !== 'info')));
  ok(!res.code.includes('عدد') && !/:\s*س\b/.test(res.code), 'لا يجب أن تبقى أنواع في المخرج:\n' + res.code);
  eq(runZy(src), '42 سارة');
});

test('مع «types: true» تبقى الأنواع والأدوية العامة (مخرج تايبسكربت)', () => {
  const src = [
    'دالة هوية عام <س>(قيمة: س): س { أرجع قيمة }',
    'صنف صندوق عام <س> {',
    '  منشئ(عناصر: قائمة<س>) { هذا.العناصر = عناصر }',
    '  دالة الأول(): س | عدم { أرجع this.العناصر[0] }',
    '}',
    'ثابت س: نص = "مرحبا"',
  ].join('\n');
  const res = api.compile(src, { file: '<x>', types: true });
  ok(res.ok, JSON.stringify(res.diagnostics.filter((d) => d.severity !== 'info')));
  includes(res.code, 'function هوية<س>(قيمة: س): س');
  includes(res.code, 'class صندوق<س>');
  includes(res.code, 'constructor(عناصر: قائمة<س>)');
  includes(res.code, '(): س | null');
  includes(res.code, 'const س: نص = "مرحبا"');
});

test('الشرط الثلاثي بالعربية «؟ … :» يعمل داخل زيتونة', () => {
  eq(runZy('متغير ن = ٥\nاطبع(ن > ٣ ؟ "كبير" : "صغير")'), 'كبير');
});

test('«؟» بلا «:» ما زال خطأ واضحًا (لا تخمين)', () => {
  const res = compile('متغير ن = ٥\nاطبع(ن؟)');
  ok(!res.ok, 'يجب أن يفشل');
  ok(hasDiag(res, 'Z202'), JSON.stringify(res.diagnostics.map((d) => d.code)));
});

test('مثال الأنماط والأنواع الكامل يعمل + مخرجه JS سليم', () => {
  const f = path.join(__dirname, '..', 'examples', 'أنماط_وأنواع.zy');
  const src = fs.readFileSync(f, 'utf8');
  const res = api.compile(src, { file: f });
  ok(res.ok, JSON.stringify(res.diagnostics.filter((d) => d.severity !== 'info')));
  const p = tmp('.mjs', res.code);
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8' });
  fs.unlinkSync(p);
  eq(r.status, 0, r.stderr);
  includes(r.stdout, 'سارة عمره 30');
  const ts = api.compile(src, { file: f, types: true });
  includes(ts.code, 'class صندوق<س>');
});


// ------------------------------------------------ التصريف الذاتي (زيتونة بزيتونة)
console.log('\nالتصريف الذاتي (زيتونة تكتب زيتونة):');

/** يُترجم selfhost/اقتراح.zy بمترجم زيتونة ويُحمّله كوحدة */
function loadSelfHost() {
  const f = path.join(__dirname, '..', 'selfhost', 'اقتراح.zy');
  const res = api.compile(fs.readFileSync(f, 'utf8'), { file: f });
  ok(res.ok, 'يجب أن تُترجم: ' + JSON.stringify(res.diagnostics.filter((d) => d.severity !== 'info')));
  return { code: res.code, mod: new Function(`${res.code}\nreturn { اقترح, طبيع, مسافة };`)() };
}

test('التصريف الذاتي: التطبيع العربي المكتوب بزيتونة يطابق تنفيذ جافاسكربت', () => {
  const { normalizeArabic } = require('../src/dictionary');
  const { mod } = loadSelfHost();
  const samples = ['طالما', 'طَالِما', 'صُنّف', 'ازيتونة', 'متَغير', 'أحمد', 'مصطفي', 'كتابةـ', 'إلى', 'ةه'];
  for (const w of samples) eq(mod.طبيع(w), normalizeArabic(w), 'تطبيع مختلف: ' + w);
  eq(mod.مسافة('كتاب', 'كتابة'), 1);
  eq(mod.مسافة('', 'نص'), 2);   // «نص» حرفان
});

test('التصريف الذاتي: اقتراح الكلمات المفتاحية يطابق تنفيذ جافاسكربت على 200+ مدخل', () => {
  const { suggestKeyword, KEYWORD_WORDS } = require('../src/dictionary');
  const { mod } = loadSelfHost();
  const corpus = [];
  for (const k of KEYWORD_WORDS) {
    corpus.push(k);
    if (k.length > 1) corpus.push(k.slice(0, -1));
    if (k.length > 2) corpus.push(k[0] + k.slice(2));
    corpus.push(k + k[k.length - 1]);
    corpus.push(k.replace('ا', 'أ'));
  }
  let mismatches = 0;
  for (const w of corpus) {
    const js = suggestKeyword(w);
    const zy = mod.اقترح(w, KEYWORD_WORDS);
    if (js !== zy) mismatches++;
  }
  ok(corpus.length >= 200, 'حجم المدخلات ' + corpus.length);
  eq(mismatches, 0, 'يجب تطابق التنفيذين تمامًا');
  eq(mod.اقترح('طالم', KEYWORD_WORDS), 'طالما');
  eq(mod.اقترح('صتعب', KEYWORD_WORDS), null, 'كلمة بعيدة جدًا ⇒ لا اقتراح');
});

test('CLI: «zaytuna اقترح» يعمل بتنفيذ زيتونة ويكشف الاقتراح', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'zaytuna.js'), 'اقترح', 'طالم'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  eq(r.status, 0, r.stderr);
  includes(r.stdout, 'طالما');
  includes(r.stdout, 'اقتراح.zy');
  const none = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'zaytuna.js'), 'اقترح', 'صتعب'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  eq(none.status, 1, 'لا اقتراح ⇒ كود خروج 1');
});

// ---------------------------------------------------------------- النتيجة
console.log(`\n═══ النتيجة: ${passed} ناجح · ${failed} فاشل ═══\n`);
if (failed) {
  for (const f of failures) console.log(`  ✘ ${f.name}\n      ${f.message.split('\n')[0]}`);
  process.exit(1);
}
process.exit(0);
