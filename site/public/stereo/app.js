/* ==========================================================================
   ستيريو — منطق التطبيق (Web Audio API، بلا أي مكتبات خارجية)
   --------------------------------------------------------------------------
   سلسلة المعالجة:
     المصدر (ملف/ميكروفون) → مدخل مُجبَر على قناتين (المونو يُنسخ للقناتين)
       → مصفوفة عرض ستيريو Mid/Side (4 مكبّرات) → دمج قناتين
       → معادل ثلاثي (بيس/وسط/تريبل) → مستوى الصوت → محدّد ذروة → المخرج
   القاعدة: كل شيء يعمل على الجهاز، ولا يُرسل صوت إلى أي خادم.

   ملاحظات توافق:
   · الهواتف لا تسمح بتشغيل الصوت قبل لمسة من المستخدم — لذلك كل تشغيل
     يبدأ من حدث ضغط (context.resume()).
   · إن لم يدعم المتصفح Web Audio نُشغّل الملف بالطريقة التقليدية بلا معالجة
     ونقول ذلك صراحة في الشريط العلوي (لا ندّعي معالجة غير موجودة).
   ========================================================================== */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STORAGE_KEY = 'zynq.stereo.settings.v1';
const DEFAULTS = { width: 100, balance: 0, bass: 0, mid: 0, treble: 0, volume: 85, swap: false, muteL: false, muteR: false, loop: true };

const state = {
  ctx: null,
  chain: null,
  audio: null,
  srcNode: null,
  objectUrl: null,
  fileName: '',
  seeking: false,
  micStream: null,
  micNode: null,
  micGain: null,
  micOn: false,
  settings: { ...DEFAULTS },
  installEvent: null,
  meterRaf: 0,
};

/* ------------------------------------------------------------------ أدوات */
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (typeof raw[k] === typeof DEFAULTS[k]) out[k] = raw[k];
    }
    return out;
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch (_) { /* وضع التصفح الخاص */ }
}

let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-open'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-open');
    setTimeout(() => { el.hidden = true; }, 220);
  }, ms);
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setStatus(kind, text) {
  const chip = $('#status-chip');
  if (!chip) return;
  chip.dataset.state = kind;
  $('#status-text').textContent = text;
}

/* --------------------------------------------------- محرّك الصوت (الرسم) */
function ensureContext() {
  if (state.ctx) return state.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    setStatus('off', 'لا معالجة');
    toast('متصفحك لا يدعم معالجة الصوت (Web Audio) — سيعمل التشغيل العادي فقط.', 4200);
    return null;
  }

  const ctx = new AC({ latencyHint: 'interactive' });

  // مدخل مُجبَر على قناتين: الملف الأحادي (Mono) يُنسخ تلقائيًا إلى اليسار واليمين.
  const input = ctx.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';

  const splitter = ctx.createChannelSplitter(2);

  // مصفوفة العرض: L→L ، L→R ، R→L ، R→R
  const gLL = ctx.createGain();
  const gLR = ctx.createGain();
  const gRL = ctx.createGain();
  const gRR = ctx.createGain();

  const outL = ctx.createGain();
  const outR = ctx.createGain();
  const merger = ctx.createChannelMerger(2);

  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 180;

  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1100;
  mid.Q.value = 0.9;

  const treble = ctx.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 4500;

  const master = ctx.createGain();

  // محدّد ذروة لطيف: يمنع التقطيع (Clipping) عند التوسيع العالي
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;

  // مؤشرات القناتين
  const meterSplit = ctx.createChannelSplitter(2);
  const analyserL = ctx.createAnalyser();
  const analyserR = ctx.createAnalyser();
  analyserL.fftSize = 1024;
  analyserR.fftSize = 1024;

  // الربط
  input.connect(splitter);
  splitter.connect(gLL, 0, 0);
  splitter.connect(gLR, 0, 0);
  splitter.connect(gRL, 1, 0);
  splitter.connect(gRR, 1, 0);
  gLL.connect(outL);
  gRL.connect(outL);
  gLR.connect(outR);
  gRR.connect(outR);
  outL.connect(merger, 0, 0);
  outR.connect(merger, 0, 1);
  merger.connect(bass);
  bass.connect(mid);
  mid.connect(treble);
  treble.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);
  limiter.connect(meterSplit);
  meterSplit.connect(analyserL, 0, 0);
  meterSplit.connect(analyserR, 1, 0);

  state.ctx = ctx;
  state.chain = { input, splitter, gLL, gLR, gRL, gRR, outL, outR, merger, bass, mid, treble, master, limiter, analyserL, analyserR };
  applyParams(true);
  startMeters();
  return ctx;
}

