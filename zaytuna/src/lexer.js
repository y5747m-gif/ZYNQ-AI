'use strict';

// ==========================================================================
//  زيتونة — المُعجّم (Lexer)
//  يميّز: الكلمات المفتاحية العربية، الأسماء (بما فيها الأسماء العربية)،
//  الأعداد (بأرقام عربية/هندية مع تحويل تلقائي)، النصوص («...» أو "..." أو '...')
//  ويطبّق سياسة أمان على الحروف غير المرئية.
// ==========================================================================

const { KEYWORDS, NORMALIZED_KEYWORDS, normalizeArabic, suggestKeyword } = require('./dictionary');
const { ZError, diag } = require('./errors');

// --- مجموعات الحروف ---
const C = (s) => s.codePointAt(0);
const RANGES = {
  AR_DIGITS: [0x0660, 0x0669],   // ٠-٩
  FA_DIGITS: [0x06f0, 0x06f9],   // ۰-۹
  BIDI: [
    [0x202a, 0x202e], [0x2066, 0x2069], [0x200e, 0x200f], [0x061c, 0x061c],
  ],
  ZERO_WIDTH: [[0x200b, 0x200d], [0x2060, 0x2064], [0xfeff, 0xfeff]],
  TAG_BLOCK: [[0xe0000, 0xe007f]],
  TATWEEL: 0x0640,
  AR_DECIMAL: 0x066b,   // ٫
  AR_THOUSANDS: 0x066c, // ٬
  AR_COMMA: 0x060c,     // ،
  AR_SEMICOLON: 0x061b, // ؛
  AR_QUESTION: 0x061f,  // ؟
};

function inRanges(cp, list) {
  for (const [a, b] of list) if (cp >= a && cp <= b) return true;
  return false;
}
function digitValue(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x30 && cp <= 0x39) return String.fromCharCode(cp);
  if (cp >= RANGES.AR_DIGITS[0] && cp <= RANGES.AR_DIGITS[1]) return String.fromCharCode(0x30 + cp - RANGES.AR_DIGITS[0]);
  if (cp >= RANGES.FA_DIGITS[0] && cp <= RANGES.FA_DIGITS[1]) return String.fromCharCode(0x30 + cp - RANGES.FA_DIGITS[0]);
  return null;
}
const isAsciiDigit = (ch) => ch >= '0' && ch <= '9';
const isAnyDigit = (ch) => digitValue(ch) !== null;
const isIdStart = (ch) => /[\p{L}_$]/u.test(ch);
const isIdPart = (ch) => /[\p{L}\p{M}\p{Nd}_$]/u.test(ch);

const PUNCT3 = ['===', '!=='];
const PUNCT2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '**', '+=', '-=', '*=', '/=', '%=', '++', '--'];
const PUNCT1 = [...'{}()[];,:.?=<>+-*/%!'];

class Lexer {
  constructor(source, opts = {}) {
    this.src = source;
    this.file = opts.file || '<ذاكرة>';
    this.diagnostics = opts.diagnostics || [];
    this.comments = [];
    this.i = 0;
    this.line = 1;
    this.col = 1;
  }

  at(off = 0) { return this.src[this.i + off]; }
  eof() { return this.i >= this.src.length; }
  advance() {
    const ch = this.src[this.i++];
    if (ch === '\n') { this.line++; this.col = 1; } else { this.col++; }
    return ch;
  }
  fail(code, message, extra = {}) {
    throw new ZError(code, message, extra.line ?? this.line, extra.col ?? this.col, extra);
  }

