'use strict';

// ==========================================================================
//  زيتونة — «زر الترجمة»: سجلّ اللغات الهدف + موزّع الترجمة
//  المستخدم يكتب بالعربية ويختار اللغة التي يريد التحويل إليها، ونقول له
//  بصراحة: أي مخرج تحقّقنا منه فعلًا (بمترجم حقيقي) وأي مخرج لم نتحقق منه.
// ==========================================================================

const { transpile } = require('../transpiler');
const { emitDynamic } = require('./dynamic');
const { emitCpp } = require('./cpp');

/** اللغات التي نُترجم إليها فعلًا اليوم */
const TARGETS = {
  js: {
    id: 'js', label: 'جافاسكربت', en: 'JavaScript', ext: '.js', verifierLang: 'js',
    kind: 'core', desc: 'لغة التشغيل الأصلية لزيتونة — نفس المخرج الافتراضي.',
  },
  ts: {
    id: 'ts', label: 'تايبسكربت', en: 'TypeScript', ext: '.ts', verifierLang: 'ts',
    kind: 'core', types: true, desc: 'جافاسكربت مع الأنواع العربية كاملة (كما يبقى المخرج بـ --ts).',
  },
  py: {
    id: 'py', label: 'بايثون', en: 'Python', ext: '.py', verifierLang: 'py',
    kind: 'dynamic', lang: 'python', desc: 'إزاحة، f-strings، أصناف، قوائم، و«كرر» ← range.',
  },
  rb: {
    id: 'rb', label: 'روبي', en: 'Ruby', ext: '.rb', verifierLang: 'rb',
    kind: 'dynamic', lang: 'ruby', desc: 'end، #{}، رموز @ للمتغيّرات، وأصناف روبي.',
  },
  php: {
    id: 'php', label: 'بي إتش بي', en: 'PHP', ext: '.php', verifierLang: 'php',
    kind: 'dynamic', lang: 'php', desc: 'دوال برمز $، foreach، وأصناف بامتداد extends.',
  },
  cpp: {
    id: 'cpp', label: 'سي++', en: 'C++', ext: '.cpp', verifierLang: 'cpp',
    kind: 'static', desc: 'C++17: قوالب للدوال بلا أنواع، iostream، وstd::vector.',
  },
};

/** لغات مدعومة في فحص الملفات لكن الترجمة إليها لم تكتمل بعد — نقولها بصراحة */
const PLANNED = {
  c: 'لغة إجرائية بلا نصوص ديناميكية — الترجمة إليها تحتاج تخزينًا يدويًا مؤقتًا.',
  java: 'يحتاج هيكل ملف/صنف وترجمة النصوص إلى StringBuilder.',
  cs: 'يحتاج تهيئة .NET ومساحة أسماء.',
  go: 'يحتاج حزمة main وقواعد صارمة للأنواع غير المستخدمة.',
  rs: 'يحتاج مُلكية وأنواع صريحة (.to_string() ونُسخ) — عمل قادم.',
  sh: 'لغة صدفة — لا تُترجم إليها برامج عامة.',
  pl: 'لغة نصوص قديمة — ليست هدفًا مناسبًا لبرامج زيتونة.',
  sql: 'لغة استعلامات — لا تُترجم إليها برامج عامة.',
  swift: 'لم يُختبر مدقّقها هنا بعد.',
  kt: 'لم يُختبر مدقّقها هنا بعد.',
  zy: 'زيتونة هي اللغة المصدر نفسها.',
};

const ALIASES = new Map();
for (const [id, t] of Object.entries(TARGETS)) {
  for (const a of [id, t.label, t.en, t.ext, t.ext.replace('.', '')]) {
    if (a) ALIASES.set(String(a).trim().toLowerCase(), id);
  }
}
for (const [a, id] of [['جافاسكربت', 'js'], ['javascript', 'js'], ['js', 'js'], ['تايبسكربت', 'ts'], ['typescript', 'ts'],
  ['بايثون', 'py'], ['python', 'py'], ['python3', 'py'], ['روبي', 'rb'], ['ruby', 'rb'],
  ['بي إتش بي', 'php'], ['php', 'php'], ['سي++', 'cpp'], ['c++', 'cpp'], ['cpp', 'cpp'], ['سي بلاس بلاس', 'cpp']]) {
  ALIASES.set(a, id);
}

/** هل هذه اللغة هدف ترجمة مدعوم؟ */
function findTarget(name) {
  if (!name) return null;
  let key = String(name).trim().toLowerCase();
  if (ALIASES.has(key)) return TARGETS[ALIASES.get(key)];
  key = key.replace(/^\./, '');
  if (ALIASES.has(key)) return TARGETS[ALIASES.get(key)];
  return null;
}

/** قائمة الأهداف لعرضها في الواجهة/الـCLI */
function listTargets() {
  const out = Object.values(TARGETS).map((t) => ({ id: t.id, label: t.label, en: t.en, ext: t.ext, desc: t.desc }));
  for (const [id, reason] of Object.entries(PLANNED)) {
    out.push({ id, label: id, en: id, ext: '', desc: reason, planned: true });
  }
  return out;
}

/**
 * ترجمة شجرة عربية إلى اللغة الهدف.
 * @returns {{ok:boolean, code:string|null, ext:string, label:string, id:string,
 *            unsupported:Array, notes:Array, map:Array|null, reason?:string}}
 */
function translateTo(ast, targetName, opts = {}) {
  const t = findTarget(targetName);
  if (!t) {
    return { ok: false, code: null, unsupported: [], notes: [], map: null, id: null, label: String(targetName), ext: '', reason: `لغة هدف غير معروفة: «${targetName}». المتاح: ${Object.values(TARGETS).map((x) => x.label).join('، ')}.` };
  }
  if (t.kind === 'core') {
    const { code, map } = transpile(ast, { types: !!t.types });
    return { ok: true, code, map, ext: t.ext, id: t.id, label: t.label, unsupported: [], notes: [] };
  }
  if (t.kind === 'dynamic') {
    const r = emitDynamic(ast, t.lang, opts);
    return { ok: true, code: r.code, map: r.map, ext: t.ext, id: t.id, label: t.label, unsupported: r.unsupported, notes: r.notes };
  }
  if (t.id === 'cpp') {
    const r = emitCpp(ast, opts);
    return { ok: true, code: r.code, map: r.map, ext: t.ext, id: t.id, label: t.label, unsupported: r.unsupported, notes: r.notes };
  }
  return { ok: false, code: null, unsupported: [], notes: [], map: null, id: t.id, label: t.label, ext: t.ext, reason: t.desc };
}

module.exports = { TARGETS, PLANNED, findTarget, listTargets, translateTo };
