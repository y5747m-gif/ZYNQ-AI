'use strict';

// ==========================================================================
//  زيتونة — المعجم (الكلمات المفتاحية العربية ← جافاسكربت)
//  المبدأ: كل كلمة عربية لها مقابل واحد فقط في جافاسكربت، فالترجمة حتمية 1:1
//  ويمكن دائمًا الرجوع للجافاسكربت (خروج بلا قفل).
// ==========================================================================

const KEYWORD_TABLE = {
  // ---- تعريفات وهياكل ----
  'متغير': 'let',
  'ثابت': 'const',
  'دالة': 'function',
  'صنف': 'class',
  'موسع': 'extends',
  'جديد': 'new',
  'ساكن': 'static',
  'منشئ': 'constructor',
  'هذا': 'this',
  // ---- قيم حرفية ----
  'صحيح': 'true',
  'باطل': 'false',   // «خطأ» تُركت حرة كي تُستخدم اسمًا للمتغيّرات (التقط (خطأ) …)
  'عدم': 'null',
  'لاشيء': 'undefined',
  // ---- التحكم في المسار ----
  'إذا': 'if',
  'وإلا': 'else',
  'طالما': 'while',
  'كرر': 'for',
  'لكل': 'for',
  'في': 'of',
  'كسر': 'break',
  'استمر': 'continue',
  'أرجع': 'return',
  'ارفع': 'throw',
  'جرب': 'try',
  'التقط': 'catch',
  'أخيرًا': 'finally',
  // ---- دوال وعمليات ----
  'غير_متزامن': 'async',
  'انتظر': 'await',
  'نوع': 'typeof',
  // ---- عمليات منطقية (يعالجها المُحلِّل النحوي بعُقد خاصة) ----
  'و': '&&',
  'أو': '||',
  'ليس': '!',
  'مطابق': '===',
  'مختلف': '!==',
  // ---- الوحدات ----
  'استورد': 'import',
  'صدّر': 'export',
  'من': 'from',
  'كـ': 'as',
  'افتراضي': 'default',
};

const KEYWORDS = new Map(Object.entries(KEYWORD_TABLE));
const KEYWORD_WORDS = [...KEYWORDS.keys()];

// كلمات تُقبل فقط بتهجئتها الكاملة (لا يصلح معها التطبيع)
const EXACT_ONLY = new Set(['كـ', 'و', 'أو', 'في', 'من', 'هذا', 'عدم']);

// ==========================================================================
//  تطبيع عربي: يتجاهل التشكيل والتطويل وأشكال الألف/الياء/التاء المربوطة
//  يُستخدم (1) للاقتراح عند الخطأ الإملائي (2) كاحتياطي لفهم الكلمة المفتاحية
// ==========================================================================
const AR_MARKS = /[\u064B-\u065F\u0670\u0640]/g;

function normalizeArabic(text) {
  return String(text)
    .normalize('NFKC')
    .replace(AR_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/ی/g, 'ي');
}

// خريطة احتياطية: كلمة مطبّعة → مقابلها
const NORMALIZED_KEYWORDS = new Map();
for (const [ar, js] of KEYWORDS) {
  if (EXACT_ONLY.has(ar)) continue;
  const key = normalizeArabic(ar);
  if (!NORMALIZED_KEYWORDS.has(key)) NORMALIZED_KEYWORDS.set(key, { ar, js });
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** يقترح كلمة مفتاحية قريبة من كلمة كتبها المستخدم (يتحمّل التشكيل والأخطاء) */
function suggestKeyword(word) {
  const nw = normalizeArabic(word);
  let best = null;
  let bestD = Infinity;
  for (const k of KEYWORD_WORDS) {
    const d = levenshtein(nw, normalizeArabic(k));
    if (d < bestD) { bestD = d; best = k; }
  }
  const limit = nw.length <= 4 ? 1 : 2;
  return bestD <= limit && bestD < nw.length ? best : null;
}

// ==========================================================================
//  دوال مدمجة عربية (تُترجم مباشرة إلى نداءات جاهزة)
// ==========================================================================
const MACROS = {
  'اطبع':   { arity: null, js: (a) => `console.log(${a.join(', ')})`, doc: 'اطبع(…قيم) — طباعة إلى الطرفية' },
  'طول':    { arity: 1, js: (a) => `(${a[0]}).length`, doc: 'طول(قائمة|نص) — عدد العناصر' },
  'أضف':    { arity: 2, js: (a) => `(${a[0]}).push(${a[1]})`, doc: 'أضف(قائمة، عنصر)' },
  'رتب':    { arity: 1, js: (a) => `(${a[0]}).sort()`, doc: 'رتب(قائمة) — ترتيب' },
  'نص':     { arity: 1, js: (a) => `String(${a[0]})`, doc: 'نص(قيمة) — تحويل إلى نص' },
  'عدد':    { arity: 1, js: (a) => `Number(${a[0]})`, doc: 'عدد(قيمة) — تحويل إلى رقم' },
  'منطقي':  { arity: 1, js: (a) => `Boolean(${a[0]})`, doc: 'منطقي(قيمة) — تحويل إلى صحيح/خطأ' },
  'مفاتيح': { arity: 1, js: (a) => `Object.keys(${a[0]})`, doc: 'مفاتيح(كائن)' },
  'قيم':    { arity: 1, js: (a) => `Object.values(${a[0]})`, doc: 'قيم(كائن)' },
};

module.exports = {
  KEYWORDS, KEYWORD_WORDS, NORMALIZED_KEYWORDS, EXACT_ONLY,
  normalizeArabic, levenshtein, suggestKeyword, MACROS,
};