  /** سياسة الحروف غير المرئية: خطأ خارج النصوص والتعليقات، تحذير داخلها */
  checkInvisible(ch, where) {
    const cp = ch.codePointAt(0);
    if (inRanges(cp, RANGES.BIDI)) {
      const name = 'حرف اتجاه مخفي (Bidi)';
      if (where === 'code') {
        this.fail('Z101', `${name}: إنه هجوم «Trojan Source»: يحرف اتجاه عرض الكود فيُخفي ما ينفّذه فعلًا.`,
          { severity: 'security', suggestion: 'احذف هذا الحرف', hint: `الرمز U+${cp.toString(16).toUpperCase()}` });
      }
      diag(this.diagnostics, 'warning', 'Z101', `${name} داخل ${where === 'string' ? 'نص' : 'تعليق'} — يُفضّل حذفه.`,
        this.line, this.col, { hint: `U+${cp.toString(16).toUpperCase()}` });
      return false;
    }
    if (inRanges(cp, RANGES.ZERO_WIDTH) || inRanges(cp, RANGES.TAG_BLOCK)) {
      const tag = inRanges(cp, RANGES.TAG_BLOCK) ? 'حرف وسْم مخفي (Tag Block)' : 'حرف صفري العرض';
      if (where === 'code') {
        this.fail('Z102', `${tag}: غير مرئي تمامًا ويمكن استخدامه لحقن أوامر مخفية.`,
          { severity: 'security', suggestion: 'احذف هذا الحرف', hint: `U+${cp.toString(16).toUpperCase()}` });
      }
      diag(this.diagnostics, 'warning', 'Z102', `${tag} داخل ${where === 'string' ? 'نص' : 'تعليق'}.`,
        this.line, this.col, { hint: `U+${cp.toString(16).toUpperCase()}` });
      return false;
    }
    return true;
  }

