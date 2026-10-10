'use strict';

const $ = (id) => document.getElementById(id);
const state = { targets: [], examples: [], last: null };

async function jget(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`فشل الطلب: ${r.status}`);
  return r.json();
}

function fillTargets(targets) {
  const sel = $('target');
  sel.innerHTML = '';
  for (const t of targets) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${t.planned ? '· ' : ''}${t.label}  (${t.en})${t.ext ? '  ' + t.ext : ''}`;
    o.disabled = !!t.planned;
    o.title = t.desc || '';
    sel.appendChild(o);
  }
  state.targets = targets;
  sel.value = 'py';
  updateTitle();
}

async function fillExamples() {
  const { examples } = await jget('/api/examples');
  state.examples = examples;
  const sel = $('examples');
  sel.innerHTML = '<option value="">— أمثلة جاهزة —</option>';
  for (const e of examples) {
    const o = document.createElement('option');
    o.value = e.name;
    o.textContent = e.name;
    sel.appendChild(o);
  }
}

function updateTitle() {
  const t = state.targets.find((x) => x.id === $('target').value);
  $('out-title').textContent = t ? `المخرج (${t.label})` : 'المخرج';
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function renderReport(data) {
  const box = $('report');
  box.innerHTML = '';
  const add = (text, cls = '') => {
    const d = document.createElement('div');
    d.className = 'line ' + cls;
    d.innerHTML = text;
    box.appendChild(d);
  };
  if (!data.ok) { add('✖ ' + esc(data.reason || 'تعذّرت الترجمة'), 'err'); return; }

  for (const d of data.diagnostics || []) add(`⚠ ${esc(d.code)} · سطر ${d.line}: ${esc(d.message)}`, 'warn');

  if (!data.unsupported.length) add('✔ كل السطور تُرجمت — لا شيء غير مدعوم.', 'ok');
  else {
    const items = data.unsupported.slice(0, 10).map((u) => `• ${esc(u.kind)}${u.line ? ` (سطر ${u.line})` : ''}`).join('<br>');
    add(`⚠ مواضع غير مدعومة في هذه اللغة (${data.unsupported.length}):<br>${items}`, 'warn');
  }
  for (const n of (data.notes || []).slice(0, 6)) add(`ملاحظة: ${esc(n)}`);

  const v = data.verification;
  if (v) {
    if (v.verified && v.syntaxOk) add(`✔ فحص البنية بمترجم/مدقّق حقيقي (${esc(v.kind)}).`, 'ok');
    else if (!v.verified) add(`⚠ لم نتحقق من البنية: المدقّق غير متاح على هذا الجهاز — لا نعلن نجاحًا.`, 'warn');
    else add(`✖ فحص البنية فشل (${esc(v.kind)}).<br><code>${esc((v.syntaxOutput || '').split('\n').slice(0, 6).join('\n'))}</code>`, 'err');

    if (v.ran) {
      if (v.runOk) add(`✔ شُغّل المخرج فعليًا بـ${esc(v.tool)} ونجح التنفيذ.`, 'ok');
      else add(`✖ فشل التشغيل بـ${esc(v.tool)} (رمز ${v.runOk === false ? '≠0' : '؟'}).<br><code>${esc((v.stderr || '').split('\n').slice(0, 6).join('\n'))}</code>`, 'err');
    } else if (v.tool === null) add('⚠ لا طريقة تشغيل معروفة لهذه اللغة بعد.', 'warn');
    else if (v.tool) add(`⚠ لم نُشغّل المخرج: الأداة «${esc(v.tool)}» غير مثبّتة على هذا الجهاز.`, 'warn');

    if (data.reference) add(data.reference.match
      ? '✔ نتيجة التنفيذ مطابقة تمامًا لمخرج جافاسكربت.'
      : '⚠ نتيجة التنفيذ مختلفة عن جافاسكربت — راجع المواضع غير المدعومة أعلاه.', data.reference.match ? 'ok' : 'warn');

    const out = $('stdout');
    if (v.stdout && v.stdout.trim()) { out.hidden = false; out.textContent = v.stdout; }
    else out.hidden = true;
  }
}

async function translate() {
  const btn = $('translate');
  const src = $('source').value;
  $('diagnostics').innerHTML = '';
  if (!src.trim()) { $('status').textContent = 'اكتب كودًا عربيًا أولًا…'; return; }
  btn.disabled = true;
  $('status').textContent = 'نترجم ونتحقق…';
  $('stdout').hidden = true;
  try {
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: src, target: $('target').value, run: $('run').checked }),
    });
    const data = await r.json();
    state.last = data;
    if (data.ok) {
      $('code').textContent = data.code;
      const t = state.targets.find((x) => x.id === data.target);
      $('out-title').textContent = `المخرج (${data.label}${t && t.ext ? ' ' + t.ext : ''})`;
    } else {
      $('code').innerHTML = `<span class="hint">${esc(data.reason || 'تعذّرت الترجمة')}</span>`;
    }
    const diag = $('diagnostics');
    for (const d of data.diagnostics || []) {
      const el = document.createElement('div');
      el.className = 'd';
      el.textContent = `${d.code} · سطر ${d.line}: ${d.message}`;
      diag.appendChild(el);
    }
    renderReport(data);
    $('status').textContent = `انتهى في ${data.ms} مللي ثانية`;
  } catch (e) {
    $('status').textContent = 'خطأ: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

function download() {
  if (!state.last || !state.last.ok) return;
  const t = state.targets.find((x) => x.id === state.last.target);
  const blob = new Blob([state.last.code], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `زيتونة${(t && t.ext) || '.txt'}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function loadExample(name) {
  if (!name) return;
  const { source } = await jget('/api/example?name=' + encodeURIComponent(name));
  $('source').value = source;
}

async function boot() {
  const { targets } = await jget('/api/targets');
  fillTargets(targets);
  await fillExamples();
  const preferred = state.examples.find((e) => e.name === 'حاسبة.zy') || state.examples[0];
  if (preferred) { await loadExample(preferred.name); $('examples').value = preferred.name; }

  $('target').addEventListener('change', updateTitle);
  $('translate').addEventListener('click', translate);
  $('examples').addEventListener('change', (e) => loadExample(e.target.value));
  $('clear').addEventListener('click', () => { $('source').value = ''; $('code').innerHTML = '<span class="hint">سيظهر الكود المترجم هنا…</span>'; $('report').innerHTML = ''; $('stdout').hidden = true; });
  $('copy').addEventListener('click', async () => {
    if (!state.last || !state.last.ok) return;
    try { await navigator.clipboard.writeText(state.last.code); $('status').textContent = 'نُسخ الكود ✓'; } catch (_) { $('status').textContent = 'تعذّر النسخ'; }
  });
  $('download').addEventListener('click', download);
  $('source').addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') translate(); });
}

boot().catch((e) => { $('status').textContent = 'تعذّر التحميل: ' + e.message; });
