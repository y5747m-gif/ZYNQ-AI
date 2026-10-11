'use strict';

// ==========================================================================
//  زيتونة — المصحّح التلقائي (Auto-Fix)
//  المستويات:
//   0 = حتمي وآمن   : حذف الحروف المخفية، تحويل الترقيم والأرقام العربية، الفاصلة العشرية
//   1 = قواعد لغوية : إعادة تسمية متسقة للأسماء المتشابهة (أرقام عربية/تطويل داخل الاسم)
//   2 = نموذج لغوي  : يُدار من الواجهة (ai.js) مع تحقق إلزامي قبل الكتابة
//  قاعدة ذهبية: لا يُكتب أي إصلاح قبل اجتيازه للتحقق من مدقّق اللغة الحقيقي.
// ==========================================================================

const { maskCode, posAt, scanText } = require('./security');
const { digitValue, isIdStart, isIdPart, RANGES } = require('./lexer');

const INVISIBLE_G =
  /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C\u200B-\u200D\u2060-\u2064\uFEFF\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]|[\u{E0000}-\u{E007F}]/gu;

const FUNC_CHAR = /[\p{L}\p{M}\p{Nd}_$]/u;

/**
 * خطة الإصلاح: قائمة تعديلات نصّية (start,end,replacement) + ما لم يُصلح.
 */