  tokenize() {
    const tokens = [];
    while (!this.eof()) {
      const ch = this.at();
      const cp = ch.codePointAt(0);

      // فراغات (تشمل المسافة العربية غير الفاصلة)
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || cp === 0xa0 || cp === 0x2000) { this.advance(); continue; }

      // حروف غير مرئية في الكود
      if (!this.checkInvisible(ch, 'code')) { this.advance(); continue; }

      const startLine = this.line, startCol = this.col, start = this.i;

      // تعليقات
      if (ch === '/' && this.at(1) === '/') { this.readLineComment('//'); continue; }
      if (ch === '/' && this.at(1) === '*') { this.readBlockComment(); continue; }
      if (ch === '#') { this.readLineComment('#'); continue; }

      // نصوص
      if (ch === '"' || ch === "'" || ch === '`' || ch === '«' || ch === '”') {
        tokens.push(this.readString(startLine, startCol, start));
        continue;
      }

      // أعداد
      if (isAnyDigit(ch)) { tokens.push(this.readNumber(startLine, startCol, start)); continue; }

      // أسماء وكلمات مفتاحية
      if (isIdStart(ch)) { tokens.push(this.readWord(startLine, startCol, start)); continue; }

      // ترقيم عربي يُقبل كمرادف
      if (cp === RANGES.AR_COMMA || cp === RANGES.AR_SEMICOLON) {
        this.advance();
        const isComma = cp === RANGES.AR_COMMA;
        diag(this.diagnostics, 'info', 'Z201',
          `قُرِئت «${isComma ? '،' : '؛'}» كـ «${isComma ? ',' : ';'}» — الفاصلة العربية مقبولة، ويمكن إصلاحها تلقائيًا.`,
          startLine, startCol);
        tokens.push({ type: 'punc', value: isComma ? ',' : ';', ar: ch, raw: ch, line: startLine, col: startCol, start, end: this.i });
        continue;
      }
      if (cp === RANGES.AR_QUESTION) {
        this.fail('Z202', 'علامة استفهام عربية «؟» لا معنى لها في الكود — المقصود غالبًا «?» أو أنه خطأ مطبعي.',
          { line: startLine, col: startCol, suggestion: 'استبدل «؟» بـ «?» أو احذفها' });
      }
      if (cp === RANGES.TATWEEL) {
        diag(this.diagnostics, 'warning', 'Z203', 'التطويل «ـ» (تطويل الكلمة) غير مرئي المعنى لكنه يجعل الاسم يشبه اسمًا آخر.',
          startLine, startCol, { suggestion: 'احذف التطويل' });
        this.advance(); continue;
      }

      // ترقيم برمجي
      const three = this.src.slice(this.i, this.i + 3);
      if (PUNCT3.includes(three)) {
        this.advance(); this.advance(); this.advance();
        tokens.push({ type: 'op', value: three, raw: three, line: startLine, col: startCol, start, end: this.i });
        continue;
      }
      const two = this.src.slice(this.i, this.i + 2);
      if (PUNCT2.includes(two)) {
        this.advance(); this.advance();
        tokens.push({ type: 'op', value: two, raw: two, line: startLine, col: startCol, start, end: this.i });
        continue;
      }
      if (PUNCT1.includes(ch)) {
        this.advance();
        const isOp = '=<>+-*/%!'.includes(ch);
        tokens.push({ type: isOp ? 'op' : 'punc', value: ch, raw: ch, line: startLine, col: startCol, start, end: this.i });
        continue;
      }

      this.fail('Z001', `رمز غير معروف «${ch}» (U+${cp.toString(16).toUpperCase()}).`,
        { line: startLine, col: startCol, suggestion: 'تحقّق من لوحة المفاتيح — هل كتبت رمزًا عربيًا بالخطأ؟' });
    }
    tokens.push({ type: 'eof', value: '', line: this.line, col: this.col, start: this.i, end: this.i });
    return tokens;
  }

  readLineComment(_marker) {
    const line = this.line, col = this.col, start = this.i;
    let text = '';
    while (!this.eof() && this.at() !== '\n') {
      const ch = this.at();
      this.checkInvisible(ch, 'comment');
      text += ch;
      this.advance();
    }
    this.comments.push({ text, line, col, start, end: this.i, block: false });
  }

  readBlockComment() {
    const line = this.line, col = this.col, start = this.i;
    let text = '';
    this.advance(); this.advance(); // /*
    let closed = false;
    while (!this.eof()) {
      if (this.at() === '*' && this.at(1) === '/') { this.advance(); this.advance(); closed = true; break; }
      const ch = this.at();
      this.checkInvisible(ch, 'comment');
      text += ch;
      this.advance();
    }
    if (!closed) this.fail('Z002', 'تعليق غير مغلق — نسيت «*/».', { line, col, suggestion: 'أغلق التعليق بـ */' });
    this.comments.push({ text, line, col, start, end: this.i, block: true });
  }

  readString(line, col, start) {
    const open = this.at();
    const close = open === '«' ? '»' : open === '”' ? '“' : open;
    this.advance();
    let raw = '';
    let closed = false;
    while (!this.eof()) {
      const ch = this.at();
      if (ch === close) { this.advance(); closed = true; break; }
      if (ch === '\n' && close !== '`') {
        this.fail('Z003', 'نص غير مغلق — نهاية السطر وصلت قبل علامة الإغلاق.',
          { line, col, suggestion: `أغلق النص بـ ${close}` });
      }
      if (ch === '\\') { raw += ch + this.advance(); continue; }
      this.checkInvisible(ch, 'string');
      raw += ch;
      this.advance();
    }
    if (!closed) this.fail('Z003', 'نص غير مغلق حتى نهاية الملف.', { line, col, suggestion: `أغلق النص بـ ${close}` });

    // «...» تُترجم إلى "..." مع تأمين علامات التنصيص الداخلية
    let js;
    if (open === '«' || open === '”') {
      const safe = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      js = `"${safe}"`;
    } else {
      js = open + raw + close;
    }
    return { type: 'str', value: raw, js, quote: open, line, col, start, end: this.i };
  }

  readNumber(line, col, start) {
    let out = '';
    let usedArabic = false;
    let noteDecimal = false;

    // الجزء الصحيح
    while (!this.eof()) {
      const ch = this.at();
      const d = digitValue(ch);
      if (d !== null) {
        if (!isAsciiDigit(ch)) usedArabic = true;
        out += d; this.advance(); continue;
      }
      if (ch === '_') { this.advance(); continue; } // فاصل آلاف برمجي
      if (ch.codePointAt(0) === RANGES.AR_THOUSANDS) { this.advance(); continue; }
      break;
    }
    // الفاصلة العشرية
    if (this.at() === '.' || (this.at() && this.at().codePointAt(0) === RANGES.AR_DECIMAL)) {
      if (this.at().codePointAt(0) === RANGES.AR_DECIMAL) noteDecimal = true;
      out += '.'; this.advance();
      while (!this.eof() && isAnyDigit(this.at())) {
        const ch = this.at();
        if (!isAsciiDigit(ch)) usedArabic = true;
        out += digitValue(ch); this.advance();
      }
    }
    // الأس
    if (this.at() === 'e' || this.at() === 'E') {
      out += 'e'; this.advance();
      if (this.at() === '+' || this.at() === '-') { out += this.at(); this.advance(); }
      while (!this.eof() && isAnyDigit(this.at())) { out += digitValue(this.at()); this.advance(); }
    }
    // رقم ملتصق باسم: 5س
    if (!this.eof() && isIdStart(this.at())) {
      this.fail('Z204', `الرقم «${out}» ملتصق باسم «${this.at()}…» — يجب الفصل.`,
        { line, col, suggestion: `اكتب: ${out} ${this.at()}` });
    }
    if (usedArabic) {
      diag(this.diagnostics, 'info', 'Z205',
        `رقم مكتوب بالأرقام العربية/الهندية — حُوِّل تلقائيًا إلى ${out}. جافاسكربت وبايثون لا يقبلان الأرقام العربية في الأعداد.`,
        line, col, { suggestion: `استخدم ${out}` });
    }
    if (noteDecimal) {
      diag(this.diagnostics, 'info', 'Z206', 'استُخدمت الفاصلة العشرية العربية «٫» مكان «.»', line, col);
    }
    return { type: 'num', value: out, ar: this.src.slice(start, this.i), line, col, start, end: this.i };
  }

  readWord(line, col, start) {
    let word = '';
    while (!this.eof() && isIdPart(this.at())) {
      // حروف الوصل/ZWNJ داخل الاسم = خطر (تُخفي تشابهًا)
      const cp = this.at().codePointAt(0);
      if (inRanges(cp, RANGES.BIDI) || inRanges(cp, RANGES.ZERO_WIDTH)) {
        this.fail('Z103', 'حرف غير مرئي داخل اسم — يُستخدم للتخفّي وتشبيه الأسماء ببعضها.',
          { severity: 'security', line, col, suggestion: 'احذف الحرف', hint: `U+${cp.toString(16).toUpperCase()}` });
      }
      word += this.at();
      this.advance();
    }
    const raw = this.src.slice(start, this.i);

    // 1) تطابق تام مع الكلمة المفتاحية
    if (KEYWORDS.has(word)) {
      return { type: 'kw', ar: word, js: KEYWORDS.get(word), raw, line, col, start, end: this.i };
    }
    // ملاحظة تصميم: لا نُفسّر الأسماء المشابهة للكلمات المفتاحية تلقائيًا
    // (كي لا «تُخطَف» أسماء مثل «صنّف»)، بل نقترحها فقط عند حدوث خطأ نحوي.
    // 2) اسم عادي
    // ملاحظات جودة على الأسماء
    if (/[\u0660-\u0669\u06f0-\u06f9]/.test(word)) {
      diag(this.diagnostics, 'warning', 'Z208',
        `الاسم «${word}» يحتوي أرقامًا عربية تُشبه الأرقام اللاتينية — يمكن الخلط بينهما عند القراءة.`,
        line, col, { length: raw.length, suggestion: 'استخدم أرقامًا لاتينية داخل الأسماء' });
    }
    if (/[\u0621-\u064A]/.test(word) && /[A-Za-z]/.test(word)) {
      diag(this.diagnostics, 'warning', 'Z209',
        `الاسم «${word}» يخلط حروفًا عربية ولاتينية — قد يربك المراجعة.`,
        line, col, { length: raw.length });
    }
    if (word.includes('ـ'.repeat(1)) || word.includes('\u0640')) {
      diag(this.diagnostics, 'warning', 'Z210', `الاسم «${word}» يحتوي تطويلًا «ـ».`, line, col, { length: raw.length });
    }
    return { type: 'id', value: word, raw, line, col, start, end: this.i };
  }
}

module.exports = { Lexer, digitValue, isIdStart, isIdPart, RANGES, inRanges };
