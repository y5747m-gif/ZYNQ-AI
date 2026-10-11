'use strict';

// ==========================================================================
//  زيتونة — سجلّ اللغات المدعومة
//  لكل لغة: الاسم العربي · امتدادات الملفات · عائلة سطح المكتب (للتعليقات والنصوص)
//  · المدقّق الحقيقي (أمره وترتيب أولوياته) · ومصدر التثبيت إن كان غائبًا.
//  قاعدة ثابتة: لا ندّعي دعم لغة لا نستطيع التحقق منها — بل نقولها صريحة.
// ==========================================================================

/** عائلات «سطح» الكود: أي تعليقات وأي علامات تنصيص تحمي النص من الإصلاح */
const FAMILY_OF = {
  js: 'js', ts: 'js', zy: 'zy',
  py: 'py',
  c: 'clike', cpp: 'clike', java: 'clike', cs: 'clike', go: 'clike', rs: 'clike', swift: 'clike',
  php: 'php',
  rb: 'hash', sh: 'hash', pl: 'hash',
  sql: 'hash',
  unknown: 'js',
};

const LANGS = {
  js: {
    label: 'جافاسكربت', en: 'JavaScript',
    exts: ['.js', '.mjs', '.cjs', '.jsx'],
    verifier: { tools: ['node'], kind: 'node --check', install: 'Node.js' },
  },
  ts: {
    label: 'تايبسكربت', en: 'TypeScript',
    exts: ['.ts', '.tsx'],
    verifier: { tools: ['tsc'], kind: 'tsc --noEmit', install: 'npm install -g typescript', syntaxOnly: true },
  },
  py: {
    label: 'بايثون', en: 'Python',
    exts: ['.py'],
    verifier: { tools: ['python3', 'python'], kind: 'py_compile', install: 'Python 3' },
  },
  zy: {
    label: 'زيتونة', en: 'Zaytuna',
    exts: ['.zy'],
    verifier: { internal: true, kind: 'مترجم زيتونة', install: '—' },
  },
  c: {
    label: 'سي', en: 'C',
    exts: ['.c', '.h'],
    verifier: { tools: ['gcc', 'cc', 'clang'], kind: 'gcc -fsyntax-only', install: 'GCC أو Clang' },
  },
  cpp: {
    label: 'سي++', en: 'C++',
    exts: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'],
    verifier: { tools: ['g++', 'clang++', 'c++'], kind: 'g++ -fsyntax-only', install: 'G++ أو Clang++' },
  },
  java: {
    label: 'جافا', en: 'Java',
    exts: ['.java'],
    verifier: { tools: ['javac'], kind: 'javac -proc:none', install: 'JDK (Adoptium/Temurin)' },
  },
  cs: {
    label: 'سي شارب', en: 'C#',
    exts: ['.cs'],
    verifier: { tools: ['dotnet'], kind: 'dotnet build', install: '.NET SDK', needsProject: true },
  },
  go: {
    label: 'جو', en: 'Go',
    exts: ['.go'],
    verifier: { tools: ['gofmt', 'go'], kind: 'gofmt -e', install: 'Go toolchain' },
  },
  rs: {
    label: 'رست', en: 'Rust',
    exts: ['.rs'],
    verifier: { tools: ['rustc'], kind: 'rustc --emit=metadata', install: 'Rust (rustup)' },
  },
  php: {
    label: 'بي إتش بي', en: 'PHP',
    exts: ['.php'],
    verifier: { tools: ['php'], kind: 'php -l', install: 'PHP CLI' },
  },
  rb: {
    label: 'روبي', en: 'Ruby',
    exts: ['.rb'],
    verifier: { tools: ['ruby'], kind: 'ruby -c', install: 'Ruby' },
  },
  sh: {
    label: 'شل', en: 'Shell',
    exts: ['.sh', '.bash', '.zsh'],
    verifier: { tools: ['bash'], kind: 'bash -n', install: 'bash' },
  },
  pl: {
    label: 'بيرل', en: 'Perl',
    exts: ['.pl', '.pm'],
    verifier: { tools: ['perl'], kind: 'perl -c', install: 'Perl' },
  },
  swift: {
    label: 'سويفت', en: 'Swift',
    exts: ['.swift'],
    verifier: { tools: ['swiftc'], kind: 'swiftc -parse', install: 'Swift toolchain' },
  },
  kt: {
    label: 'كوتلن', en: 'Kotlin',
    exts: ['.kt', '.kts'],
    verifier: { tools: ['kotlinc'], kind: 'kotlinc', install: 'Kotlin compiler' },
  },
  sql: {
    label: 'SQL', en: 'SQL',
    exts: ['.sql'],
    verifier: { none: 'لا نُشغّل SQL للتحقق (تشغيل الاستعلامات خطر) — فحوص Unicode والترقيم فقط.' },
  },
  unknown: {
    label: 'غير معروفة', en: 'unknown',
    exts: [],
    verifier: { none: 'لغة غير معروفة — فحوص Unicode والترقيم العامة فقط (يمكن تحديد اللغة بـ --lang).' },
  },
};

const LANG_LABEL = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, v.label]));

const EXT_MAP = {};
for (const [id, info] of Object.entries(LANGS)) for (const ext of info.exts) EXT_MAP[ext] = id;

/** تحديد اللغة من امتداد الملف (أو 'unknown') */
function detectLang(filePath) {
  const ext = String(filePath || '').toLowerCase().match(/\.[^./\\]+$/);
  if (!ext) return 'unknown';
  return EXT_MAP[ext[0]] || 'unknown';
}

/** معلومات لغة (مع بديل آمن) */
function langInfo(id) {
  return LANGS[id] || LANGS.unknown;
}

/** عائلة سطح الكود (للتعليقات والنصوص في الحارس والمصحّح) */
function familyOf(id) {
  return FAMILY_OF[id] || 'js';
}

module.exports = { LANGS, LANG_LABEL, detectLang, langInfo, familyOf, FAMILY_OF };
