'use strict';

// ==========================================================================
//  زيتونة — الحارس (فاحص الأمان والحروف المخفية)
//  يكشف: أحرف الاتجاه (Trojan Source) · الحروف صفرية العرض · وسوم الحقن ·
//  التطويل · الأرقام الهندية في الأعداد · الترقيم العربي في الكود ·
//  الأسماء المتشابهة (confusables) · خلط اللغات في الاسم الواحد.
// ==========================================================================

const { digitValue, isIdStart, isIdPart, RANGES, inRanges } = require('./lexer');
const { familyOf } = require('./languages');

// عائلات «سطح» الكود: التعليقات وعلامات التنصيص لكل مجموعة لغات
const FAMILY = {
  js: { line: ['//', '#'], block: [['/*', '*/']], quotes: ["'", '"', '`', '«'], triple: false },
  zy: { line: ['//', '#'], block: [['/*', '*/']], quotes: ["'", '"', '`', '«'], triple: false },
  py: { line: ['#'], block: [], quotes: ["'", '"'], triple: true },
  clike: { line: ['//'], block: [['/*', '*/']], quotes: ["'", '"', '`', '«'], triple: false },
  php: { line: ['//', '#'], block: [['/*', '*/']], quotes: ["'", '"', '«'], triple: false },
  hash: { line: ['#'], block: [], quotes: ["'", '"', '`', '«'], triple: false },
};

/** يقسّم النص إلى: كود مكشوف (masked) + فترات النصوص والتعليقات */
function maskCode(text, lang) {
  const fam = FAMILY[familyOf(lang)] || FAMILY.js;
  const out = Array.from(text);
  const strings = [];
  const comments = [];
  const mask = (s, e) => {
    for (let k = s; k < e; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    // تعليقات كتلية
    const block = fam.block.find(([o]) => rest.startsWith(o));
    if (block) {
      const end = text.indexOf(block[1], i + block[0].length);
      const e = end === -1 ? text.length : end + block[1].length;
      comments.push({ start: i, end: e });
      mask(i, e);
      i = e;
      continue;
    }
    // تعليقات سطرية
    if (fam.line.some((m) => text.startsWith(m, i))) {
      let e = text.indexOf('\n', i);
      if (e === -1) e = text.length;
      comments.push({ start: i, end: e });
      mask(i, e);
      i = e;
      continue;
    }
    // نصوص ثلاثية (بايثون)
    if (fam.triple && (rest.startsWith("'''") || rest.startsWith('"""'))) {
      const q = rest.slice(0, 3);
      const end = text.indexOf(q, i + 3);
      const e = end === -1 ? text.length : end + 3;
      strings.push({ start: i, end: e });
      mask(i, e);
      i = e;
      continue;
    }
    // نصوص عادية
    const q = fam.quotes.find((c) => text[i] === c);
    if (q) {
      const close = q === '«' ? '»' : q;
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === close) { closed = true; j++; break; }
        if (text[j] === '\n' && q !== '`') break;
        j++;
      }
      const e = closed ? j : text.length;
      strings.push({ start: i, end: e });
      mask(i, e);
      i = e;
      continue;
    }
    i++;
  }
  return { masked: out.join(''), strings, comments, fam };
}

/** موضع (سطر، عمود) من فهرس حرف */
function posAt(text, index) {
  let line = 1, col = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, col };
}

const INVISIBLE_SETS = [
  { code: 'Z101', re: /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/gu, label: 'حرف اتجاه مخفي (Bidi)', fix: 'احذفه', severity: 'security', hint: 'هجوم Trojan Source: يقلب اتجاه عرض السطر فيظهر الكود معكوسًا عمّا ينفّذه المترجم' },
  { code: 'Z104', re: /[\u{E0000}-\u{E007F}]/gu, label: 'حرف وسْم مخفي (Tag Block)', fix: 'احذفه', severity: 'security', hint: 'يُستخدم لحقن تعليمات غير مرئية' },
  { code: 'Z105', re: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, label: 'حرف تحكّم غير مرئي', fix: 'احذفه', severity: 'error', hint: 'قد يخرّب الطرفية أو السجلات' },
  { code: 'Z102', re: /[\u200B\u2060-\u2064\uFEFF]/gu, label: 'حرف صفري العرض', fix: 'احذفه', severity: 'security', hint: 'غير مرئي تمامًا — يُستخدم لإخفاء تعليمات أو تفريق الكلمات' },
  { code: 'Z102', re: /[\u200C\u200D]/gu, label: 'حرف وصل غير مرئي (ZWJ/ZWNJ)', fix: 'احذفه', severity: 'warning', hint: 'مشروع في النص العربي، لكنه في الكود يجعل الاسم يشبه اسمًا آخر' },
];

