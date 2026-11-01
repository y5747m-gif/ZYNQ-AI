/* إعدادات الصوت المشتركة: أصوات عربية فقط، اختيار يدوي، وحالة نطق حقيقية. */
(function (global) {
  'use strict';
  function init(options) {
    const Bot = global.ZynqBot;
    if (!Bot) return null;
    const opt = options || {};
    const voice = Bot.voice;
    const select = document.getElementById('voice-select');
    const status = document.getElementById('voice-status');
    const mute = document.getElementById('btn-mute');
    const mode = document.getElementById('mode-toggle');
    let lastText = '';
    function renderStatus() {
      const s = voice.status();
      if (mute) {
        mute.textContent = s.muted ? '🔇' : '🔊';
        mute.setAttribute('aria-pressed', String(s.muted));
        mute.setAttribute('aria-label', s.muted ? 'تشغيل الصوت' : 'كتم الصوت');
        mute.title = s.muted ? 'تشغيل الصوت' : 'كتم الصوت';
      }
      if (mode) {
        const beep = s.mode === 'beep';
        mode.setAttribute('aria-pressed', String(beep));
        mode.textContent = beep ? 'النغمات مفعّلة — العودة للعربية' : 'لغة الروبوت فقط (نغمات)';
      }
      if (!status) return;
      if (s.muted) status.textContent = 'الصوت مكتوم. الردود مكتوبة بالعربية، ويمكنك تشغيل الصوت من الزر أعلى الصفحة.';
      else if (s.mode === 'beep') status.textContent = 'وضع النغمات مفعّل باختيارك. هذه نغمات وليست نطقًا عربيًا.';
      else if (!s.supported) status.textContent = 'هذا المتصفح لا يدعم النطق. الردود تظل مكتوبة بالعربية؛ جرّب متصفحًا يدعم Web Speech.';
      else if (!s.available) status.textContent = 'لم أجد صوتًا عربيًا في الجهاز. ثبّت صوتًا عربيًا من إعدادات النطق في نظامك، ثم اضغط «تحديث الأصوات». لن أستبدله بصوت أجنبي أو أدّعي أن النغمات كلام عربي.';
      else if (s.reason === 'speech-error' || s.reason === 'timeout') status.textContent = 'تعذّر تشغيل الصوت العربي في الجهاز. جرّب صوتًا آخر من القائمة أو اختبر النطق من إعدادات النظام.';
      else if (s.pending) status.textContent = 'جارٍ تهيئة صوت العربية… إذا لم يبدأ، اختبر صوت النظام أو اختر صوتًا آخر.';
      else if (s.speaking) status.textContent = 'أتحدث الآن بالعربية: ' + (s.voice ? s.voice.name : '');
      else status.textContent = 'الصوت العربي جاهز: ' + s.voice.name + ' (' + s.voice.lang + '). يبدأ فقط عند الضغط على زر نطق أو إرسال طلب.';
    }
    function renderVoices() {
      if (select) {
        const voices = voice.arabicVoices();
        const current = voice.status().voice;
        select.replaceChildren();
        if (!voices.length) select.add(new Option('لا يوجد صوت عربي مثبت — اضغط تحديث الأصوات', ''));
        else voices.forEach((v) => select.add(new Option(v.name + ' — ' + v.lang, v.voiceURI)));
        select.disabled = !voices.length;
        if (current) select.value = current.uri;
      }
      renderStatus();
    }
    if (select) select.addEventListener('change', () => { voice.setVoice(select.value); renderStatus(); });
    const refresh = document.getElementById('voice-refresh');
    if (refresh) refresh.addEventListener('click', () => { voice.refreshVoices(); renderVoices(); });
    const test = document.getElementById('voice-test');
    if (test) test.addEventListener('click', () => {
      voice.setMode('arabic');
      lastText = (typeof opt.testText === 'function' ? opt.testText() : opt.testText) || 'أهلًا بك! أنا مساعد زينك، وأستطيع مساعدتك في اختيار المؤثرات والملفات بالعربية.';
      voice.speak(lastText);
      renderStatus();
    });
    const stop = document.getElementById('voice-stop');
    if (stop) stop.addEventListener('click', () => voice.stop());
    if (mute) mute.addEventListener('click', () => { voice.setMuted(!voice.muted); renderVoices(); });
    if (mode) mode.addEventListener('click', () => { voice.setMode(voice.mode === 'beep' ? 'arabic' : 'beep'); renderVoices(); });
    const unsubscribe = voice.subscribe(() => {
      renderStatus();
      if (select && voice.status().voice) select.value = voice.status().voice.uri;
      if (opt.onStatus && lastText) opt.onStatus(voice.status(), lastText);
    });
    voice.refreshVoices();
    renderVoices();
    return { refresh: renderVoices, destroy: unsubscribe };
  }
  global.ZynqVoiceControls = { init };
})(window);
