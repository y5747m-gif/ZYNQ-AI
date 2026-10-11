#!/usr/bin/env node
'use strict';

// ==========================================================================
//  توليد مصفوفة التحقق: كل هدف × كل مثال — بنتيجة حقيقية مُنفَّذة الآن.
//  الاستخدام:  node tools/matrix.js [--out ../docs/VERIFICATION_MATRIX.md]
//  لا نكتب شيئًا لم نُشغّله: كل خليّة ناتجة عن تشغيل فعلي لهذه اللحظة.
// ==========================================================================

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const outArgIdx = process.argv.indexOf('--out');
const OUT = outArgIdx > -1 ? path.resolve(process.argv[outArgIdx + 1]) : path.join(root, '..', 'docs', 'VERIFICATION_MATRIX.md');

const { translateReport } = require(path.join(root, 'src', 'index'));
const { listTargets } = require(path.join(root, 'src', 'targets'));

const EXAMPLES = ['مرحبا', 'حاسبة', 'اختر_وبسط', 'أنماط_وأنواع'];
const TIER_AR = { compiler: '1 · مترجم حقيقي', structural: '2 · فحص بنيوي', none: '3 · بلا تحقق' };

function cell(r) {
  const v = r.verification || {};
  const un = (r.unsupported || []).length;
  let mark;
  if (v.tier === 'compiler') mark = v.verified ? (v.run && v.run.ran && v.run.ok ? '✅ مُتحقَّق + نُفِّذ' : '✅ مُتحقَّق') : '✖ فشل الفحص';
  else if (v.tier === 'structural') mark = v.structuralVerified ? '🔎 بنيوي سليم' : '✖ بنيوي مكسور';
  else mark = '⚠ لم نتحقق';
  if (v.tier === 'compiler' && r.reference && r.reference.match === false) mark += ' · النتيجة مختلفة';
  if (un) mark += ` · ${un} غير مدعوم`;
  return mark;
}

function main() {
  const targets = listTargets().filter((t) => !t.planned);
  const rows = [];
  const notes = [];
  const sources = {};
  for (const ex of EXAMPLES) sources[ex] = fs.readFileSync(path.join(root, 'examples', `${ex}.zy`), 'utf8');

  for (const ex of EXAMPLES) {
    const row = { example: ex, cells: {} };
    for (const t of targets) {
      const r = translateReport(sources[ex], t.id, { file: `${ex}.zy`, timeout: 30000 });
      row.cells[t.id] = r;
      for (const u of (r.unsupported || [])) notes.push({ ex, id: t.id, kind: u.kind });
    }
    rows.push(row);
  }

  const ver = require(path.join(root, 'package.json')).version || '';
  const node = process.version;
  const lines = [];
  lines.push('# مصفوفة التحقق — زيتونة');
  lines.push('');
  lines.push('> **مولَّدة آليًا** بأمر `node tools/matrix.js` — كل خليّة ناتجة عن تشغيل حقيقي في هذه اللحظة، لا عن وعد.');
  lines.push(`> الإصدار \`${ver}\` · Node ${node} · ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## الطبقات المستخدمة');
  lines.push('');
  lines.push('| الطبقة | ما فعلناه بالضبط في هذه اللحظة |');
  lines.push('|---|---|');
  lines.push('| **1 · مترجم حقيقي** | شغّلنا مترجم/مدقّق اللغة على المخرج، ثم شغّلنا المخرج وقارنّا نتيجته بجافاسكربت |');
  lines.push('| **2 · فحص بنيوي** | لا مترجم مثبّت على هذا الجهاز ⇒ بنينا شجرة الصياغة الرسمية للغة (tree-sitter) |');
  lines.push('| **3 · بلا تحقق** | لا مترجم ولا قواعد ⇒ «لم نتحقق» ولا ندّعي نجاحًا |');
  lines.push('');
  lines.push('## المصفوفة (' + targets.length + ' هدفًا × ' + EXAMPLES.length + ' أمثلة)');
  lines.push('');
  lines.push('| المثال \\ الهدف | ' + targets.map((t) => `${t.label} \`${t.ext}\``).join(' | ') + ' |');
  lines.push('|' + '---|'.repeat(targets.length + 1));
  for (const row of rows) {
    const cells = targets.map((t) => {
      const r = row.cells[t.id];
      if (!r || r.ok === false) return '⛔ لم تُترجم';
      return cell(r);
    });
    lines.push(`| **${row.example}** | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('**قراءة الجدول:** ✅ «مُتحقَّق» تعني مترجمًا حقيقيًا قبِل المخرج (و«نُفِّذ» تعني أننا شغّلناه فعلًا)،');
  lines.push('🔎 «بنيوي سليم» تعني أن **القواعد الرسمية للغة** قبلت المخرج **وليس** أن مترجمًا فحصه.');
  lines.push('');

  // تفصيل: أدوات التحقق المتاحة الآن، وتلك الغائبة مع أمر التثبيت
  lines.push('## ما هو مثبَّت على هذا الجهاز الآن');
  lines.push('');
  const probes = [
    ['node --check', ['node']], ['python3/py_compile', ['python3', 'python']], ['gcc', ['gcc', 'cc']], ['g++', ['g++', 'c++']],
    ['java (javac)', ['javac']], ['go', ['go']], ['rustc', ['rustc']], ['php', ['php']], ['ruby', ['ruby']], ['dotnet (C#)', ['dotnet', 'csc']],
    ['tree-sitter (قواعد 8 لغات)', null],
  ];
  const { resolveTool } = require(path.join(root, 'src', 'checkers'));
  const { structuralAvailable } = require(path.join(root, 'src', 'targets', 'parsecheck'));
  lines.push('| الأداة | متاحة؟ |');
  lines.push('|---|---|');
  for (const [label, tools] of probes) {
    const ok = tools === null ? structuralAvailable() : !!resolveTool(tools);
    lines.push(`| ${label} | ${ok ? '✔ نعم' : '✖ لا'} |`);
  }
  lines.push('');
  if (notes.length) {
    lines.push('## ما لم يُترجم (مُعلَن صريحًا، لا يمرّ بصمت)');
    lines.push('');
    const seen = new Set();
    for (const n of notes) {
      const key = n.ex + '|' + n.id + '|' + n.kind;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- **${n.ex}** → \`${n.id}\`: ${n.kind}`);
    }
    lines.push('');
  }
  lines.push('## كيف تعيد إنتاج هذه المصفوفة');
  lines.push('');
  lines.push('```bash');
  lines.push('cd zaytuna && node tools/matrix.js --out ../docs/VERIFICATION_MATRIX.md');
  lines.push('```');
  lines.push('');
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`✔ كُتبت المصفوفة: ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} بايت)`);
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const row of rows) for (const t of targets) { const v = row.cells[t.id].verification || {}; if (v.tier === 'compiler') counts[1]++; else if (v.tier === 'structural') counts[2]++; else counts[3]++; }
  console.log(`   الطبقة 1: ${counts[1]} خليّة · الطبقة 2: ${counts[2]} · الطبقة 3: ${counts[3]}`);
}

main();