function planFixes(text, lang = 'js', tier = 0) {
  const { masked, strings, comments } = maskCode(text, lang);
  const edits = [];
  const skipped = [];
  const inProtected = (i) => strings.some((r) => i >= r.start && i < r.end) || comments.some((r) => i >= r.start && i < r.end);
  const add = (start, end, replacement, code, why) => {
    if (end > start && edits.some((e) => e.start < end && start < e.end)) return; // لا تداخل
    edits.push({ start, end, replacement, code, why });
  };

  // ---- 1) الحروف غير المرئية (تُحذف حتى داخل النصوص: لا لزوم لها في الكود) ----
  INVISIBLE_G.lastIndex = 0;
  let m;
  while ((m = INVISIBLE_G.exec(text)) !== null) {
    const isTag = m[0].codePointAt(0) >= 0xE0000;
    add(m.index, m.index + m[0].length, '', isTag ? 'Z104' : 'Z101',
      'حذف حرف غير مرئي (اتجاه/صفر عرض/وسم/تحكّم)');
  }

  // ---- 2) الترقيم العربي خارج النصوص والتعليقات ----
  const punct = [
    { ch: '\u060C', to: ',', why: 'فاصلة عربية «،» ← «,»' },
    { ch: '\u061B', to: ';', why: 'فاصلة منقوطة عربية «؛» ← «;»' },
  ];
  for (let i = 0; i < masked.length; i++) {
    for (const p of punct) if (masked[i] === p.ch && !inProtected(i)) add(i, i + 1, p.to, 'Z201', p.why);
    // «؟» تُحوَّل إلى «?» فقط عند وجود «:» في نفس العبارة (شرط ثلاثي)، وإلا نحتاج قرارًا بشريًا
    if (masked[i] === '\u061F' && !inProtected(i)) {
      const rest = masked.slice(i + 1);
      const nl = rest.search(/[\n;]/);
      const lineRest = nl === -1 ? rest : rest.slice(0, nl);
      if (lineRest.includes(':')) add(i, i + 1, '?', 'Z213', 'علامة استفهام عربية «؟» ← «?» (شرط ثلاثي)');
      else skipped.push({ index: i, length: 1, code: 'Z213', message: 'علامة استفهام عربية «؟» بلا شرط ثلاثي — نحتاج قرارًا بشريًا (حذف أو استبدال).' });
    }
    const cp = masked.codePointAt(i);
    if (cp === RANGES.AR_DECIMAL && !inProtected(i)) add(i, i + 1, '.', 'Z212', 'فاصلة عشرية عربية «٫» ← «.»');
    if (cp === RANGES.AR_THOUSANDS && !inProtected(i)) add(i, i + 1, '', 'Z212', 'حذف فاصلة الآلاف العربية «٬»');
    if (masked[i] === '\u0640' && !inProtected(i)) add(i, i + 1, '', 'Z210', 'حذف تطويل «ـ» من الكود');
  }

  // ---- 3) الأرقام العربية/الهندية ----
  const digitRe = /[\u0660-\u0669\u06F0-\u06F9]+/gu;
  let dm;
  while ((dm = digitRe.exec(masked)) !== null) {
    const s = dm.index, e = dm.index + dm[0].length;
    if (inProtected(s)) continue;
    const before = s > 0 ? masked[s - 1] : '';
    const after = e < masked.length ? masked[e] : '';
    // داخل اسم = الحرف السابق حرف/رقم؛ أما «٥ص» فالحرف التالي فقط حرف ⇒ رقم ملتصق باسم
    const inIdentifier = !!(before && FUNC_CHAR.test(before));
    const ascii = [...dm[0]].map((ch) => digitValue(ch)).join('');
    if (!inIdentifier) {
      add(s, e, ascii, 'Z211', `عدد عربي/هندي «${dm[0]}» ← «${ascii}»`);
      if (after && isIdStart(after)) add(e, e, ' ', 'Z204', 'فصل رقم عن الاسم الذي يليه');
    } else if (tier >= 1) {
      skipped.push({ index: s, length: dm[0].length, code: 'Z208', message: `أرقام عربية داخل الاسم «${dm[0]}» — تحتاج إعادة تسمية متسقة (المستوى 1).` });
    } else {
      skipped.push({ index: s, length: dm[0].length, code: 'Z208', message: `أرقام عربية داخل اسم — لم تُصلح في المستوى 0 (قد تكون جزءًا من الاسم).` });
    }
  }

  // ---- 4) المستوى 1: إعادة تسمية متسقة للأسماء المشكِلة ----
  if (tier >= 1) {
    const nameRe = /[\p{L}\p{M}\p{Nd}_$]+/gu;
    const seen = new Set();
    let nm;
    while ((nm = nameRe.exec(text)) !== null) {
      const word = nm[0];
      if (seen.has(word)) continue;
      const cleaned = [...word].map((ch) => digitValue(ch) ?? (ch === '\u0640' ? '' : ch)).join('');
      if (cleaned === word) continue;
      seen.add(word);
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const occ = new RegExp(`(?<![\\p{L}\\p{M}\\p{Nd}_$])${esc}(?![\\p{L}\\p{M}\\p{Nd}_$])`, 'gu');
      let om;
      while ((om = occ.exec(text)) !== null) {
        if (inProtected(om.index)) continue;
        add(om.index, om.index + word.length, cleaned, 'Z216', `إعادة تسمية متسقة: «${word}» ← «${cleaned}»`);
      }
    }
  }

  return { edits, skipped };
}

/** ترتيب + تطبيق التعديلات (لا تداخل، من النهاية للبداية) */
function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  const clean = [];
  let lastEnd = -1;
  for (const e of sorted) {
    if (e.start < lastEnd) continue;
    clean.push(e);
    lastEnd = e.end;
  }
  let out = text;
  for (let i = clean.length - 1; i >= 0; i--) {
    const e = clean[i];
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return { text: out, applied: clean };
}

/** إصلاح نصّي كامل (المستوى 0/1) */
function fixText(text, opts = {}) {
  const lang = opts.lang || 'js';
  const tier = opts.tier ?? 0;
  const { edits, skipped } = planFixes(text, lang, tier);
  const { text: fixed, applied } = applyEdits(text, edits);
  const changed = fixed !== text;
  const appliedList = applied.map((e) => {
    const { line, col } = posAt(text, e.start);
    const from = text.slice(e.start, e.end);
    return { code: e.code, line, col, from, to: e.replacement, why: e.why };
  });
  const remaining = scanText(fixed, { lang });
  return { text: fixed, changed, applied: appliedList, skipped, remaining };
}

module.exports = { fixText, planFixes, applyEdits };