const CONFUSABLE_GROUPS = [
  ['ي', 'ى'], ['ك', 'ک'], ['ه', 'ة'],
  ['٠', '0'], ['١', '1'], ['٢', '2'], ['٣', '3'], ['٤', '4'], ['٥', '5'], ['٦', '6'], ['٧', '7'], ['٨', '8'], ['٩', '9'],
];

/**
 * الفحص الكامل.
 * @returns {Array} تشخيصات موحّدة الشكل مع «إصلاح» اختياري
 */
function scanText(text, opts = {}) {
  const lang = opts.lang || 'js';
  const { masked } = maskCode(text, lang);
  const findings = [];
  const add = (severity, code, message, index, length, extra = {}) => {
    const { line, col } = posAt(text, index);
    findings.push({ severity, code, message, line, col, length, index, ...extra });
  };

  // 1) الحروف غير المرئية
  for (const set of INVISIBLE_SETS) {
    set.re.lastIndex = 0;
    let m;
    while ((m = set.re.exec(text)) !== null) {
      add(set.severity, set.code,
        `${set.label}: U+${m[0].codePointAt(0).toString(16).toUpperCase()}`,
        m.index, m[0].length,
        { hint: set.hint, suggestion: set.fix, fix: { start: m.index, end: m.index + m[0].length, replacement: '' } });
    }
  }

  // 2) التطويل (خارج النصوص)
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '\u0640') {
      add('warning', 'Z210', 'تطويل «ـ» خارج النص — يجعل الاسم يشبه اسمًا آخر دون أن يبدو مختلفًا.',
        i, 1, { suggestion: 'احذف التطويل', fix: { start: i, end: i + 1, replacement: '' } });
    }
  }

  // 3) الترقيم العربي خارج النصوص
  const punctMap = [
    { ch: '\u060C', to: ',', label: 'فاصلة عربية «،»', severity: 'info', code: 'Z201' },
    { ch: '\u061B', to: ';', label: 'فاصلة منقوطة عربية «؛»', severity: 'info', code: 'Z201' },
  ];
  for (let i = 0; i < masked.length; i++) {
    for (const p of punctMap) {
      if (masked[i] === p.ch) {
        add(p.severity, p.code,
          `${p.label} موجودة في الكود — لغات البرمجة لا تعرفها.`,
          i, 1,
          { suggestion: `استبدلها بـ «${p.to}»`, fix: { start: i, end: i + 1, replacement: p.to } });
      }
    }
    // علامة الاستفهام العربية: «؟» تُقبل فقط إذا كان معناها الشرط الثلاثي (؟ … : …)
    if (masked[i] === '\u061F') {
      const rest = masked.slice(i + 1);
      const nl = rest.search(/[\n;]/);
      const lineRest = nl === -1 ? rest : rest.slice(0, nl);
      if (lineRest.includes(':')) {
        add('error', 'Z213', 'علامة استفهام عربية «؟» استُخدمت مكان «?» في شرط ثلاثي.', i, 1,
          { suggestion: 'استبدلها بـ «?»', fix: { start: i, end: i + 1, replacement: '?' } });
      } else {
        add('error', 'Z213', 'علامة استفهام عربية «؟» لا معنى لها في الكود — ولا تساوي «?» البرمجية.', i, 1,
          { suggestion: 'احذفها، أو اكتب «?» إن كنت تقصد الشرط الثلاثي (؟ : ) — ولا نُصلحها تلقائيًا بلا قرينة' });
      }
    }
  }

  // 4) الفاصلة العشرية/فاصلة الآلاف العربية
  for (let i = 0; i < masked.length; i++) {
    const cp = masked.codePointAt(i);
    if (cp === RANGES.AR_DECIMAL) {
      add('error', 'Z212', 'الفاصلة العشرية العربية «٫» غير مسموحة في الأعداد.', i, 1,
        { suggestion: 'استبدلها بـ «.»', fix: { start: i, end: i + 1, replacement: '.' } });
    }
    if (cp === RANGES.AR_THOUSANDS) {
      add('error', 'Z212', 'فاصلة الآلاف العربية «٬» غير مسموحة في الأعداد.', i, 1,
        { suggestion: 'احذفها', fix: { start: i, end: i + 1, replacement: '' } });
    }
  }

  // 5) الأرقام العربية/الهندية: سياق عدد أم سياق اسم؟
  const digitRe = /[\u0660-\u0669\u06F0-\u06F9]+/gu;
  let dm;
  while ((dm = digitRe.exec(masked)) !== null) {
    const s = dm.index, e = dm.index + dm[0].length;
    const before = s > 0 ? masked[s - 1] : '';
    const after = e < masked.length ? masked[e] : '';
    const inIdentifier = !!(before && (isIdPart(before) || digitValue(before) !== null));
    if (inIdentifier) {
      add('warning', 'Z208',
        `أرقام عربية «${dm[0]}» داخل اسم — تُشبه الأرقام اللاتينية وقد تُخفي فرقًا عند المراجعة.`,
        s, dm[0].length, { suggestion: 'استخدم أرقامًا لاتينية داخل الأسماء' });
    } else {
      const ascii = [...dm[0]].map((ch) => digitValue(ch)).join('');
      add('error', 'Z211',
        `عدد مكتوب بأرقام عربية/هندية «${dm[0]}» — لغات البرمجة لا تقبلها في الأعداد (خطأ حقيقي عند المترجم).`,
        s, dm[0].length,
        { suggestion: `استبدله بـ «${ascii}»`, fix: { start: s, end: e, replacement: ascii }, ascii });
      if (after && isIdStart(after)) {
        add('error', 'Z204', 'رقم ملتصق باسم بعده — يجب إضافة مسافة.', e, 1,
          { suggestion: 'أضف مسافة', fix: { start: e, end: e, replacement: ' ' } });
      }
      // ملاحظة: لو كان الحرف السابق حرفًا (اسم) نكون في فرع «الاسم» أعلاه
    }
  }

  // 6) الأسماء المتشابهة وخلط اللغات
  const idRe = /[\p{L}\p{M}\p{Nd}_$]+/gu;
  let im;
  while ((im = idRe.exec(masked)) !== null) {
    const word = im[0];
    if (word.length < 2) continue;
    for (const g of CONFUSABLE_GROUPS) {
      const present = g.filter((ch) => word.includes(ch));
      if (present.length > 1) {
        add('warning', 'Z214',
          `اسم «${word}» يخلط حروفًا متشابهة (${present.join(' / ')}) — خطر خطأ بصري عند القراءة والمراجعة.`,
          im.index, word.length, { suggestion: 'وحّد الحرف المستخدم' });
        break;
      }
    }
    if (/[\u0621-\u064A]/.test(word) && /[A-Za-z]/.test(word)) {
      add('warning', 'Z209', `اسم «${word}» يخلط حروفًا عربية ولاتينية.`, im.index, word.length,
        { suggestion: 'اختر لغة واحدة داخل الاسم' });
    }
    if (/[\u064B-\u065F\u0670]/.test(word) && word.length > 2) {
      add('info', 'Z215', `اسم «${word}» يحتوي تشكيلًا — يمكن الخلط بينه وبين الاسم بلا تشكيل.`,
        im.index, word.length, { suggestion: 'أزل التشكيل من الأسماء' });
    }
  }

  return findings;
}

module.exports = { scanText, maskCode, posAt, CONFUSABLE_GROUPS };
