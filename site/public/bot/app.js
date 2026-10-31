/* ==========================================================================
   ZYNQ BOT — منطق صفحة العرض
   يربط محرّك الشخصية بالواجهة: الأوضاع، التعبيرات، الألوان، والصوت.
   ========================================================================== */
(function () {
  'use strict';

  const Bot = window.ZynqBot;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ فقاعة الكلام
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

  // ------------------------------------------------------------ الوضع واللون
  let theme = 'royal';
  try { theme = localStorage.getItem('zynq-bot-theme') || 'royal'; } catch (_) { /* تجاهل */ }
  if (!Bot.THEMES.some((t) => t.id === theme)) theme = 'royal';
  Bot.applyTheme(theme);

  // ------------------------------------------------------- شريط التنقل: روبوت صغير
  const brandSlot = $('#brand-bot');
  if (brandSlot) {
    brandSlot.innerHTML = Bot.markup('brand', { view: 'head', mini: true, eyes: 'happy', mouth: 'smile' });
    setTimeout(() => {
      const s = brandSlot.querySelector('.bot-svg');
      if (!s) return;
      const loop = ['happy', 'wink', 'star', 'idle'];
      let i = 0;
      setInterval(() => {
        const f = Bot.FACES.find((x) => x.id === loop[i++ % loop.length]);
        if (f && s) { s.setAttribute('data-eyes', f.eyes); s.setAttribute('data-mouth', f.mouth); }
      }, 3200);
    }, 600);
  }

  // ------------------------------------------------------------------ الهيرو
  const heroHost = $('#hero-bot');
  let hero = null;
  if (heroHost) {
    hero = Bot.mount(heroHost, { pose: 'wave', expression: 'happy', alive: true });
    hero.setPose('wave');
  }
  const heroSpeech = $('#hero-speech');
  const heroLines = [
    'أهلًا! أنا ZYNQ BOT ⚡ — رفيقك في موقع المؤثرات.',
    'عيناي تتابعك… جرّب تحريك المؤشر!',
    'عندي عشرة أوضاع واثنا عشر تعبيرًا. اختار اللي يعجبك.',
    'اضغط على أي بطاقة في الأسفل وسأقلّدها فورًا.'
  ];
  let heroLine = 0;

  function heroSay(text) {
    if (!hero) return;
    bubble(heroSpeech, text, 4200);
    hero.say(text, { expression: 'happy', sfx: 'greet', then: 'happy', duration: 2600 });
  }

  if (heroHost) {
    heroHost.addEventListener('click', () => {
      heroSay(heroLines[heroLine++ % heroLines.length]);
      hero.wave();
    });
  }
  const heroBtn = $('#hero-hit');
  if (heroBtn) {
    heroBtn.addEventListener('click', () => {
      heroSay(heroLines[heroLine++ % heroLines.length]);
      if (hero) hero.wave();
    });
  }

  // ------------------------------------------------------------- المسرح الحيّ
  const stageHost = $('#bot-stage');
  const stage = stageHost ? Bot.mount(stageHost, { pose: 'stand', expression: 'idle', alive: true }) : null;
  const stageSpeech = $('#stage-speech');
  const poseById = {};
  Bot.POSES.forEach((p) => { poseById[p.id] = p; });

  function stageSay(text, expr, sfx) {
    if (!stage) return;
    bubble(stageSpeech, text, 3800);
    stage.say(text, { expression: expr || 'happy', sfx: sfx || 'pop', duration: 2600 });
  }

  // --------------------------------------------------------- شبكة الأوضاع
  const posesGrid = $('#poses-grid');
  if (posesGrid) {
    Bot.POSES.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'pose-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.dataset.pose = p.id;
      card.setAttribute('aria-label', `وضع ${p.name} — ${p.caption}`);
      card.innerHTML = `<span class="tag-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="bot-slot"></div>
        <h4>${p.name}</h4>
        <small>${p.caption}</small>`;
      posesGrid.appendChild(card);
      const expr = p.id === 'sleep' ? 'sleep' : p.id === 'think' ? 'think' : p.id === 'dance' ? 'laugh' : 'happy';
      Bot.mount($('.bot-slot', card), { pose: p.id, expression: expr, alive: false });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
      card.addEventListener('click', () => {
        if (!stage) return;
        stage.setPose(p.id);
        stageSay(p.caption, expr, p.id === 'wave' ? 'greet' : p.id === 'dance' ? 'laugh' : 'pop');
        $$('.pose-card', posesGrid).forEach((c) => c.classList.toggle('is-active', c === card));
        $$('#pose-chips .chip').forEach((c) => c.classList.toggle('is-on', c.dataset.pose === p.id));
        const stageEl = $('#stage');
        if (stageEl && stageEl.getBoundingClientRect().top < 0) {
          stageEl.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
        }
      });
    });
  }

  // --------------------------------------------------------- شبكة التعبيرات
  const facesGrid = $('#faces-grid');
  if (facesGrid) {
    Bot.FACES.forEach((f, i) => {
      const card = document.createElement('div');
      card.className = 'pose-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.dataset.face = f.id;
      card.setAttribute('aria-label', `تعبير ${f.name}`);
      card.innerHTML = `<span class="tag-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="bot-slot"></div>
        <h4>${f.name}</h4>
        <small>${f.id}</small>`;
      facesGrid.appendChild(card);
      Bot.mount($('.bot-slot', card), { pose: 'stand', expression: f.id, alive: false, view: 'head' });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
      card.addEventListener('click', () => {
        if (!stage) return;
        stage.setExpression(f.id);
        Bot.voice.sfx(f.id === 'error' ? 'error' : f.id === 'laugh' ? 'laugh' : 'pop');
        stage.setPose('stand');
        $$('#pose-chips .chip').forEach((c) => c.classList.toggle('is-on', c.dataset.pose === 'stand'));
        $$('.pose-card', facesGrid).forEach((c) => c.classList.toggle('is-active', c === card));
        bubble(stageSpeech, `تعبير «${f.name}»`, 2400);
        $('#stage').scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' });
      });
    });
  }

  // ------------------------------------------------------------ أزرار الأوضاع
  const poseChips = $('#pose-chips');
  if (poseChips) {
    Bot.POSES.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (p.id === 'stand' ? ' is-on' : '');
      b.dataset.pose = p.id;
      b.textContent = p.name;
      b.addEventListener('click', () => {
        if (!stage) return;
        stage.setPose(p.id);
        $$('.chip', poseChips).forEach((c) => c.classList.toggle('is-on', c === b));
        Bot.voice.sfx(p.id === 'wave' ? 'greet' : 'click');
        if (p.id === 'wave') stage.say('أهلًا بك!', { expression: 'happy', sfx: 'greet' });
        else if (p.id === 'sleep') bubble(stageSpeech, 'zzz… استراحة قصيرة', 2400);
        else bubble(stageSpeech, p.caption, 2600);
      });
      poseChips.appendChild(b);
    });
  }

  // ---------------------------------------------------- أزرار التعبيرات السريعة
  const faceChips = $('#face-chips');
  if (faceChips) {
    Bot.FACES.forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = f.name;
      b.addEventListener('click', () => {
        if (!stage) return;
        stage.setExpression(f.id);
        Bot.voice.sfx(f.id === 'error' ? 'error' : 'pop');
        $$('.chip', faceChips).forEach((c) => c.classList.toggle('is-on', c === b));
      });
      faceChips.appendChild(b);
    });
  }

  // ------------------------------------------------------------- ألوان التمييز
  const dots = $('#color-dots');
  if (dots) {
    Bot.THEMES.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot-btn' + (t.id === theme ? ' is-on' : '');
      b.style.background = `linear-gradient(135deg, ${t.accent}, ${t.accent2})`;
      b.title = t.name;
      b.setAttribute('aria-label', `لون ${t.name}`);
      b.addEventListener('click', () => {
        theme = Bot.applyTheme(t.id);
        $$('.dot-btn', dots).forEach((d) => d.classList.toggle('is-on', d === b));
        Bot.voice.sfx('pop');
        bubble(stageSpeech, `اللون: ${t.name}`, 2000);
      });
      dots.appendChild(b);
    });
  }

  // ------------------------------------------------------------------- الصوت
  const input = $('#say-input');
  const sayBtn = $('#say-btn');
  const log = $('#say-log');
  const muteBtn = $('#btn-mute');
  const modeBtn = $('#mode-toggle');

  const quick = ['أهلًا بك في ZYNQ FX!', 'ملفّك جاهز للتحميل ⚡', 'فكرة رائعة! لنبدأ.', 'جارٍ معالجة الطلب…'];

  function say(text) {
    const t = String(text || '').trim() || quick[Math.floor(Math.random() * quick.length)];
    const expr = ['happy', 'star', 'wink', 'laugh', 'love'][Math.floor(Math.random() * 5)];
    if (stage) {
      stage.say(t, { expression: expr, sfx: 'pop', duration: Math.max(1800, Math.min(7000, t.length * 100)) });
      stage.setPose(['stand', 'present', 'thumbs'][Math.floor(Math.random() * 3)]);
    }
    bubble(stageSpeech, t, 4200);
    if (log) log.innerHTML = `<b>الروبوت:</b> ${t.replace(/[<>&]/g, '')}`;
  }

  if (sayBtn) sayBtn.addEventListener('click', () => say(input ? input.value : ''));
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); say(input.value); }
    });
  }

  $$('[data-sfx]').forEach((b) => {
    b.addEventListener('click', () => {
      const name = b.dataset.sfx;
      Bot.voice.sfx(name);
      if (stage) {
        const map = { greet: ['happy', 'wave'], ok: ['happy', 'thumbs'], laugh: ['laugh', 'dance'], error: ['error', 'stand'], scan: ['star', 'present'], power: ['surprised', 'fly'] };
        const m = map[name] || ['happy', 'stand'];
        stage.setExpression(m[0]);
        stage.setPose(m[1]);
        if (name === 'scan') stage.say('أمسح الملفات… تم.', { expression: 'loading', duration: 2200 });
        else if (name === 'power') stage.say('الطاقة كاملة!', { expression: 'star', duration: 2000 });
      }
      if (log) log.innerHTML = `مؤثر صوتي: <b>${name}</b>`;
    });
  });

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const muted = Bot.voice.setMuted(!Bot.voice.muted);
      muteBtn.textContent = muted ? '🔇' : '🔊';
      muteBtn.classList.toggle('is-off', muted);
      muteBtn.setAttribute('aria-pressed', String(muted));
      if (!muted) Bot.voice.sfx('ok');
    });
  }

  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      const beep = Bot.voice.mode !== 'beep';
      Bot.voice.mode = beep ? 'beep' : 'auto';
      modeBtn.setAttribute('aria-pressed', String(beep));
      modeBtn.classList.toggle('is-on', beep);
      modeBtn.textContent = beep ? 'لغة الروبوت فقط (نغمات) ✓' : 'لغة الروبوت فقط (نغمات)';
      if (stage) stage.say(beep ? 'أتكلم الآن بلغة الروبوت: بيب بيب!' : 'عدت إلى العربية!', { expression: 'happy', duration: 2400 });
    });
  }

  // ------------------------------------------------------------ مؤشّر الصوت
  const meterBar = $('#meter-bar');
  if (meterBar) {
    let smooth = 0;
    const tick = () => {
      const lvl = Bot.voice.speaking ? Bot.voice.level() : 0;
      smooth += (lvl - smooth) * 0.28;
      meterBar.style.width = Math.min(100, Math.round(smooth * 260)) + '%';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // --------------------------------------------------------------- نسخ الكود
  const copyBtn = $('#copy-code');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = $('#embed-code') ? $('#embed-code').textContent : '';
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = 'تم النسخ ✓';
      } catch (_) {
        copyBtn.textContent = 'حدّد الكود وانسخه';
      }
      setTimeout(() => { copyBtn.textContent = 'نسخ'; }, 2200);
    });
  }

  // -------------------------------------------------------- الرفيق العائم
  const buddyHost = $('#buddy-bot');
  const buddyBubble = $('#buddy-bubble');
  const tips = [
    'جرّب وضع «الرقصة» 💃',
    'اضغط على وجهي لأغيّر تعبيري',
    'يمكنك كتابة أي جملة وسأقولها لك',
    'كل هذا مرسوم بـ SVG — بلا صور!',
    'غيّر لون التمييز وشاهد الإضاءة تتغيّر ⚡'
  ];
  if (buddyHost) {
    const buddy = Bot.mount(buddyHost, { pose: 'stand', expression: 'idle', alive: true });
    let n = 0;
    buddyHost.addEventListener('click', () => {
      const f = buddy.react();
      bubble(buddyBubble, tips[n++ % tips.length], 3600);
      Bot.voice.sfx('boing');
      if (f === 'laugh') Bot.voice.sfx('laugh');
    });
    // تلميحات هادئة بلا صوت (لأن المتصفح يمنع الصوت التلقائي)
    setTimeout(() => bubble(buddyBubble, 'مرحبًا! أنا ZYNQ BOT — اضغط عليّ ⚡', 5200), 2600);
    setInterval(() => {
      if (document.hidden) return;
      if (buddyBubble && !buddyBubble.hidden) return;
      buddy.setPose(['stand', 'wave', 'present', 'thumbs'][Math.floor(Math.random() * 4)]);
      buddy.setExpression(['happy', 'wink', 'star'][Math.floor(Math.random() * 3)]);
      setTimeout(() => { buddy.setPose('stand'); buddy.setExpression('idle'); }, 5200);
    }, 17000);
  }

  // -------------------------------------------------------------- دخول العناصر
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach((el) => io.observe(el));
  } else {
    $$('.reveal').forEach((el) => el.classList.add('is-in'));
  }

  // لمسة أخيرة: الروبوت يحيّي الزائر بلا صوت عند أول تفاعل
  let greeted = false;
  document.addEventListener('pointerdown', function onFirst() {
    if (greeted) return;
    greeted = true;
    Bot.voice.ensure();
    if (hero) hero.setPose('wave');
    document.removeEventListener('pointerdown', onFirst);
  }, { once: false });
})();
