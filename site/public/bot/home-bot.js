/* ==========================================================================
   ZYNQ BOT — ربط الروبوت بالصفحة الرئيسية (قسم الشخصية)
   ========================================================================== */
(function () {
  'use strict';
  if (!window.ZynqBot) return;

  // بطاقات الأوضاع الصغيرة
  document.querySelectorAll('[data-bot-pose]').forEach((card) => {
    try {
      window.ZynqBot.mount(card, {
        pose: card.dataset.botPose || 'stand',
        expression: card.dataset.botFace || 'happy',
        alive: false
      });
    } catch (_) { /* تجاهل */ }
  });

  // الروبوت الكبير في القسم
  const host = document.getElementById('bot-feature-live');
  let bot = null;
  if (host) {
    bot = window.ZynqBot.mount(host, { pose: 'wave', expression: 'happy', alive: true });
    bot.setPose('wave');
    setTimeout(() => bot.setPose('stand'), 2800);

    // يلوّح للزائر عندما يصل القسم إلى الشاشة
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          bot.setPose('wave');
          bot.setExpression('happy');
          setTimeout(() => bot.setPose('stand'), 2600);
          io.disconnect();
        });
      }, { threshold: 0.35 });
      io.observe(host);
    }
  }

  // زر التحية
  const tease = document.getElementById('bot-tease');
  const line = document.getElementById('bot-tease-line');
  const lines = [
    'أهلًا! أنا ZYNQ BOT — أحيّيك من قلب الموقع ⚡',
    'عندي عشرة أوضاع واثنا عشر تعبيرًا… جرّبني في المختبر!',
    'هل تعلم؟ كل ما تراه مرسوم بـ SVG — بلا صورة واحدة.',
    'أنا أرافقك في زاوية الشاشة، اضغط عليّ في أي وقت.'
  ];
  let n = 0;
  if (tease) {
    tease.addEventListener('click', () => {
      const text = lines[n++ % lines.length];
      if (bot) bot.say(text, { expression: 'happy', sfx: 'greet', then: 'happy' });
      else window.ZynqBot.voice.speak(text);
      if (line) line.textContent = text;
    });
  }
})();
