'use strict';

// ==========================================================================
//  زيتونة — عرض التشخيصات بالعربية (طرفية + JSON)
//  كل رسالة: رمز + موضع دقيق + شرح + إصلاح مقترح.
// ==========================================================================

const { SEVERITY_LABEL } = require('./errors');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  error: '\x1b[31m', warning: '\x1b[33m', info: '\x1b[36m', security: '\x1b[35m',
  green: '\x1b[32m', cyan: '\x1b[36m',
};

const ICON = { error: '✖', warning: '⚠', info: 'ℹ', security: '⛔' };

function paint(text, color, useColor) {
  if (!useColor) return text;
  return `${C[color] || ''}${text}${C.reset}`;
}

function lineOf(source, line) {
  return String(source).split(/\r?\n/)[line - 1] ?? '';
}

/** تشخيص واحد منسّق */
function formatDiagnostic(d, source, useColor = false) {
  const sev = d.severity || 'error';
  const label = SEVERITY_LABEL[sev] || sev;
  const head = `${ICON[sev] || '•'} ${label} ${d.code} — السطر ${d.line}، العمود ${d.col}: ${d.message}`;
  const lines = [paint(head, sev === 'security' ? 'security' : sev, useColor)];
  const src = lineOf(source, d.line);
  if (src) {
    lines.push('  ' + paint(String(d.line).padStart(4) + ' │ ', 'dim', useColor) + src);
    const len = Math.max(1, d.length || 1);
    const caret = ' '.repeat(5 + 2 + Math.max(0, (d.col || 1) - 1)) + paint('^'.repeat(len), sev, useColor);
    lines.push(caret);
  }
  if (d.suggestion) lines.push('    ↳ ' + paint('الإصلاح المقترح: ', 'green', useColor) + d.suggestion);
  if (d.hint) lines.push('    ' + paint('ⓘ ' + d.hint, 'dim', useColor));
  return lines.join('\n');
}

function sortDiags(diags) {
  return [...diags].sort((a, b) => (a.line - b.line) || (a.col - b.col) || String(a.code).localeCompare(String(b.code)));
}

function summarize(diags) {
  const s = { error: 0, security: 0, warning: 0, info: 0, autoFixable: 0 };
  for (const d of diags) {
    s[d.severity] = (s[d.severity] || 0) + 1;
    if (d.fix) s.autoFixable++;
  }
  s.total = diags.length;
  return s;
}

function summaryLine(diags, file, useColor = false) {
  const s = summarize(diags);
  if (!s.total) return paint(`✔ ${file}: لا مشاكل — نظيف.`, 'green', useColor);
  const bits = [];
  if (s.security) bits.push(paint(`${s.security} خطر أمني`, 'security', useColor));
  if (s.error) bits.push(paint(`${s.error} خطأ`, 'error', useColor));
  if (s.warning) bits.push(paint(`${s.warning} تحذير`, 'warning', useColor));
  if (s.info) bits.push(paint(`${s.info} ملاحظة`, 'info', useColor));
  let out = `⚠ ${file}: ${bits.join(' · ')}`;
  if (s.autoFixable) out += ` — يمكن الإصلاح تلقائيًا: ${s.autoFixable}`;
  return out;
}

function formatAll(diags, source, { useColor = false, file = '' } = {}) {
  const sorted = sortDiags(diags);
  const body = sorted.map((d) => formatDiagnostic(d, source, useColor)).join('\n\n');
  return (file ? '' : '') + body + (body ? '\n\n' : '') + summaryLine(sorted, file, useColor);
}

/** فرق أسطر مبسّط للعرض (قبل/بعد) */
function lineDiff(before, after, useColor = false) {
  const a = String(before).split('\n');
  const b = String(after).split('\n');
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(paint(`- ${String(i + 1).padStart(4)} │ `, 'error', useColor) + a[i]);
    if (b[i] !== undefined) out.push(paint(`+ ${String(i + 1).padStart(4)} │ `, 'green', useColor) + b[i]);
  }
  return out.join('\n');
}

module.exports = { formatDiagnostic, formatAll, summaryLine, summarize, sortDiags, lineDiff, paint };
