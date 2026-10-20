/* ==========================================================================
   ZYNQ FX — منطق الواجهة: فلترة حسب البرنامج والنوع + معاينات متحركة + نافذة التفاصيل
   ========================================================================== */
'use strict';

const state = {
  catalog: null,
  programs: new Set(),
  categories: new Set(),
  search: '',
  sort: 'default',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------
   معاينات متحركة بالكامل داخل الصفحة (CSS خالص) لكل نوع أصل
   ------------------------------------------------------------------ */
function previewHTML(kind, big = false) {
  const wrap = (inner) => inner;
  switch (kind) {
    case 'sweep':
      return wrap(`<div class="pv pv-sweep"></div><div class="pv pv-glow"></div>`);
    case 'burst':
      return wrap(`<div class="pv pv-ring"><i></i><i></i><div class="pv-core"></div></div>`);
    case 'flare':
      return wrap(`<div class="pv pv-streak"></div><div class="pv pv-glow"></div>`);
    case 'pulse':
      return wrap(`<div class="pv pv-glow"></div><div class="pv pv-ring"><div class="pv-core"></div></div>`);
    case 'bokeh':
      return wrap(`
        <div class="pv pv-orb" style="width:22%;height:36%;top:14%;right:12%"></div>
        <div class="pv pv-orb" style="width:14%;height:24%;top:52%;right:34%;animation-delay:.8s"></div>
        <div class="pv pv-orb" style="width:18%;height:30%;top:24%;left:16%;animation-delay:1.6s"></div>
        <div class="pv pv-orb" style="width:10%;height:18%;top:60%;left:38%;animation-delay:2.2s"></div>`);
    case 'burn':
      return wrap(`<div class="pv pv-burn"></div>`);
    case 'glitch':
      return wrap(`
        <div class="pv pv-jitter" style="top:22%;right:10%;width:52%"></div>
        <div class="pv pv-jitter" style="top:38%;right:34%;width:40%;background:#14c8c8;animation-delay:.2s"></div>
        <div class="pv pv-jitter" style="top:52%;right:16%;width:60%;background:#e84545;animation-delay:.4s"></div>
        <div class="pv pv-jitter" style="top:68%;right:42%;width:34%;animation-delay:.6s"></div>
        <div class="pv pv-glow"></div>`);
    case 'particles':
      return wrap(`
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:-110px;--dy:-70px"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:110px;--dy:-60px;background:#14c8c8;animation-delay:.15s"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:-80px;--dy:70px;background:#e84545;animation-delay:.3s"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:90px;--dy:75px;animation-delay:.45s"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:0;--dy:-110px;background:#fff8e7;animation-delay:.6s"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:-140px;--dy:10px;animation-delay:.75s"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:140px;--dy:15px;background:#14c8c8;animation-delay:.9s"></div>`);
    case 'sparks':
      return wrap(`
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:-120px;--dy:-80px;background:#ffd23f"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:120px;--dy:-85px;background:#fff8e7;animation-delay:.12s"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:-100px;--dy:85px;background:#e84545;animation-delay:.24s"></div>
        <div class="pv pv-dot" style="top:50%;left:50%;--dx:105px;--dy:80px;animation-delay:.36s"></div>
        <div class="pv pv-streak"></div>`);
    case 'rings':
      return wrap(`<div class="pv pv-ring"><i></i><i></i></div>
        <div class="pv pv-slam"><i style="width:22%;height:22%;border-radius:12px;background:#e84545"></i></div>`);
    case 'lower':
      return wrap(`
        <div class="pv" style="display:flex;flex-direction:column;justify-content:center;gap:10px;padding:0 12%">
          <div class="pv-bar" style="width:74%"></div>
          <div class="pv-bar" style="width:52%;height:11px;background:#fff8e7;animation-delay:.35s"></div>
        </div>`);
    case 'slam':
      return wrap(`<div class="pv pv-slam"><i></i></div>`);
    case 'whip':
      return wrap(`<div class="pv pv-whip"><i></i><i></i><i></i><i></i></div>`);
    case 'hud':
      return wrap(`<div class="pv pv-hud"><i></i><i></i><i></i><i></i><div class="pv pv-scanline"></div></div>`);
    case 'progress':
      return wrap(`<div class="pv pv-progress"><i></i></div>`);
    case 'neon':
      return wrap(`<div class="pv pv-neon"></div>`);
    case 'ink':
      return wrap(`<div class="pv pv-ink"><i></i></div>`);
    case 'luts':
      return wrap(`<div class="pv pv-lut"><i></i><i></i><i></i><i></i></div>`);
    case 'code':
      return wrap(`<div class="pv pv-code">
        <div><b>overshoot</b>() { <span class="caret"></span></div>
        <div>&nbsp;&nbsp;vel * Math.sin(t * freq)</div>
        <div>&nbsp;&nbsp;&nbsp;&nbsp;/ Math.exp(decay * t);</div>
        <div>}</div>
        <div style="margin-top:6px"><b>smooth</b>(pos, 0.35);</div>
      </div>`);
    default:
      return wrap(`<div class="pv pv-glow"></div>`);
  }
}

/* ------------------------------------------------------------------
   أدوات
   ------------------------------------------------------------------ */
function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function programById(id) {
  return state.catalog.programs.find((p) => p.id === id);
}
function categoryById(id) {
  return state.catalog.categories.find((c) => c.id === id);
}

/* ------------------------------------------------------------------
   رسم قسم البرامج
   ------------------------------------------------------------------ */
function renderPrograms() {
  const row = $('#programs-row');
  const descs = {
    'after-effects': 'Lottie + تسلسلات PNG + تعابير جاهزة',
    premiere: 'أوفرلاي + LUT + انتقالات بالسحب والإفلات',
    resolve: 'تسلسلات PNG بشفافية + لوكات .cube',
    'final-cut': 'أوفرلاي GIF + تسلسلات + لوكات',
    web: 'Lottie + SVG تعمل في المتصفح والموبايل',
  };
  row.innerHTML = state.catalog.programs.map((p) => `
    <div class="program-card">
      <div class="program-dot" style="background:${p.color}">${esc(p.short)}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(descs[p.id] || '')}</p>
    </div>`).join('');
}

/* ------------------------------------------------------------------
   رسم الفلاتر
   ------------------------------------------------------------------ */
function renderChips() {
  const progRow = $('#program-chips');
  progRow.innerHTML = state.catalog.programs.map((p) => `
    <button class="chip chip-prog" type="button" data-program="${p.id}"
      aria-pressed="false" style="--chip:${p.color}">${esc(p.name)}</button>`).join('');

  const catRow = $('#category-chips');
  catRow.innerHTML = state.catalog.categories.map((c) => `
    <button class="chip chip-cat" type="button" data-category="${c.id}"
      aria-pressed="false" title="${esc(c.tagline)}">${esc(c.name)}</button>`).join('');

  progRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-program]');
    if (!btn) return;
    toggleSet(state.programs, btn.dataset.program, btn);
  });
  catRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    toggleSet(state.categories, btn.dataset.category, btn);
  });
}

