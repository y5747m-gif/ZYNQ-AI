/* ==========================================================================
   ZYNQ FX — صفحة مساعد الملفات
   يربط روبوت ZYNQ BOT بقائمة الملفات: بحث، تصفية، تحميل، وكل التفاعل بالعربية.
   ========================================================================== */
(function () {
  'use strict';

  const Bot = window.ZynqBot;
  if (!Bot) return;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ------------------------------------------------------------ عناصر الصفحة
  const grid = $('#files-grid');
  const chipsWrap = $('#chips');
  const countEl = $('#result-count');
  const search = $('#search');
  const heroHost = $('#hero-bot');
  const heroSpeech = $('#hero-speech');
  const muteBtn = $('#btn-mute');
  const brandSlot = $('#brand-bot');

  let files = [];
  let stage = null;
  let greeted = false;

  // ------------------------------------------------------------rocmuoji
  function bubble(el, text, ms) {
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, ms || 3600);
  }

  // ------------------------------------------------------------ حجم الملف
  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '-';
    const k = 1024;
    if (bytes < k) return bytes + ' بايت';
    if (bytes < k * k) return (bytes / k).toFixed(1) + ' كيلوبايت';
    return (bytes / (k * k)).toFixed(2) + ' ميغابايت';
  }

  // ------------------------------------------------------------ رموز التصنيف
  const CAT_EMOJI = {
    avatars: '👤', logos: '🏷️', icons: '🔹', wallpapers: '🖼️',
    ringtones: '🎵', nature: '🌿', alerts: '🔔', texts: '📝',
    json: '🗂️', csv: '📊', html: '🌐', js: '📜', css: '🎨', zip: '📦',
  };
  function catEmoji(c) { return CAT_EMOJI[c] || '📄'; }

  // ------------------------------------------------------------ تحميل البيان
  let manifest = null;
  async function loadFiles() {
    try {
      const res = await fetch('files.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('تعذّر تحميل بيان الملفات');
      manifest = await res.json();
      files = manifest.files || [];
      build();
    } catch (err) {
      if (grid) grid.innerHTML = `<div style="grid-column:1/-1;padding:26px;color:#ec4899;border:1px solid rgba(236,72,153,.4);border-radius:12px;background:rgba(236,72,153,.08)">
        تعذّر تحميل قائمة الملفات: ${err.message}</div>`;
      if (countEl) countEl.textContent = 'تعذّر تحميل القائمة';
    }
  }

  // ------------------------------------------------------------ بناء الواجهة
  function build() {
    if (!grid || !chipsWrap) return;

    // أزرار التصنيفات
    chipsWrap.innerHTML = '';
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = 'chip is-on';
    allChip.textContent = 'الكل';
    allChip.dataset.cat = '';
    allChip.addEventListener('click', () => selectChip(allChip));
    chipsWrap.appendChild(allChip);

    const cats = [...new Set(files.map((f) => f.category))].sort();
    cats.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = `${catEmoji(c)} ${manifest.categories[c] || c}`;
      b.dataset.cat = c;
      b.addEventListener('click', () => selectChip(b));
      chipsWrap.appendChild(b);
    });

    render(files);
    updateCount(files.length);
    if (search) {
      search.addEventListener('input', (e) => {
        const q = String(e.target.value || '').trim().toLowerCase();
        const filtered = files.filter((f) =>
          f.name.toLowerCase().includes(q) ||
          f.desc.toLowerCase().includes(q) ||
          f.category.toLowerCase().includes(q) ||
          f.ext.toLowerCase().includes(q));
        const cur = chipsWrap.querySelector('.chip.is-on');
        if (cur) cur.classList.remove('is-on');
        render(filtered);
        updateCount(filtered.length);
        if (stage && q) {
          const msg = filtered.length === 1
            ? `وجدت ملفًا واحدًا يطابق بحثك: ${filtered[0].name}`
            : `وجدت ${filtered.length} ملفًا يطابق بحثك`;
          stage.say(msg, { expression: 'star', sfx: 'pop', duration: 2600 });
        }
      });
    }
  }

  function selectChip(active) {
    $$('.chip', chipsWrap).forEach((c) => c.classList.remove('is-on'));
    active.classList.add('is-on');
    const cat = active.dataset.cat || '';
    const filtered = cat ? files.filter((f) => f.category === cat) : files;
    render(filtered);
    updateCount(filtered.length);
    if (stage) {
      const name = manifest.categories[cat] || 'الكل';
      stage.say(`عرض ملفات تصنيف ${name} — عددها ${filtered.length} ملف`,
        { expression: 'happy', sfx: 'pop', duration: 2600 });
    }
  }

  function render(list) {
    grid.innerHTML = '';
    list.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `ملف ${f.name}، الحجم ${f.size} بايت`);

      let thumb = '';
      const isImage = /^(image\/)/.test(f.type);
      const isAudio = /^(audio\/)/.test(f.type);
      if (isImage) {
        thumb = `<img src="${f.url}" alt="${f.name}" loading="lazy" onerror="this.style.display='none'">`;
      } else if (isAudio) {
        thumb = '🎵';
      } else {
        thumb = catEmoji(f.category);
      }

      card.innerHTML = `
        <div class="file-thumb">${thumb}</div>
        <div class="file-body">
          <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
          <div class="file-meta">
            <span>${catEmoji(f.category)} ${manifest.categories[f.category] || f.category}</span>
            <span>${escapeHtml(f.ext).toUpperCase()}</span>
            <span>${fmtSize(f.size)}</span>
          </div>
          <button class="btn btn-primary btn-sm" type="button" data-url="${escapeAttr(f.url)}" data-name="${escapeAttr(f.name)}">تحميل</button>
        </div>`;

      // نشغّل التحميل عند الضغط على البطاقة بأكملها أو زر التحميل
      const doDownload = () => downloadFile(f);
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return; // الزر يتعامل بنفسه
        doDownload();
      });
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); doDownload(); }
      });

      const btn = card.querySelector('button');
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        downloadFile(f);
      });

      grid.appendChild(card);
    });
  }

  function updateCount(n) {
    if (countEl) countEl.textContent = `عرض ${n} ملفًا${n === files.length ? ' (الكل)' : ''} من إجمالي ${files.length}`;
  }

  // ------------------------------------------------------------ التحميل
  function downloadFile(f) {
    try {
      const a = document.createElement('a');
      a.href = f.url;
      a.download = f.name.replace(/[^a-zA-Z0-9.\u0621-\u064A\u0660-\u0669_-]/g, '_');
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (_) {
      location.href = f.url;
    }
    if (stage) {
      stage.say(`جارٍ تحميل ملف ${f.name} — الحجم ${fmtSize(f.size)}`,
        { expression: 'loading', sfx: 'scan', duration: 3000 });
    }
    bubble(heroSpeech, `تم بدء تحميل: ${f.name}`, 3000);
  }

  // ------------------------------------------------------------ الروبوت
  function mountRobot(host) {
    if (!host) return null;
    return Bot.mount(host, { pose: 'present', expression: 'happy', alive: true, mini: false });
  }

  function sayHero(text, opts) {
    if (!stage) return;
    bubble(heroSpeech, text, 4000);
    stage.say(text, Object.assign({ expression: 'happy', sfx: 'greet', duration: 3000 }, opts || {}));
  }

  function initRobot() {
    // روبوت cabecille في الشريط العلوي (رأس صغير متحرك)
    if (brandSlot) {
      brandSlot.innerHTML = Bot.markup('brand-head', { view: 'head', mini: true, eyes: 'happy', mouth: 'grin' });
      const s = brandSlot.querySelector('.bot-svg');
      if (s) {
        const loop = ['happy', 'wink', 'star', 'idle'];
        let i = 0;
        setInterval(() => {
          const f = Bot.FACES.find((x) => x.id === loop[i++ % loop.length]);
          if (f && s) { s.setAttribute('data-eyes', f.eyes); s.setAttribute('data-mouth', f.mouth); }
        }, 3400);
      }
    }

    const heroBot = mountRobot(heroHost);
    if (heroBot) {
      stage = heroBot;
      heroHost.addEventListener('click', () => {
        sayHero('أهلاً! أنا مساعدك الآلي من ZYNQ BOT، أتحدث بالعربية وأساعدك في الوصول لملفاتك.',
          { expression: 'happy', sfx: 'greet' });
        heroBot.wave();
      });
    }

    // تحية أول تفاعل في الصفحة (المتصفحات تمنع الكلام التلقائي)
    const firstGreet = () => {
      if (greeted) return;
      greeted = true;
      Bot.voice.ensure();
      if (stage) {
        stage.wave();
        setTimeout(() => sayHero('مرحباً بك في صفحة الملفات. عندك مئة ملف متنوّع، كلها عاملة وجاهزة للتحميل. ابحث أو اختر تصنيفًا لتبدأ.',
          { expression: 'happy', sfx: 'greet' }), 300);
      }
    };
    document.addEventListener('pointerdown', firstGreet, { once: true });
    document.addEventListener('keydown', firstGreet, { once: true });

    // كتم الصوت
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const muted = Bot.voice.setMuted(!Bot.voice.muted);
        muteBtn.textContent = muted ? '🔇' : '🔊';
        muteBtn.classList.toggle('is-off', muted);
        muteBtn.setAttribute('aria-pressed', String(muted));
        if (!muted) Bot.voice.sfx('ok');
      });
    }
  }

  // ------------------------------------------------------------ أدوات مساعدة
  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" }[c]));
  }
  function escapeAttr(t) { return String(t).replace(/"/g, '&quot;'); }

  // ------------------------------------------------------------ التشغيل
  loadFiles();
  initRobot();

  // ظهور تدريجي للعناصر
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach((el) => io.observe(el));
  } else {
    $$('.reveal').forEach((el) => el.classList.add('is-in'));
  }
})();
