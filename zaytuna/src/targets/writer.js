'use strict';

// ==========================================================================
//  زيتونة — كاتب المخرجات: إزاحة + خريطة أسطر (عربي ↔ هدف)
// ==========================================================================

class Writer {
  constructor(indentUnit = '    ', lineEnd = '') {
    this.lines = [];
    this.map = [];
    this.indent = 0;
    this.unit = indentUnit;
    this.lineEnd = lineEnd;
    this.build = [];        // أجزاء تُبنى سطريًا (للإزاحة المتغيرة)
    this.commentIdx = 0;
  }

  push(text = '', arLine = null) {
    const full = this.unit.repeat(this.indent) + text + this.lineEnd;
    this.lines.push(full);
    this.map.push({ outLine: this.lines.length, arLine });
  }

  /** نصّ التعليق مجرّدًا من علاماته الأصلية (سطرية أو كتلية) */
  static commentBody(text) {
    let t = String(text == null ? '' : text).replace(/\s+$/, '');
    if (/^\/\*/.test(t)) t = t.replace(/^\/\*/, '').replace(/\*\/$/, '');
    else t = t.replace(/^\s*(?:\/\/+|#+)\s?/, '');
    return t.replace(/\s+$/, '');
  }

  /** تعليق الملف المصدري كما هو، بصيغة اللغة الهدف */
  flushComments(beforeLine, comments, prefix) {
    if (!comments) return;
    while (this.commentIdx < comments.length && comments[this.commentIdx].line < beforeLine) {
      const c = comments[this.commentIdx++];
      this.push(`${prefix}${Writer.commentBody(c.text)}`, c.line);
    }
  }

  flushRest(comments, prefix) {
    if (!comments) return;
    while (this.commentIdx < comments.length) {
      const c = comments[this.commentIdx++];
      this.push(`${prefix}${Writer.commentBody(c.text)}`, c.line);
    }
  }

  /** إدراج أسطر في موضع سابق مع تصحيح خريطة الأسطر (للإعلانات المستنتجة لاحقًا) */
  insert(at, newLines) {
    if (!newLines.length) return;
    this.lines.splice(at, 0, ...newLines);
    for (const m of this.map) if (m.outLine > at) m.outLine += newLines.length;
    for (let i = 0; i < newLines.length; i++) this.map.push({ outLine: at + i + 1, arLine: null });
  }

  toString() { return this.lines.join('\n') + '\n'; }

  /** آخر سطر غير فارغ (للتحقق من أقواس الإغلاق) */
  lastNonEmpty() {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i].trim()) return this.lines[i].trim();
    }
    return '';
  }

  dropLastEmpty() {
    if (this.lines.length && this.lines[this.lines.length - 1].trim() === '') {
      this.lines.pop();
      this.map.pop();
    }
  }
}

module.exports = { Writer };
