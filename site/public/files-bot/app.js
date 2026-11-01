/* ZYNQ BOT 2.0 — مساعد ملفات عربي، بحث حقيقي ومعاينات من الأصول نفسها. */
(function () {
  'use strict';
  const Bot = window.ZynqBot;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  if (!Bot) {
    $('#result-count').textContent = 'تعذّر تحميل المساعد. حدّث الصفحة لتنزيل ملفات الإصدار الجديد.';
    return;
  }
  const state = { files: [], query: '', category: '', group: 'all', sort: 'new', page: 1, newOnly: false };
  const groups = {
    effects: ['effects'], images: ['avatars', 'logos', 'icons', 'wallpapers'],
    audio: ['ringtones', 'nature', 'alerts'], documents: ['texts', 'json', 'csv', 'zip'], code: ['html', 'js', 'css'],
  };
  const emoji = { avatars: '👤', logos: '🏷️', icons: '🔹', wallpapers: '🖼️', ringtones: '🎵', nature: '🌿', alerts: '🔔', texts: '📝', json: '🗂️', csv: '📊', html: '🌐', js: '📜', css: '🎨', zip: '📦', effects: '✦' };
  const grid = $('#files-grid');
  const dialog = $('#file-dialog');
  const pageSize = 12;
  let pages = 1;
  let selected = null;
  let preview = null;
  let modalPreview = null;
  let returnFocus = null;
  let searchTimer;
  let loadGeneration = 0;
  const previews = new Map();
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPaused = motionQuery.matches;
  try { if (localStorage.getItem('zynq-motion-paused') !== null) motionPaused = localStorage.getItem('zynq-motion-paused') === '1'; } catch (_) { /* optional */ }

  const normalize = (value) => String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const fmtSize = (bytes) => bytes < 1024 ? bytes + ' بايت' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' كيلوبايت' : (bytes / 1048576).toFixed(2) + ' ميغابايت';
  const countText = (n) => n === 0 ? 'لم أجد ملفات مطابقة' : n === 1 ? 'وجدت ملفًا واحدًا' : n === 2 ? 'وجدت ملفين' : n <= 10 ? 'وجدت ' + n + ' ملفات' : 'وجدت ' + n + ' ملفًا';
  const isNew = (file) => file.id.startsWith('fx-bot-');
  const stage = Bot.mount($('#hero-bot'), { pose: 'present', expression: 'happy', alive: true });
  $('#brand-bot').innerHTML = Bot.markup('files-brand-2', { view: 'head', mini: true, expression: 'happy' });
  let savedTheme = 'royal';
  try { savedTheme = localStorage.getItem('zynq-bot-theme') || 'royal'; } catch (_) { /* optional */ }
  Bot.applyTheme(savedTheme);

  function reply(text, speak) {
    $('#hero-speech').textContent = text;
    const message = document.createElement('p');
    message.className = 'chat-message';
    message.textContent = text;
    const log = $('#chat-log');
    log.appendChild(message);
    while (log.children.length > 6) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
    if (speak) {
      stage.say(text, { expression: 'happy', then: 'happy' });
      const sound = Bot.voice.status();
      if (!sound.muted && sound.mode !== 'beep' && !sound.available) {
        const notice = document.createElement('p');
        notice.className = 'chat-message voice-notice';
        notice.textContent = 'الرد مكتوب بالعربية، لكن الجهاز لا يوفر صوتًا عربيًا. افتح «إعدادات الصوت العربي» لتثبيته أو اختيار صوت آخر.';
        log.appendChild(notice);
        log.scrollTop = log.scrollHeight;
      }
    }
  }
  $('#hero-hit').addEventListener('click', () => {
    stage.wave({ silent: true });
    reply('أهلًا بيك! أنا مساعد زينك. اسألني عن مؤثر أو أنيميشن أو صوت، وهنفتح الملفات المناسبة مع بعض.', true);
  });
  $('#hero-bot').addEventListener('click', () => $('#hero-hit').click());
  window.ZynqVoiceControls.init();

  function filtered() {
    const terms = normalize(state.query).split(' ').filter(Boolean);
    let list = state.files.filter((file) => {
      if (state.newOnly && !isNew(file)) return false;
      if (state.category && file.category !== state.category) return false;
      if (state.group !== 'all' && !(groups[state.group] || []).includes(file.category)) return false;
      const hay = normalize([file.name, file.desc, file.categoryAr, file.effectCategoryAr, file.ext, file.format, ...(file.tags || [])].join(' '));
      return terms.every((term) => hay.includes(term));
    });
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    else if (state.sort === 'size') list.sort((a, b) => a.size - b.size);
    else list.sort((a, b) => Number(isNew(b)) - Number(isNew(a)) || Number(b.category === 'effects') - Number(a.category === 'effects'));
    return list;
  }
  function isPreview(file) { return /^(svg|gif|png|jpg|webp)$/.test(file.ext) || file.format === 'Lottie JSON'; }
  function syncControls() {
    $('#search').value = state.query;
    $('#category-select').value = state.category;
    $('#sort-select').value = state.sort;
    $$('#group-tabs button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.group === state.group)));
    $('#show-new').textContent = state.newOnly ? 'عرض كل المؤثرات' : 'استعرض الحزمة';
    $('#show-new').setAttribute('aria-pressed', String(state.newOnly));
    $('#motion-toggle').textContent = motionPaused ? '▶ تشغيل الحركة' : '⏸ إيقاف الحركة';
    $('#motion-toggle').setAttribute('aria-pressed', String(motionPaused));
    document.documentElement.classList.toggle('motion-paused', motionPaused);
  }
  function render(reset) {
    if (reset) state.page = 1;
    const list = filtered();
    pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.page = Math.max(1, Math.min(state.page, pages));
    for (const item of previews.values()) item.destroy();
    previews.clear();
    grid.replaceChildren();
    grid.setAttribute('aria-busy', 'false');
    $('#result-count').textContent = countText(list.length) + (state.files.length ? ' من أصل ' + state.files.length : '') + (state.newOnly ? ' · حزمة البوت الجديدة' : '');
    $('#empty').hidden = list.length !== 0;
    $('#page-label').textContent = 'صفحة ' + state.page + ' من ' + pages;
    $('#prev-page').disabled = state.page <= 1;
    $('#next-page').disabled = state.page >= pages;
    syncControls();
    list.slice((state.page - 1) * pageSize, state.page * pageSize).forEach((file) => {
      const card = document.createElement('article');
      card.className = 'file-card';
      const thumb = document.createElement('div');
      thumb.className = 'file-thumb';
      if (isPreview(file)) {
        const controller = window.ZynqPreview.mount(thumb, file, { thumbnail: true, paused: motionPaused });
        previews.set(file.id, controller);
      } else {
        const symbol = document.createElement('span');
        symbol.textContent = emoji[file.category] || '📄';
        symbol.setAttribute('aria-hidden', 'true');
        thumb.appendChild(symbol);
      }
      if (isNew(file)) {
        const badge = document.createElement('span');
        badge.className = 'card-new';
        badge.textContent = 'جديد';
        thumb.appendChild(badge);
      }
      const body = document.createElement('div');
      body.className = 'file-body';
      const name = document.createElement('h3');
      name.textContent = file.name;
      const description = document.createElement('p');
      description.textContent = file.tagline || file.desc;
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      [file.effectCategoryAr || file.categoryAr, file.ext.toUpperCase(), fmtSize(file.size)].forEach((text) => {
        const span = document.createElement('span'); span.textContent = text; meta.appendChild(span);
      });
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      const open = document.createElement('button');
      open.type = 'button'; open.className = 'btn btn-ghost btn-sm'; open.textContent = 'معاينة';
      open.setAttribute('aria-label', 'معاينة ' + file.name);
      open.addEventListener('click', () => openFile(file, open));
      const download = document.createElement('button');
      download.type = 'button'; download.className = 'btn btn-primary btn-sm'; download.textContent = '⬇ تحميل';
      download.setAttribute('aria-label', 'تحميل ' + file.name);
      download.addEventListener('click', () => downloadFile(file, download));
      actions.append(open, download);
      body.append(name, description, meta, actions);
      card.append(thumb, body);
      grid.appendChild(card);
    });
  }
  function resetFilters() {
    clearTimeout(searchTimer);
    Object.assign(state, { query: '', category: '', group: 'all', newOnly: false, page: 1 });
    render(true);
  }
  function showGroup(group, newOnly) {
    clearTimeout(searchTimer);
    Object.assign(state, { query: '', category: '', group: group || 'all', newOnly: !!newOnly });
    render(true);
  }
  $('#search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const query = event.target.value;
    searchTimer = setTimeout(() => { state.query = query; state.newOnly = false; render(true); }, 220);
  });
  $('#search-clear').addEventListener('click', () => { clearTimeout(searchTimer); state.query = ''; render(true); $('#search').focus(); });
  $('#category-select').addEventListener('change', (event) => { state.category = event.target.value; state.group = 'all'; state.newOnly = false; render(true); });
  $('#sort-select').addEventListener('change', (event) => { state.sort = event.target.value; render(true); });
  $('#group-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-group]');
    if (button) { state.category = ''; showGroup(button.dataset.group, false); }
  });
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#empty-reset').addEventListener('click', resetFilters);
  $('#show-new').addEventListener('click', () => { const next = !state.newOnly; showGroup(next ? 'effects' : 'all', next); });
  $('#prev-page').addEventListener('click', () => { state.page--; render(); $('#files').scrollIntoView({ behavior: motionPaused ? 'auto' : 'smooth' }); });
  $('#next-page').addEventListener('click', () => { state.page++; render(); $('#files').scrollIntoView({ behavior: motionPaused ? 'auto' : 'smooth' }); });
  function syncMotion() {
    syncControls();
    for (const controller of previews.values()) controller.setPaused(motionPaused);
    if (modalPreview) { modalPreview.setPaused(motionPaused); syncPreviewButton(); }
  }
  $('#motion-toggle').addEventListener('click', () => {
    motionPaused = !motionPaused;
    try { localStorage.setItem('zynq-motion-paused', motionPaused ? '1' : '0'); } catch (_) { /* optional */ }
    syncMotion();
  });
  motionQuery.addEventListener('change', (event) => { motionPaused = event.matches; syncMotion(); });

  function openFile(file, trigger) {
    selected = file;
    returnFocus = trigger || document.activeElement;
    $('#dialog-title').textContent = file.name;
    $('#dialog-category').textContent = file.effectCategoryAr || file.categoryAr;
    $('#dialog-desc').textContent = file.desc;
    $('#dialog-usage').textContent = file.usage || (/^(wav|mp3)$/.test(file.ext) ? 'استمع إلى العينة، أو حمّل الملف واستخدمه في مشروعك الصوتي.' : file.ext === 'zip' ? 'فك الضغط أولًا. اقرأ الملفات المرفقة قبل الاستيراد في برنامج التصميم.' : 'حمّل الملف وافتحه في محرر النصوص أو البرنامج المناسب لصيغته. ملفات HTML وSVG يمكن فتحها في المتصفح.');
    $('#dialog-meta').textContent = [file.format || file.ext.toUpperCase(), file.quality, file.fps, fmtSize(file.size)].filter(Boolean).join(' · ');
    if (modalPreview) modalPreview.destroy();
    modalPreview = window.ZynqPreview.mount($('#dialog-preview'), file, { paused: motionPaused });
    $('#preview-toggle').hidden = !isPreview(file);
    syncPreviewButton();
    dialog.showModal();
    document.body.classList.add('dialog-open');
    $('#dialog-close').focus();
  }
  function syncPreviewButton() {
    $('#preview-toggle').textContent = motionPaused ? '▶ تشغيل المعاينة' : '⏸ إيقاف المعاينة';
    $('#preview-toggle').setAttribute('aria-pressed', String(motionPaused));
  }
  $('#preview-toggle').addEventListener('click', () => {
    motionPaused = !motionPaused;
    try { localStorage.setItem('zynq-motion-paused', motionPaused ? '1' : '0'); } catch (_) { /* optional */ }
    syncMotion();
  });
  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (modalPreview) { modalPreview.destroy(); modalPreview = null; }
    document.body.classList.remove('dialog-open');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  });
  $('#dialog-speak').addEventListener('click', () => {
    if (selected) reply(selected.name + '. ' + selected.desc, true);
  });
  $('#dialog-download').addEventListener('click', () => { if (selected) downloadFile(selected, $('#dialog-download')); });

  async function downloadFile(file, button) {
    if (button && button.disabled) return;
    const oldLabel = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'جارٍ التجهيز…'; }
    const status = $('#download-status');
    status.textContent = 'جارٍ تجهيز ' + file.name + '…';
    try {
      const url = new URL(file.url, window.location.origin);
      if (url.origin !== window.location.origin) throw new Error('رابط غير مسموح');
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error('الملف غير متاح');
      const blob = await response.blob();
      if (!blob.size) throw new Error('الملف فارغ');
      const objectURL = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectURL;
      anchor.download = file.url.split('/').pop();
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectURL), 30000);
      status.textContent = 'تم إرسال «' + file.name + '» إلى تنزيلات المتصفح (' + fmtSize(blob.size) + '). أكّد الحفظ من المتصفح إذا طلب ذلك.';
    } catch (_) {
      status.textContent = 'تعذّر تنزيل «' + file.name + '». تحقّق من الاتصال ثم اضغط تحميل مرة أخرى.';
    } finally {
      if (button) { button.disabled = false; button.textContent = oldLabel; }
    }
  }

  function ask(raw) {
    const text = String(raw || '').trim().slice(0, 200);
    if (!text) { $('#chat-input').focus(); return; }
    if (!state.files.length) { reply('قائمة الملفات لم تُحمّل بعد. اضغط «إعادة المحاولة» بجوار نتيجة البحث ثم اسألني مرة تانية.', true); return; }
    const q = normalize(text);
    let answer;
    if (/كم ملف|عدد الملفات|كام ملف/.test(q)) {
      answer = 'المكتبة فيها ' + state.files.length + ' ملفًا، منها ' + state.files.filter((f) => f.category === 'effects').length + ' مؤثرًا وأنيميشن. استخدم التصنيفات للتصفح.';
      showGroup('all');
    } else if (/ازاي|كيف|استخدم|استعمال|تركيب/.test(q) && /لوتي|lottie|مؤثر|انيميشن|افكت/.test(q)) {
      answer = 'ملفات Lottie بصيغة JSON: افتح المعاينة هنا، أو شغّلها في الويب بمكتبة lottie-web. في أفتر إيفكت استخدم إضافة Lottie أو Bodymovin. لبريمير يلزم تصدير الحركة إلى فيديو أولًا. افتح أي مؤثر وهتلاقي طريقة الاستخدام تحت المعاينة.';
      showGroup('effects');
    } else if (/جديد|حزمه البوت|حزمة البوت/.test(q)) {
      showGroup('effects', true);
      answer = 'فتحت لك حزمة البوت الجديدة: ' + filtered().length + ' حركة للترحيب والتفكير والحديث والتحميل والنجاح. اضغط معاينة على أي بطاقة قبل التنزيل.';
    } else if (/صوت|نغم|موسيق|تنبيه/.test(q) && !/الصوت العربي|صوت البوت/.test(q)) {
      showGroup('audio');
      answer = 'عرضت ملفات الصوت: نغمات وتنبيهات ومحاكاة أصوات طبيعية. اضغط معاينة ثم زر التشغيل للاستماع؛ الصوت لا يبدأ تلقائيًا.';
    } else if (/صور|شعار|ايقون|خلفي|تصميم/.test(q)) {
      showGroup('images');
      answer = 'عرضت الصور والشعارات والأيقونات والخلفيات. ' + countText(filtered().length) + '. افتح المعاينة للتفاصيل.';
    } else if (/كود|اكود|برمج|سكريبت|css|html|javascript/.test(q)) {
      showGroup('code');
      answer = 'فتحت ملفات الأكواد وصفحات الويب والأنماط. تقدر تعاين النص وتحمّل الملف الأصلي.';
    } else if (/نص|وثيق|بيانات|json|csv/.test(q)) {
      showGroup('documents');
      answer = 'عرضت النصوص والبيانات والأرشيفات. اختار ملفًا لقراءة وصفه ومعاينته.';
    } else if (/مؤثر|مؤثرات|افكت|انيميشن|أنيميشن|animation|effect|حركه|لوتي|lottie|svg/.test(q)) {
      showGroup('effects');
      state.query = /برق/.test(q) ? 'برق' : /تحميل|تنزيل/.test(q) ? 'تحميل' : /نجاح|صح/.test(q) ? 'نجاح' : '';
      render(true);
      answer = countText(filtered().length) + ' في مكتبة المؤثرات والحركة. المعاينة هنا من ملف الحركة نفسه، وتقدر توقف الحركة من الزر أعلى المحادثة.';
    } else if (/مرحبا|اهلا|سلام|هاي|ازيك/.test(q)) {
      answer = 'أهلًا بيك! أقدر أعرض لك المؤثرات والأنيميشن والصور والصوت والأكواد. قول لي نوع الملف اللي محتاجه.';
    } else {
      clearTimeout(searchTimer);
      const search = text.replace(/^(ابحث عن|ابحث|دور على|عايز|عاوز|هات|وريني)\s+/u, '');
      Object.assign(state, { query: search, category: '', group: 'all', newOnly: false });
      render(true);
      const n = filtered().length;
      answer = n ? countText(n) + ' مطابقة لطلبك. عرضتها في المكتبة؛ افتح المعاينة أو حمّل الملف المناسب.' : 'لم أجد «' + search + '». جرّب كلمة مثل: برق، تحميل، صوت، شعار أو أنيميشن. أقدر أبحث في الملفات، لكني لست نموذج دردشة عامًا.';
    }
    reply(answer, true);
    $('#chat-input').value = '';
  }
  $('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); ask($('#chat-input').value); });
  $$('[data-ask]').forEach((button) => button.addEventListener('click', () => ask(button.dataset.ask)));

  async function loadFiles() {
    const generation = ++loadGeneration;
    grid.setAttribute('aria-busy', 'true');
    $('#result-count').textContent = 'جارٍ تحميل قائمة الملفات…';
    try {
      // المسار الصحيح بالنسبة لصفحة المساعد، وليس /files-bot/files.json القديم.
      const response = await fetch(new URL('../files/files.json?v=2.0.0', window.location.href), { cache: 'no-store' });
      if (!response.ok) throw new Error('تعذّر تحميل القائمة');
      const data = await response.json();
      if (generation !== loadGeneration) return;
      if (!Array.isArray(data.files) || !data.files.length || !data.categories) throw new Error('قائمة الملفات غير صالحة');
      state.files = data.files;
      $$('[data-total]').forEach((el) => { el.textContent = data.files.length; });
      $$('[data-effects]').forEach((el) => { el.textContent = data.files.filter((f) => f.category === 'effects').length; });
      $$('[data-new]').forEach((el) => { el.textContent = data.files.filter(isNew).length; });
      const select = $('#category-select');
      select.replaceChildren(new Option('كل التصنيفات', ''));
      Object.entries(data.categories).forEach(([id, name]) => select.add(new Option(name + ' (' + data.files.filter((f) => f.category === id).length + ')', id)));
      render(true);
    } catch (_) {
      if (generation !== loadGeneration) return;
      grid.setAttribute('aria-busy', 'false');
      $('#result-count').textContent = 'تعذّر تحميل قائمة الملفات. لم نعرض قائمة قديمة بدلًا منها.';
      const retry = document.createElement('button');
      retry.className = 'btn btn-ghost btn-sm'; retry.type = 'button'; retry.textContent = 'إعادة المحاولة';
      retry.addEventListener('click', loadFiles, { once: true });
      $('#result-count').appendChild(document.createTextNode(' '));
      $('#result-count').appendChild(retry);
    }
  }
  syncMotion();
  loadFiles();
})();
