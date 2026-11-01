/* ==========================================================================
   ZYNQ BOT — محرّك الشخصية
   شخصية الروبوت مرسومة بالكامل بـ SVG (بلا صور)، ووجوهها متحركة بـ CSS،
   وأصواتها تُولَّد لحظيًا بـ Web Audio (بلا ملفات صوت) — تعمل بلا إنترنت.
   --------------------------------------------------------------------------
   واجهة الاستخدام:
     ZynqBot.mount(element, { pose, eyes, mouth, mini, view, alive, onSay })
     ZynqBot.voice.speak('مرحبًا') / ZynqBot.voice.sfx('ok')
     ZynqBot.POSES / ZynqBot.FACES / ZynqBot.THEMES
   ========================================================================== */
(function (global) {
  'use strict';

  let seq = 0;

  // ------------------------------------------------------------------ الأوضاع
  const POSES = [
    { id: 'stand',   name: 'وقفة',        caption: 'يقف بثقة ويراقب الشاشة' },
    { id: 'wave',    name: 'تحية',        caption: 'يلوّح لك بيده ووجهه مبتسم' },
    { id: 'thumbs',  name: 'إبهام لأعلى', caption: 'يوافق على شغلك ويشجّعك' },
    { id: 'dance',   name: 'رقصة',        caption: 'يتحرّك مع الموسيقى' },
    { id: 'think',   name: 'تفكير',       caption: 'يحلّل ويبحث عن فكرة' },
    { id: 'fly',     name: 'طيران',       caption: 'يطير بحزمة الدفع' },
    { id: 'present', name: 'عرض',         caption: 'يشرح ويقدم لوحة بيانات' },
    { id: 'bolt',    name: 'برق',         caption: 'يحمل شعار ZYNQ المضيء' },
    { id: 'typing',  name: 'برمجة',       caption: 'يكتب كودًا على لوحة ضوئية' },
    { id: 'sleep',   name: 'نوم',         caption: 'يأخذ استراحة صغيرة' }
  ];

  // ---------------------------------------------------------------- التعبيرات
  // كل تعبير = شكل العين + شكل الفم. الأسماء تطابق CSS.
  const FACES = [
    { id: 'idle',      name: 'هادئ',      eyes: 'open',      mouth: 'smile' },
    { id: 'happy',     name: 'سعيد',      eyes: 'happy',     mouth: 'grin' },
    { id: 'laugh',     name: 'ضحك',       eyes: 'happy',     mouth: 'open' },
    { id: 'wink',      name: 'غمزة',      eyes: 'wink',      mouth: 'smile' },
    { id: 'love',      name: 'قلوب',      eyes: 'heart',     mouth: 'grin' },
    { id: 'star',      name: 'نجوم',      eyes: 'star',      mouth: 'grin' },
    { id: 'surprised', name: 'مندهش',     eyes: 'big',       mouth: 'o' },
    { id: 'think',     name: 'تفكير',     eyes: 'look',      mouth: 'flat' },
    { id: 'loading',   name: 'تحميل',     eyes: 'loading',   mouth: 'flat' },
    { id: 'sleep',     name: 'نعسان',     eyes: 'sleep',     mouth: 'small' },
    { id: 'error',     name: 'خطأ',       eyes: 'x',         mouth: 'wavy' },
    { id: 'cool',      name: 'مركّز',     eyes: 'squint',    mouth: 'smile' }
  ];

  const FACE_BY_ID = {};
  for (const f of FACES) FACE_BY_ID[f.id] = f;

  // ------------------------------------------------------------------ الألوان
  // البنفسجي هو الأساس دائمًا؛ المتغيّر هو لون التمييز والإضاءة (LED).
  const THEMES = [
    { id: 'royal',  name: 'بنفسجي ملكي', accent: '#a878ff', accent2: '#6d3bf5', led: '#a878ff', glow: '#7c3aed' },
    { id: 'violet', name: 'ليلَك نيون',  accent: '#c084fc', accent2: '#7c3aed', led: '#d8b4fe', glow: '#a855f7' },
    { id: 'cyan',   name: 'سماوي',       accent: '#5fd4ff', accent2: '#4f46e5', led: '#5fd4ff', glow: '#0ea5e9' },
    { id: 'mint',   name: 'زمردي',       accent: '#4ade80', accent2: '#7c3aed', led: '#5eead4', glow: '#10b981' },
    { id: 'rose',   name: 'وردي',        accent: '#ff7ab8', accent2: '#7c3aed', led: '#ff9ecb', glow: '#ec4899' },
    { id: 'amber',  name: 'غروب',        accent: '#ffb057', accent2: '#7c3aed', led: '#ffc978', glow: '#f59e0b' }
  ];

  // ============================================================== رسم الهيكل
  // كل نسخة من الروبوت لها معرّفات تدرّج فريدة حتى لا تتضارب في الصفحة.
  function markup(uid, opts) {
    const o = opts || {};
    const shell = `shell-${uid}`;
    const hood = `hood-${uid}`;
    const screen = `screen-${uid}`;
    const pose = o.pose || 'stand';
    const faceId = o.expression || o.eyes || 'idle';
    const face = FACE_BY_ID[faceId] || FACE_BY_ID.idle;
    const eyes = face.eyes;
    const mouth = o.mouth || face.mouth;

    return `
<svg class="bot-svg${o.mini ? ' bot-svg--mini' : ''}" viewBox="${o.view === 'head' ? '16 6 208 156' : '-26 -6 292 352'}"
     data-pose="${pose}" data-eyes="${eyes}" data-mouth="${mouth}" role="img"
     aria-label="ZYNQ BOT — روبوت ZYNQ FX">
  <defs>
    <linearGradient id="${shell}" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.42" stop-color="#f4f7fd"/>
      <stop offset="1" stop-color="#c6cee2"/>
    </linearGradient>
    <linearGradient id="${hood}" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="#2b3145"/>
      <stop offset="0.5" stop-color="#1a1f2e"/>
      <stop offset="1" stop-color="#0b0e16"/>
    </linearGradient>
    <radialGradient id="${screen}" cx="0.5" cy="0.26" r="0.92">
      <stop offset="0" stop-color="#1b2748"/>
      <stop offset="0.5" stop-color="#0a0f1e"/>
      <stop offset="1" stop-color="#02040a"/>
    </radialGradient>
  </defs>

  <!-- ظل أرضي -->
  <ellipse class="bot-shadow" cx="120" cy="322" rx="68" ry="9"/>

  <!-- حزمة الدفع (خلف الشخصية) -->
  <g class="bot-props bot-props--back">
    <g class="prop prop-jetpack">
      <rect x="176" y="186" width="18" height="40" rx="9" fill="#252b3d" stroke="#3b4360" stroke-width="2"/>
      <rect x="46" y="186" width="18" height="40" rx="9" fill="#252b3d" stroke="#3b4360" stroke-width="2"/>
      <g class="jet-flame"><path d="M185 226 q9 22 0 40 q-9 -16 0 -40" fill="var(--bot-led)"/></g>
      <g class="jet-flame jet-flame--2"><path d="M55 226 q9 22 0 40 q-9 -16 0 -40" fill="var(--bot-led)"/></g>
    </g>
  </g>

  <g class="bot-figure">
    <!-- الأرجل والحذاء -->
    <g class="bot-legs">
      <g class="bot-leg bot-leg-l">
        <rect x="92" y="236" width="26" height="52" rx="13" fill="#141824"/>
        <rect x="74" y="272" width="46" height="26" rx="13" fill="url(#${shell})"/>
        <path d="M74 290 h46 v2 a10 10 0 0 1 -10 10 h-26 a10 10 0 0 1 -10 -10 z" fill="#0b0e16"/>
        <rect x="79" y="278" width="9" height="5" rx="2.5" fill="#b6c1d8" opacity=".8"/>
      </g>
      <g class="bot-leg bot-leg-r">
        <rect x="122" y="236" width="26" height="52" rx="13" fill="#141824"/>
        <rect x="120" y="272" width="46" height="26" rx="13" fill="url(#${shell})"/>
        <path d="M120 290 h46 v2 a10 10 0 0 1 -10 10 h-26 a10 10 0 0 1 -10 -10 z" fill="#0b0e16"/>
        <rect x="125" y="278" width="9" height="5" rx="2.5" fill="#b6c1d8" opacity=".8"/>
      </g>
    </g>

    <!-- الجذع: هودي أسود بشعار ZYNQ FX -->
    <g class="bot-body">
      <path class="hoodie" d="M73 196 C73 170 94 157 120 157 C146 157 167 170 167 196 L174 256 C174 267 167 272 157 272 H83 C73 272 66 267 66 256 Z" fill="url(#${hood})"/>
      <path class="hood-fold" d="M92 166 C96 186 90 214 84 236" fill="none" stroke="#2c3348" stroke-width="2" opacity=".55"/>
      <path class="hood-fold" d="M148 166 C144 186 150 214 156 236" fill="none" stroke="#2c3348" stroke-width="2" opacity=".55"/>
      <path class="hood-collar" d="M100 156 q20 13 40 0 l8 13 q-28 16 -56 0 z" fill="#080b12"/>
      <path class="drawstring" d="M107 168 v24 M133 168 v24" stroke="#39415a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="107" cy="194" r="3" fill="#4b5674"/>
      <circle cx="133" cy="194" r="3" fill="#4b5674"/>
      <path class="hoodie-pouch" d="M87 226 h66 v14 q0 16 -16 16 h-34 q-16 0 -16 -16 z" fill="#1b2130"/>
      <path d="M87 226 h66" stroke="#090c14" stroke-width="3" stroke-linecap="round"/>
      <g class="bot-logo" transform="translate(120 203)">
        <path class="logo-bolt" d="M6 -23 L-9 2 h9 l-5 18 L12 -3 h-9 z" fill="#ffd23f"/>
        <text class="logo-text" y="27" text-anchor="middle" font-size="13" font-weight="800" letter-spacing="0.3" fill="#ffffff">ZYNQ <tspan fill="#ffd23f">FX</tspan></text>
      </g>
    </g>

    <!-- الرقبة -->
    <rect class="neck" x="104" y="140" width="32" height="26" rx="10" fill="#0d1220"/>

    <!-- الرقبة -->
    <rect class="neck" x="104" y="140" width="32" height="26" rx="10" fill="#0d1220"/>

    <!-- الرأس -->
    <g class="bot-head">
      <path class="band" d="M34 104 C34 20 206 20 206 104" fill="none" stroke="#161a26" stroke-width="13" stroke-linecap="round"/>
      <rect class="head-shell" x="38" y="16" width="164" height="136" rx="62" fill="url(#${shell})"/>
      <path class="head-shade" d="M38 118 C54 142 84 152 120 152 C156 152 186 142 202 118 C202 132 202 140 202 142 C202 147 197 152 192 152 H48 C43 152 38 147 38 142 Z" fill="#b9c3db" opacity=".35"/>
      <path class="head-hi" d="M64 44 C74 28 94 22 112 23 C94 30 80 42 74 58 Z" fill="#ffffff" opacity=".8"/>
      <rect class="screen" x="56" y="34" width="128" height="104" rx="44" fill="url(#${screen})"/>
      <rect class="screen-gloss" x="66" y="42" width="108" height="30" rx="20" fill="#ffffff" opacity=".05"/>

      <!-- الوجه -->
      <g class="face" transform="translate(120 86)">
        <g class="eyes">
          <g class="eyes-open">
            <ellipse class="eye led" cx="-26" cy="-4" rx="13" ry="15"/>
            <ellipse class="eye led" cx="26" cy="-4" rx="13" ry="15"/>
            <g class="pupils">
              <ellipse class="pupil" cx="-26" cy="-4" rx="6" ry="8"/>
              <ellipse class="pupil" cx="26" cy="-4" rx="6" ry="8"/>
            </g>
          </g>
          <g class="eyes-happy led">
            <path d="M-41 4 Q-26 -19 -11 4"/>
            <path d="M11 4 Q26 -19 41 4"/>
          </g>
          <g class="eyes-wink led">
            <path d="M-41 4 Q-26 -19 -11 4"/>
            <path d="M13 1 Q27 11 41 -3"/>
            <path class="brow" d="M14 -22 q13 -5 26 1"/>
          </g>
          <g class="eyes-heart">
            <path class="heart" d="M-26 8 C-38 -2 -39 -14 -30 -16 C-26 -17 -22 -14 -21 -9 C-20 -14 -16 -17 -12 -16 C-3 -14 -4 -2 -16 8 L-21 12 Z"/>
            <path class="heart" d="M26 8 C14 -2 13 -14 22 -16 C26 -17 30 -14 31 -9 C32 -14 36 -17 40 -16 C49 -14 48 -2 36 8 L31 12 Z"/>
          </g>
          <g class="eyes-star led">
            <path class="star" d="M-26 -18 L-21 -6 L-8 -5 L-18 3 L-14 16 L-26 8 L-38 16 L-34 3 L-44 -5 L-31 -6 Z"/>
            <path class="star" d="M26 -18 L31 -6 L44 -5 L34 3 L38 16 L26 8 L14 16 L18 3 L8 -5 L21 -6 Z"/>
          </g>
          <g class="eyes-sleep led">
            <path d="M-41 -2 Q-26 12 -11 -2"/>
            <path d="M11 -2 Q26 12 41 -2"/>
          </g>
          <g class="eyes-x led">
            <path d="M-39 -15 L-13 11"/><path d="M-13 -15 L-39 11"/>
            <path d="M13 -15 L39 11"/><path d="M39 -15 L13 11"/>
          </g>
          <g class="eyes-loading led">
            <path d="M-41 -4 h28"/><path d="M13 -4 h28"/>
            <circle class="load-dot" cx="52" cy="-4" r="4"/>
          </g>
          <g class="eyes-big">
            <ellipse class="eye led" cx="-27" cy="-5" rx="16" ry="19"/>
            <ellipse class="eye led" cx="27" cy="-5" rx="16" ry="19"/>
            <g class="pupils">
              <ellipse class="pupil" cx="-27" cy="-5" rx="6" ry="7.4"/>
              <ellipse class="pupil" cx="27" cy="-5" rx="6" ry="7.4"/>
            </g>
          </g>
          <g class="eyes-look led">
            <ellipse class="eye" cx="-26" cy="-1" rx="12.5" ry="14.5"/>
            <ellipse class="eye" cx="26" cy="-1" rx="12.5" ry="14.5"/>
            <g class="pupils pupils--up">
              <ellipse class="pupil" cx="-26" cy="-7" rx="5.6" ry="7.4"/>
              <ellipse class="pupil" cx="26" cy="-7" rx="5.6" ry="7.4"/>
            </g>
            <path class="brow" d="M-42 -24 q16 -8 32 -3"/>
            <path class="brow" d="M12 -27 q16 -7 31 2"/>
          </g>
          <g class="eyes-squint led">
            <ellipse class="eye" cx="-26" cy="0" rx="13" ry="7"/>
            <ellipse class="eye" cx="26" cy="0" rx="13" ry="7"/>
            <ellipse class="pupil" cx="-26" cy="0" rx="4.6" ry="5.4"/>
            <ellipse class="pupil" cx="26" cy="0" rx="4.6" ry="5.4"/>
            <path class="brow" d="M-42 -19 q16 5 32 0"/>
            <path class="brow" d="M12 -19 q16 5 31 0"/>
          </g>
        </g>

        <g class="mouths">
          <g class="mouth-smile led"><path class="line" d="M-12 19 Q0 31 12 19"/></g>
          <g class="mouth-grin led"><path class="solid" d="M-15 16 Q0 36 15 16 Q0 24 -15 16 Z"/></g>
          <g class="mouth-o led"><ellipse class="solid" cx="0" cy="23" rx="7" ry="8.5"/></g>
          <g class="mouth-flat led"><path class="line" d="M-10 23 h20"/></g>
          <g class="mouth-small led"><path class="line" d="M-6 23 q6 4 12 0"/></g>
          <g class="mouth-open led"><path class="solid" d="M-13 17 Q0 40 13 17 Q0 29 -13 17 Z"/></g>
          <g class="mouth-wavy led"><path class="line" d="M-13 23 q6.5 -7 13 0 t13 0"/></g>
          <g class="mouth-smile2 led"><path class="line" d="M-9 20 q9 9 18 0"/></g>
        </g>

        <g class="face-extra face-extra--loading led">
          <circle class="dot dot1" cx="-16" cy="-34" r="3.2"/><circle class="dot dot2" cx="0" cy="-34" r="3.2"/><circle class="dot dot3" cx="16" cy="-34" r="3.2"/>
        </g>
      </g>

      <!-- سماعات الرأس -->
      <g class="cups">
        <g class="cup cup-l">
          <rect x="19" y="60" width="29" height="60" rx="13" fill="#161a26"/>
          <rect x="23" y="67" width="21" height="46" rx="10.5" fill="#0d1019"/>
          <path class="led cup-led" d="M26 74 q-3.6 20 0 40" fill="none" stroke-width="3.6" stroke-linecap="round"/>
        </g>
        <g class="cup cup-r">
          <rect x="192" y="60" width="29" height="60" rx="13" fill="#161a26"/>
          <rect x="196" y="67" width="21" height="46" rx="10.5" fill="#0d1019"/>
          <path class="led cup-led" d="M214 74 q3.6 20 0 40" fill="none" stroke-width="3.6" stroke-linecap="round"/>
        </g>
      </g>
    </g>

    <!-- الأذرع: كتف + مرفق + كف (تُرسم بعد الرأس حتى تظهر اليد المرفوعة أمامه) -->
    <g class="bot-arm bot-arm-l">
      <rect class="sleeve" x="43" y="168" width="31" height="52" rx="15.5" fill="url(#${hood})"/>
      <g class="forearm">
        <rect class="sleeve2" x="44" y="200" width="29" height="26" rx="13" fill="url(#${hood})"/>
        <rect class="cuff" x="42" y="219" width="33" height="14" rx="7" fill="url(#${shell})"/>
        <g class="hand">
          <rect x="42" y="229" width="33" height="32" rx="14.5" fill="url(#${shell})"/>
          <path d="M49 242 h7 M64 242 h7" stroke="#b6c1d8" stroke-width="2.2" stroke-linecap="round"/>
        </g>
        <g class="thumb"><rect x="67" y="216" width="13" height="23" rx="6.5" fill="url(#${shell})"/></g>
      </g>
    </g>
    <g class="bot-arm bot-arm-r">
      <rect class="sleeve" x="166" y="168" width="31" height="52" rx="15.5" fill="url(#${hood})"/>
      <g class="forearm">
        <rect class="sleeve2" x="167" y="200" width="29" height="26" rx="13" fill="url(#${hood})"/>
        <rect class="cuff" x="165" y="219" width="33" height="14" rx="7" fill="url(#${shell})"/>
        <g class="hand">
          <rect x="165" y="229" width="33" height="32" rx="14.5" fill="url(#${shell})"/>
          <path d="M169 242 h7 M184 242 h7" stroke="#b6c1d8" stroke-width="2.2" stroke-linecap="round"/>
        </g>
        <g class="thumb"><rect x="160" y="216" width="13" height="23" rx="6.5" fill="url(#${shell})"/></g>
      </g>
    </g>
  </g>

  <!-- ملحقات أمامية -->
  <g class="bot-props bot-props--front">
    <g class="prop prop-zzz led">
      <text class="z z1" x="176" y="58" font-size="19" font-weight="800">Z</text>
      <text class="z z2" x="192" y="42" font-size="14" font-weight="800">Z</text>
      <text class="z z3" x="203" y="28" font-size="10" font-weight="800">z</text>
    </g>
    <g class="prop prop-speed">
      <path class="streak s1" d="M-14 120 h34"/>
      <path class="streak s2" d="M-20 152 h46"/>
      <path class="streak s3" d="M-8 188 h30"/>
      <path class="streak s4" d="M236 112 h34"/>
      <path class="streak s5" d="M228 148 h46"/>
      <path class="streak s6" d="M240 184 h30"/>
    </g>
    <g class="prop prop-holo">
      <rect class="holo-panel" x="-26" y="104" width="88" height="62" rx="11"/>
      <path class="holo-line h1" d="M-16 122 h30"/>
      <path class="holo-line h2" d="M-16 136 h56"/>
      <path class="holo-line h3" d="M-16 150 h22"/>
      <circle class="holo-dot" cx="50" cy="150" r="3.4"/>
    </g>
    <g class="prop prop-keyboard">
      <rect class="kb" x="86" y="214" width="68" height="30" rx="8"/>
      <path class="kb-key" d="M94 223 h6 M105 223 h6 M116 223 h6 M127 223 h6 M138 223 h6"/>
      <path class="kb-key" d="M100 234 h6 M111 234 h6 M122 234 h6 M133 234 h6"/>
    </g>
    <g class="prop prop-bolt">
      <path class="bolt-prop" d="M32 62 L6 112 h15 l-8 30 L46 84 H30 z" fill="#ffd23f"/>
      <path d="M32 62 L6 112 h15 l-8 30 L46 84 H30 z" fill="none" stroke="#a97c07" stroke-width="2" opacity=".35"/>
    </g>
    <g class="prop prop-ask led">
      <text x="182" y="70" font-size="31" font-weight="800" text-anchor="middle">?</text>
      <circle cx="182" cy="82" r="3"/>
    </g>
  </g>
</svg>`;
  }

  // ================================================================ الأصوات
  const Voice = {
    ctx: null,
    master: null,
    analyser: null,
    muted: false,
    mode: 'auto', // auto | arabic | beep
    speaking: false,
    _voice: null,
    _raf: null,
    _timers: [],

    /** إنشاء سياق الصوت (يجب أن يكون بعد تفاعل المستخدم). */
    ensure() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try {
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.55;
          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 128;
          this.analyser.smoothingTimeConstant = 0.72;
          this.master.connect(this.analyser);
          this.analyser.connect(this.ctx.destination);
        } catch (_) { return null; }
      }
      if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (_) { /* تجاهل */ } }
      this._loadVoices();
      return this.ctx;
    },

    setMuted(m) {
      this.muted = !!m;
      if (this.muted) {
        this.stop();
        if ('speechSynthesis' in global) { try { global.speechSynthesis.cancel(); } catch (_) { /* تجاهل */ } }
      }
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
      return this.muted;
    },

    stop() {
      this.speaking = false;
      for (const t of this._timers) clearTimeout(t);
      this._timers = [];
      if (this.ctx) {
        try {
          // أغلق كل العُقد النشطة عبر إخماد سريع
          const now = this.ctx.currentTime;
          this.master.gain.cancelScheduledValues(now);
          this.master.gain.setTargetAtTime(0, now, 0.03);
          this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, now + 0.08, 0.05);
        } catch (_) { /* تجاهل */ }
      }
    },

    _loadVoices() {
      if (!('speechSynthesis' in global)) return;
      const pick = () => {
        const vs = global.speechSynthesis.getVoices() || [];
        const ar = vs.filter((v) => /^ar/i.test(v.lang || ''));
        this._voice = ar.find((v) => /female|هالة|salma|zariyah|hoda|laila|amina/i.test(v.name)) || ar[0] || null;
      };
      pick();
      try { global.speechSynthesis.onvoiceschanged = pick; } catch (_) { /* تجاهل */ }
    },

    /** نغمة روبوت واحدة */
    tone(freq, dur, opts) {
      const o = opts || {};
      const ctx = this.ensure();
      if (!ctx || this.muted) return;
      const t0 = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = o.cutoff || 2400;
      filter.Q.value = 3;
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t0 + dur);
      const peak = (o.gain == null ? 0.12 : o.gain);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(filter); filter.connect(gain); gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    sfx(name) {
      if (this.muted) return;
      this.ensure();
      const n = String(name || 'click');
      switch (n) {
        case 'greet':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, { delay: i * 0.085, type: 'triangle', gain: 0.11 }));
          this.tone(1568, 0.22, { delay: 0.36, type: 'sine', gain: 0.06 });
          break;
        case 'ok':
          this.tone(880, 0.1, { gain: 0.1 });
          this.tone(1318, 0.16, { delay: 0.09, gain: 0.09 });
          break;
        case 'error':
          this.tone(220, 0.16, { gain: 0.11, type: 'sawtooth', cutoff: 900 });
          this.tone(174, 0.28, { delay: 0.14, gain: 0.1, type: 'sawtooth', cutoff: 700 });
          break;
        case 'laugh':
          for (let i = 0; i < 5; i++) {
            this.tone(720 - i * 26, 0.075, { delay: i * 0.1, type: 'triangle', gain: 0.09, glide: 520 });
          }
          break;
        case 'scan':
          this.tone(420, 0.5, { type: 'sine', gain: 0.08, glide: 1700, cutoff: 4000 });
          this.tone(840, 0.5, { type: 'triangle', gain: 0.04, delay: 0.05, glide: 2400 });
          break;
        case 'alert':
          this.tone(1046, 0.09, { gain: 0.1 });
          this.tone(1046, 0.09, { delay: 0.14, gain: 0.1 });
          break;
        case 'power':
          this.tone(160, 0.5, { type: 'sawtooth', gain: 0.09, glide: 900, cutoff: 1600 });
          this.tone(1200, 0.16, { delay: 0.42, type: 'sine', gain: 0.07 });
          break;
        case 'pop':
          this.tone(980, 0.07, { type: 'sine', gain: 0.1, glide: 1400 });
          break;
        case 'boing':
          this.tone(320, 0.24, { type: 'triangle', gain: 0.1, glide: 760, cutoff: 2000 });
          break;
        default:
          this.tone(660, 0.07, { gain: 0.09 });
      }
    },

    /** لغة الروبوت: نغمة قصيرة لكل مقطع بدل الكلام */
    chant(text) {
      if (this.muted) return;
      this.ensure();
      const words = String(text || '').trim().split(/\s+/).filter(Boolean);
      const count = Math.max(3, Math.min(14, words.length * 2 + 1));
      const scale = [392, 440, 523, 587, 659, 784, 880];
      let seed = 7;
      for (const ch of String(text || '')) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
      this.speaking = true;
      for (let i = 0; i < count; i++) {
        const f = scale[(seed + i * 3) % scale.length] * (i % 4 === 0 ? 1 : 1);
        const dur = 0.075 + ((seed >> i) % 3) * 0.02;
        this.tone(f, dur, { delay: i * 0.1, type: i % 3 === 0 ? 'triangle' : 'square', gain: 0.085, cutoff: 2600 });
      }
      const total = count * 0.1 * 1000 + 220;
      this._timers.push(setTimeout(() => { this.speaking = false; }, total));
    },

    /** يتكلّم: كلام عربي إن توفّر صوت، وإلا لغة الروبوت */
    speak(text) {
      const t = String(text || '').trim();
      if (!t || this.muted) return { spoken: false, text: t };
      this.ensure();

      const wantArabic = this.mode !== 'beep';
      const hasAr = this._voice && ('speechSynthesis' in global);

      if (wantArabic && hasAr) {
        try {
          const synth = global.speechSynthesis;
          synth.cancel();
          const u = new global.SpeechSynthesisUtterance(t);
          u.voice = this._voice;
          u.lang = this._voice.lang || 'ar-SA';
          u.pitch = 1.55;
          u.rate = 1.02;
          u.volume = 1;
          u.onstart = () => { this.speaking = true; };
          u.onend = () => { this.speaking = false; };
          u.onerror = () => { this.speaking = false; };
          this.speaking = true;
          synth.speak(u);
          this.sfx('pop');
          return { spoken: true, engine: 'speech' };
        } catch (_) { /* يسقط إلى النغمات */ }
      }

      this.chant(t);
      return { spoken: true, engine: 'beep' };
    },

    level() {
      if (!this.analyser) return 0;
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      return sum / data.length / 255;
    }
  };

  // ============================================================== النسخة الحيّة
  function mount(host, opts) {
    const o = opts || {};
    if (!host) throw new Error('ZynqBot.mount يحتاج عنصرًا');
    const uid = 'b' + (++seq);
    host.innerHTML = markup(uid, o);
    const svg = host.querySelector('.bot-svg');

    let pose = o.pose || 'stand';
    let faceId = o.eyes && FACE_BY_ID[o.eyes] ? o.eyes : (o.expression || 'idle');
    const alive = o.alive !== false;
    const timers = [];

    const setFace = (id, opts2) => {
      const f = FACE_BY_ID[id] || FACE_BY_ID.idle;
      faceId = FACE_BY_ID[id] ? id : 'idle';
      svg.setAttribute('data-eyes', f.eyes);
      svg.setAttribute('data-mouth', f.mouth);
      if (opts2 && opts2.sfx) Voice.sfx(opts2.sfx);
      return f;
    };

    const setPose = (id) => {
      if (!POSES.some((p) => p.id === id)) return pose;
      pose = id;
      svg.setAttribute('data-pose', id);
      // بعض الأوضاع تفرض تعبيرًا مناسبًا
      if (id === 'sleep') setFace('sleep');
      else if (id === 'think') setFace('think');
      else if (id === 'thumbs') setFace('happy');
      else if (id === 'dance') setFace('laugh');
      else if (id === 'wave') setFace('happy');
      else if (id === 'typing') setFace('cool');
      return pose;
    };

    // تتبّع المؤشّر: العين والرأس يتابعان الزائر
    const onMove = (ev) => {
      if (!alive) return;
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height) * 2 - 1));
      svg.style.setProperty('--look-x', x.toFixed(3));
      svg.style.setProperty('--look-y', y.toFixed(3));
    };
    const onLeave = () => {
      svg.style.setProperty('--look-x', 0);
      svg.style.setProperty('--look-y', 0);
    };

    // رمش عشوائي
    const blinkLoop = () => {
      if (!alive) return;
      const wait = 2400 + Math.random() * 4200;
      timers.push(setTimeout(() => {
        if (svg.getAttribute('data-eyes') === 'open' && !this_isBusy()) {
          const g = svg.querySelector('.eyes-open');
          if (g) {
            g.classList.add('is-blinking');
            timers.push(setTimeout(() => g.classList.remove('is-blinking'), 130));
          }
        }
        blinkLoop();
      }, wait));
    };
    const this_isBusy = () => svg.classList.contains('is-talking');

    if (alive) {
      blinkLoop();
      global.addEventListener('pointermove', onMove, { passive: true });
      global.addEventListener('pointerleave', onLeave, { passive: true });
    }

    setFace(faceId);
    if (o.pose) setPose(o.pose);

    const inst = {
      el: svg,
      host,
      uid,
      get pose() { return pose; },
      get expression() { return faceId; },
      setPose,
      setExpression(id, opts2) { return setFace(id, opts2); },
      /** يتكلّم ويُظهر تعبيرًا أثناء الكلام */
      say(text, options) {
        const opt = options || {};
        const expr = opt.expression || 'happy';
        const before = faceId;
        if (opt.expression !== null) setFace(expr);
        svg.classList.add('is-talking');
        const res = Voice.speak(text);
        if (opt.sfx) Voice.sfx(opt.sfx);
        if (opt.onSay) { try { opt.onSay(text); } catch (_) { /* تجاهل */ } }
        const dur = opt.duration || Math.min(7000, Math.max(1400, String(text).length * 95));
        timers.push(setTimeout(() => {
          svg.classList.remove('is-talking');
          if (opt.restore !== false) setFace(opt.then || before);
        }, dur));
        return res;
      },
      wave() {
        setPose('wave');
        Voice.sfx('greet');
        timers.push(setTimeout(() => { if (pose === 'wave') setPose('stand'); }, 2600));
      },
      react() {
        const items = [
          { f: 'happy', s: 'greet', p: 'wave' },
          { f: 'wink', s: 'pop', p: 'thumbs' },
          { f: 'surprised', s: 'boing', p: 'stand' },
          { f: 'star', s: 'scan', p: 'dance' },
          { f: 'laugh', s: 'laugh', p: 'dance' }
        ];
        const it = items[Math.floor(Math.random() * items.length)];
        setPose(it.p);
        setFace(it.f);
        Voice.sfx(it.s);
        svg.classList.add('is-bouncing');
        timers.push(setTimeout(() => svg.classList.remove('is-bouncing'), 700));
        return it.f;
      },
      destroy() {
        for (const t of timers) clearTimeout(t);
        timers.length = 0;
        if (alive) {
          global.removeEventListener('pointermove', onMove);
          global.removeEventListener('pointerleave', onLeave);
        }
        host.innerHTML = '';
      }
    };

    return inst;
  }

  function applyTheme(id) {
    const t = THEMES.find((x) => x.id === id) || THEMES[0];
    const root = document.documentElement;
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-2', t.accent2);
    root.style.setProperty('--accent-glow', t.glow);
    root.style.setProperty('--bot-led', t.led);
    root.setAttribute('data-theme', t.id);
    try { localStorage.setItem('zynq-bot-theme', t.id); } catch (_) { /* تجاهل */ }
    return t;
  }

  global.ZynqBot = {
    mount,
    applyTheme,
    POSES,
    FACES,
    THEMES,
    voice: Voice,
    markup
  };
})(window);