async function resumeContext() {
  const ctx = ensureContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_) { /* سيُعاد المحاولة عند اللمسة التالية */ }
  }
  return ctx;
}

/** يطبّق كل الإعدادات على العقد الصوتية — واحدًا واحدًا حتى لا يبقى شيء غير مطبَّق */
function applyParams(immediate = false) {
  const c = state.chain;
  if (!c) return;
  const s = state.settings;
  const t = immediate ? 0 : 0.03;
  const set = (param, value) => {
    if (immediate) param.value = value;
    else param.setTargetAtTime(value, state.ctx.currentTime, t);
  };

  // 1) عرض الستيريو: L' = L*(1+w)/2 + R*(1-w)/2  (w=0 ⇒ أحادي، w=1 ⇒ الأصلي)
  const w = Math.min(2, Math.max(0, s.width / 100));
  const same = (1 + w) / 2;
  const cross = (1 - w) / 2;
  const swap = !!s.swap;
  set(c.gLL.gain, swap ? cross : same);
  set(c.gRL.gain, swap ? same : cross);
  set(c.gLR.gain, swap ? same : cross);
  set(c.gRR.gain, swap ? cross : same);

  // 2) الموازن + كتم القنوات
  const bal = Math.min(1, Math.max(-1, s.balance / 100));
  const gainL = (1 - Math.max(0, bal)) * (s.muteL ? 0 : 1);
  const gainR = (1 - Math.max(0, -bal)) * (s.muteR ? 0 : 1);
  set(c.outL.gain, gainL);
  set(c.outR.gain, gainR);

  // 3) المعادل (dB)
  set(c.bass.gain, s.bass);
  set(c.mid.gain, s.mid);
  set(c.treble.gain, s.treble);

  // 4) مستوى الصوت
  set(c.master.gain, Math.min(1, Math.max(0, s.volume / 100)));
}

/* -------------------------------------------------------------- ملف الصوت */
function bindAudioElement() {
  if (state.audio) return state.audio;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.loop = state.settings.loop;
  audio.volume = 1; // المستوى يُدار من عقدة master
  audio.addEventListener('loadedmetadata', () => {
    $('#time-total').textContent = fmtTime(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    if (state.seeking) return;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) {
      $('#seek').value = String(Math.round((audio.currentTime / d) * 1000));
      paintSlider($('#seek'));
    }
    $('#time-now').textContent = fmtTime(audio.currentTime);
  });
  audio.addEventListener('play', () => {
    $('#play').textContent = '⏸';
    $('#play').classList.add('is-playing');
    $('#play').setAttribute('aria-label', 'إيقاف مؤقت');
    setStatus('play', 'يعمل');
  });
  audio.addEventListener('pause', () => {
    $('#play').textContent = '▶';
    $('#play').classList.remove('is-playing');
    $('#play').setAttribute('aria-label', 'تشغيل');
    setStatus(state.micOn ? 'mic' : 'live', state.micOn ? 'الميكروفون' : 'متوقف');
  });
  audio.addEventListener('ended', () => {
    setStatus('live', 'انتهى');
  });
  audio.addEventListener('error', () => {
    toast('تعذّر تشغيل هذا الملف — الصيغة قد لا تكون مدعومة في متصفحك. جرّب MP3 أو WAV.', 4200);
    setStatus('off', 'خطأ في الملف');
  });
  state.audio = audio;
  return audio;
}

async function loadFile(file) {
  if (!file) return;
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)$/i.test(file.name)) {
    toast('هذا الملف ليس ملفًا صوتيًا معروفًا.', 3200);
    return;
  }

  const ctx = await resumeContext();
  const audio = bindAudioElement();

  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  state.fileName = file.name;
  audio.src = state.objectUrl;

  // توصيل عنصر الصوت بالمعالجة (مرة واحدة فقط لكل عنصر — شرط Web Audio)
  if (ctx && !state.srcNode) {
    try {
      state.srcNode = ctx.createMediaElementSource(audio);
      state.srcNode.connect(state.chain.input);
    } catch (err) {
      console.warn('تعذّر توصيل الملف بمعالجة الصوت:', err);
    }
  }
  if (!ctx) toast('سيعمل التشغيل بلا معالجة: المتصفح لا يدعم Web Audio.', 4000);

  $('#np-name').textContent = file.name;
  $('#now-playing').hidden = false;
  $('#time-now').textContent = '0:00';
  $('#time-total').textContent = '0:00';
  $('#seek').value = '0';
  paintSlider($('#seek'));

  try {
    await audio.play();
  } catch (err) {
    // رفض التشغيل التلقائي: نطلب لمسة صريحة
    toast('اضغط زر التشغيل ▶ لبدء الصوت.', 3200);
    setStatus('live', 'جاهز للتشغيل');
    return;
  }
  if (ctx) setStatus(state.micOn ? 'mic' : 'play', state.micOn ? 'الميكروفون' : 'يعمل');
}