function toggleSet(set, id, btn) {
  if (set.has(id)) { set.delete(id); btn.setAttribute('aria-pressed', 'false'); btn.style.background = ''; }
  else {
    set.add(id); btn.setAttribute('aria-pressed', 'true');
    if (btn.classList.contains('chip-prog')) {
      const p = programById(id);
      btn.style.background = p ? p.color : '';
    }
  }
  renderGrid();
}

/* ------------------------------------------------------------------
   شبكة الأصول
   ------------------------------------------------------------------ */
function filteredItems() {
  let items = state.catalog.items.slice();
  if (state.programs.size) items = items.filter((it) => it.programs.some((p) => state.programs.has(p)));
  if (state.categories.size) items = items.filter((it) => state.categories.has(it.category));
  if (state.search) {
    const q = state.search.trim().toLowerCase();
    items = items.filter((it) => {
      const cat = categoryById(it.category);
      const hay = [it.name, it.tagline, it.description, it.format, cat ? cat.name : '',
        ...it.programs.map((p) => (programById(p) || {}).name || '')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if (state.sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  else if (state.sort === 'size') items.sort((a, b) => (b.size || 0) - (a.size || 0));
  return items;
}

function renderGrid() {
  const grid = $('#grid');
  const items = filteredItems();
  $('#result-count').textContent = items.length === 0
    ? 'لا نتائج'
    : items.length === 1 ? 'أصل واحد' : items.length === 2 ? 'أصلان' : items.length <= 10 ? `${items.length} أصول` : `${items.length} أصلًا`;
  $('#empty').hidden = items.length !== 0;

  grid.innerHTML = items.map((it, i) => {
    const progPills = it.programs.map((pid) => {
      const p = programById(pid);
      return p ? `<span class="pill" style="background:${p.color}">${esc(p.short)}</span>` : '';
    }).join('');
    return `
    <article class="card" data-id="${esc(it.id)}" tabindex="0" role="button"
      aria-label="${esc(it.name)}" style="animation-delay:${Math.min(i * 45, 500)}ms">
      <div class="preview">
        ${previewHTML(it.preview)}
        <span class="pv-label">${esc(it.format)}</span>
        ${it.badge ? `<span class="pv-badge">${esc(it.badge)}</span>` : ''}
      </div>
      <div class="card-body">
        <h3>${esc(it.name)}</h3>
        <p class="card-tagline">${esc(it.tagline)}</p>
        <div class="card-meta">
          ${progPills}
          <span class="pill pill-fmt">${esc(it.quality)}</span>
        </div>
        <div class="card-foot">
          <span class="card-size">${fmtSize(it.size)}</span>
          <span class="btn btn-red">⬇ تحميل</span>
        </div>
      </div>
    </article>`;
  }).join('');
}

/* ------------------------------------------------------------------
   نافذة التفاصيل
   ------------------------------------------------------------------ */
function openModal(id) {
  const it = state.catalog.items.find((x) => x.id === id);
  if (!it) return;
  const modal = $('#modal');
  $('#modal-preview').innerHTML = previewHTML(it.preview, true);
  $('#modal-tags').innerHTML = [
    `<span class="pill pill-fmt">${esc(it.format)}</span>`,
    ...it.programs.map((pid) => {
      const p = programById(pid);
      return p ? `<span class="pill" style="background:${p.color}">${esc(p.name)}</span>` : '';
    }),
    it.badge ? `<span class="pill" style="background:var(--red);color:var(--cream)">${esc(it.badge)}</span>` : '',
  ].join('');
  $('#modal-title').textContent = it.name;
  $('#modal-tagline').textContent = it.tagline;
  $('#modal-desc').textContent = it.description;
  $('#modal-specs').innerHTML = `
    <div class="spec-item"><small>الصيغة</small><b>${esc(it.format)}</b></div>
    <div class="spec-item"><small>المقاس</small><b>${esc(it.quality)}</b></div>
    <div class="spec-item"><small>معدل الإطارات</small><b>${esc(it.fps)}</b></div>
    <div class="spec-item"><small>حجم الملف</small><b>${fmtSize(it.size)}</b></div>`;
  $('#modal-usage').textContent = it.usage;
  const dl = $('#modal-download');
  dl.href = '/' + it.file;
  dl.setAttribute('download', '');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
}

/* ------------------------------------------------------------------
   الإحصائيات + ظهور التمرير
   ------------------------------------------------------------------ */
function animateCounters() {
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const dur = 1100;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------
   التشغيل
   ------------------------------------------------------------------ */
async function boot() {
  let catalog = null;
  try {
    const r = await fetch('/api/catalog');
    if (r.ok) catalog = await r.json();
  } catch (_) { /* تجاهل */ }
  if (!catalog) {
    try {
      const r = await fetch('catalog.json');
      catalog = await r.json();
    } catch (err) {
      console.error('تعذّر تحميل الكتالوج', err);
      return;
    }
  }
  state.catalog = catalog;

  renderPrograms();
  renderChips();
  renderGrid();
  setupReveal();
  animateCounters();

  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderGrid();
  });
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderGrid();
  });

  $('#grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openModal(card.dataset.id);
  });
  $('#grid').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.card');
    if (card) { e.preventDefault(); openModal(card.dataset.id); }
  });

  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

document.addEventListener('DOMContentLoaded', boot);