async function togglePlay() {
  const audio = state.audio;
  if (!audio || !audio.src) {
    toast('اختر ملفًا صوتيًا أولًا.', 2400);
    $('#file-input')?.click();
    return;
  }
  await resumeContext();
  if (audio.paused) {
    try { await audio.play(); } catch (_) { toast('تعذّر التشغيل — جرّب لمسة أخرى.', 2600); }
  } else {
    audio.pause();
  }
}

/* ----------------------------------------------------------- اختبار القنوات */
function beep(side) {
  const ctx = ensureContext();
  if (!ctx) return;
  ctx.resume();

  const t0 = ctx.currentTime + 0.02;
  const dur = 0.85;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = side === 'both' ? 523.25 : 660;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.28, t0 + 0.04);
  env.gain.setValueAtTime(0.28, t0 + dur - 0.12);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const merger = ctx.createChannelMerger(2);
  osc.connect(env);
  if (side === 'left') env.connect(merger, 0, 0);
  else if (side === 'right') env.connect(merger, 0, 1);
  else {
    env.connect(merger, 0, 0);
    env.connect(merger, 0, 1);
  }
  merger.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  osc.onended = () => {
    try { merger.disconnect(); } catch (_) { /* تم */ }
    try { env.disconnect(); } catch (_) { /* تم */ }
  };
  setStatus('live', side === 'both' ? 'اختبار: القناتان' : side === 'left' ? 'اختبار: يسار' : 'اختبار: يمين');
}

/* -------------------------------------------------------------- الميكروفون */
async function setMic(on) {
  const btn = $('#mic');
  if (!on) {
    if (state.micStream) {
      for (const track of state.micStream.getTracks()) track.stop();
      state.micStream = null;
    }
    try { state.micGain?.disconnect(); } catch (_) { /* تم */ }
    try { state.micNode?.disconnect(); } catch (_) { /* تم */ }
    state.micNode = null;
    state.micGain = null;
    state.micOn = false;
    btn.setAttribute('aria-pressed', 'false');
    btn.querySelector('span').textContent = 'تشغيل';
    $('#mic-warn').hidden = true;
    setStatus(state.audio && !state.audio.paused ? 'play' : 'live', state.audio && !state.audio.paused ? 'يعمل' : 'جاهز');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('هذا المتصفح لا يوفّر وصولًا للميكروفون. افتح التطبيق عبر HTTPS.', 4200);
    return;
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    const why = err && err.name === 'NotAllowedError' ? 'رُفض الإذن' : 'تعذّر الوصول';
    toast(`${why} إلى الميكروفون — اسمح بالوصول من إعدادات الموقع في المتصفح.`, 4200);
    btn.setAttribute('aria-pressed', 'false');
    return;
  }

  const ctx = await resumeContext();
  if (!ctx) { for (const t of stream.getTracks()) t.stop(); return; }

  state.micStream = stream;
  state.micNode = ctx.createMediaStreamSource(stream);
  state.micGain = ctx.createGain();
  state.micGain.gain.value = 0.55; // سقف آمن لتقليل خطر التغذية الراجعة
  state.micNode.connect(state.micGain);
  state.micGain.connect(state.chain.input);
  state.micOn = true;

  btn.setAttribute('aria-pressed', 'true');
  btn.querySelector('span').textContent = 'إيقاف';
  $('#mic-warn').hidden = false;
  setStatus('mic', 'الميكروفون');
  toast('الميكروفون يعمل — استخدم سماعات لتجنّب الصفير.', 3600);
}

/* --------------------------------------------------------- مؤشرات المستوى */
function startMeters() {
  const c = state.chain;
  if (!c || state.meterRaf) return;
  const bufL = new Float32Array(c.analyserL.fftSize);
  const bufR = new Float32Array(c.analyserR.fftSize);

  const tick = () => {
    if (!state.ctx || state.ctx.state === 'closed') { state.meterRaf = 0; return; }
    state.meterRaf = requestAnimationFrame(tick);
    if (document.hidden || state.ctx.state !== 'running') return;
    c.analyserL.getFloatTimeDomainData(bufL);
    c.analyserR.getFloatTimeDomainData(bufR);
    const rms = (buf) => {
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    };
    const pct = (v) => Math.min(100, Math.round(Math.sqrt(v) * 220)); // منحنى إحساس
    const elL = $('#meter-l');
    const elR = $('#meter-r');
    if (elL) elL.style.width = pct(rms(bufL)) + '%';
    if (elR) elR.style.width = pct(rms(bufR)) + '%';
  };
  state.meterRaf = requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------- الشرائح */
function paintSlider(el) {
  if (!el) return;
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const val = Number(el.value);
  const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
  el.style.setProperty('--fill', pct + '%');
}

const WIDTH_HINTS = [
  [0, 0, 'الصوت أحادي: القناتان متطابقتان تمامًا'],
  [1, 99, 'أضيق من الأصلي — تركيز في المنتصف'],
  [100, 100, 'الصوت الأصلي كما هو — لا تغيير'],
  [101, 160, 'اتساع أوسع من الأصلي — مناسب للسماعات'],
  [161, 200, 'اتساع مسرحي كبير — للسماعات فقط، قد يضعف صوت السماعة الواحدة'],
];

function syncLabels() {
  const s = state.settings;

  $('#width-value').textContent = `${s.width}%`;
  const hint = WIDTH_HINTS.find(([a, b]) => s.width >= a && s.width <= b);
  $('#width-hint').textContent = hint ? hint[2] : '';

  if (Math.abs(s.balance) < 5) $('#balance-value').textContent = 'متوازن';
  else if (s.balance < 0) $('#balance-value').textContent = `يسار ${Math.abs(s.balance)}%`;
  else $('#balance-value').textContent = `يمين ${s.balance}%`;

  $('#bass-value').textContent = `${s.bass > 0 ? '+' : ''}${s.bass} dB`;
  $('#mid-value').textContent = `${s.mid > 0 ? '+' : ''}${s.mid} dB`;
  $('#treble-value').textContent = `${s.treble > 0 ? '+' : ''}${s.treble} dB`;
  $('#volume-value').textContent = `${s.volume}%`;

  $('#swap').setAttribute('aria-pressed', String(!!s.swap));
  $('#muteL').setAttribute('aria-pressed', String(!!s.muteL));
  $('#muteR').setAttribute('aria-pressed', String(!!s.muteR));
  $('#loop').setAttribute('aria-pressed', String(!!s.loop));

  for (const el of $$('.slider')) paintSlider(el);
}

/* --------------------------------------------------------------- الواجهة */
function bindControls() {
  // ملف
  $('#file-input').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadFile(file);
  });

  const drop = $('#file-drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('is-drag');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove('is-drag');
  }));
  drop.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // تشغيل
  $('#play').addEventListener('click', togglePlay);
  $('#back10').addEventListener('click', () => {
    if (!state.audio) return;
    state.audio.currentTime = Math.max(0, state.audio.currentTime - 10);
  });
  $('#fwd10').addEventListener('click', () => {
    if (!state.audio) return;
    const d = state.audio.duration;
    const next = state.audio.currentTime + 10;
    state.audio.currentTime = Number.isFinite(d) ? Math.min(d - 0.05, next) : next;
  });
  $('#loop').addEventListener('click', () => {
    state.settings.loop = !state.settings.loop;
    if (state.audio) state.audio.loop = state.settings.loop;
    $('#loop').setAttribute('aria-pressed', String(state.settings.loop));
    saveSettings();
  });

  // شريط التقدم
  const seek = $('#seek');
  seek.addEventListener('input', () => {
    state.seeking = true;
    paintSlider(seek);
    const d = state.audio && state.audio.duration;
    if (Number.isFinite(d) && d > 0) {
      $('#time-now').textContent = fmtTime((Number(seek.value) / 1000) * d);
    }
  });
  const commitSeek = () => {
    const d = state.audio && state.audio.duration;
    if (Number.isFinite(d) && d > 0) state.audio.currentTime = (Number(seek.value) / 1000) * d;
    state.seeking = false;
  };
  seek.addEventListener('change', commitSeek);
  seek.addEventListener('pointerup', commitSeek);

  // عرض الستيريو
  $('#width').addEventListener('input', (e) => {
    state.settings.width = Number(e.target.value);
    applyParams();
    syncLabels();
    saveSettings();
  });
  $('#width-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-width]');
    if (!btn) return;
    state.settings.width = Number(btn.dataset.width);
    $('#width').value = String(state.settings.width);
    applyParams();
    syncLabels();
    saveSettings();
  });

  // الموازن
  $('#balance').addEventListener('input', (e) => {
    state.settings.balance = Number(e.target.value);
    applyParams();
    syncLabels();
    saveSettings();
  });
  // إرجاع الموازن للمنتصف بضغطتين على القيمة
  $('#balance-value').addEventListener('click', () => {
    state.settings.balance = 0;
    $('#balance').value = '0';
    applyParams();
    syncLabels();
    saveSettings();
  });

  // كتم / عكس
  for (const [id, key] of [['swap', 'swap'], ['muteL', 'muteL'], ['muteR', 'muteR']]) {
    $('#' + id).addEventListener('click', () => {
      state.settings[key] = !state.settings[key];
      applyParams();
      syncLabels();
      saveSettings();
    });
  }

  // المعادل
  for (const key of ['bass', 'mid', 'treble']) {
    $('#' + key).addEventListener('input', (e) => {
      state.settings[key] = Number(e.target.value);
      applyParams();
      syncLabels();
      saveSettings();
    });
  }
  const setEq = (bass, mid, treble) => {
    state.settings.bass = bass;
    state.settings.mid = mid;
    state.settings.treble = treble;
    $('#bass').value = String(bass);
    $('#mid').value = String(mid);
    $('#treble').value = String(treble);
    applyParams();
    syncLabels();
    saveSettings();
  };
  $('#eq-flat').addEventListener('click', () => { setEq(0, 0, 0); toast('تم تصفير المعادل'); });
  $('#eq-vocal').addEventListener('click', () => { setEq(-2, 4, 2); toast('وضوح الكلام: وسط أعلى ٤ dB'); });
  $('#eq-bass').addEventListener('click', () => { setEq(7, -1, 2); toast('تعزيز البيس: +٧ dB'); });

  // مستوى الصوت
  $('#volume').addEventListener('input', (e) => {
    state.settings.volume = Number(e.target.value);
    applyParams();
    syncLabels();
    saveSettings();
  });

  // اختبار القنوات
  for (const btn of $$('[data-beep]')) {
    btn.addEventListener('click', () => beep(btn.dataset.beep));
  }

  // الميكروفون
  $('#mic').addEventListener('click', () => setMic(!state.micOn));

  // إيقاف المؤقتات عند ترك الصفحة
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    syncLabels();
  });
}

/* ------------------------------------------------------------------ PWA */
function setupPWA() {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('تعذّر تسجيل عامل الخدمة (العمل بلا إنترنت لن يتاح):', err);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvent = e;
    $('#install-card').hidden = false;
  });

  const installBtn = $('#install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!state.installEvent) {
        toast('من قائمة المتصفح ⋮ اختر «إضافة إلى الشاشة الرئيسية».', 4200);
        return;
      }
      state.installEvent.prompt();
      const choice = await state.installEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        $('#install-card').hidden = true;
        toast('تمت الإضافة 🎉');
      }
      state.installEvent = null;
    });
  }
}

/* ---------------------------------------------------------------- التشغيل */
function boot() {
  state.settings = loadSettings();

  // املأ الواجهة من الإعدادات المحفوظة
  $('#width').value = String(state.settings.width);
  $('#balance').value = String(state.settings.balance);
  $('#bass').value = String(state.settings.bass);
  $('#mid').value = String(state.settings.mid);
  $('#treble').value = String(state.settings.treble);
  $('#volume').value = String(state.settings.volume);

  bindControls();
  syncLabels();
  setupPWA();

  const canAudio = !!(window.AudioContext || window.webkitAudioContext);
  $('#engine-note').textContent = canAudio
    ? 'محرّك الصوت: Web Audio API — كل المعالجة على جهازك'
    : 'متصفحك لا يدعم معالجة الصوت — التشغيل العادي فقط';
  if (!canAudio) setStatus('off', 'بلا معالجة');

  // إن كان هناك إعداد محفوظ غير افتراضي، فعّل السياق عند أول لمسة
  const warm = () => { ensureContext(); document.removeEventListener('pointerdown', warm); };
  document.addEventListener('pointerdown', warm, { once: true });
}

document.addEventListener('DOMContentLoaded', boot);

// للاختبار الآلي
if (typeof window !== 'undefined') {
  window.__stereoTest = { state, applyParams, ensureContext, fmtTime, loadSettings };
}
