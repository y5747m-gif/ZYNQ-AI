/* ==========================================================================
   ZYNQ BOT — الرفيق العائم
   يضيف روبوتًا صغيرًا في زاوية الصفحة يتفاعل مع الزائر، دون أي صوت تلقائي.
   الاستخدام:  <div class="zy-buddy" data-zynq-buddy></div>
   ========================================================================== */
(function () {
  'use strict';
  if (!window.ZynqBot) return;

  const TIPS = [
    'أهلًا! أنا ZYNQ BOT ⚡',
    'تريد مؤثرات جاهزة؟ افتح مساعد الملفات وشوف الجديد.',
    'اضغط عليّ لأتحرّك!',
    'كل الأصول مجانية للاستخدام التجاري.',
    'جرّب صفحتي: أوضاع · وجوه · صوت 🤖'
  ];

  function build(host) {
    const bot = window.ZynqBot.mount(host.querySelector('.zy-buddy-bot') || host, {
      pose: 'stand', expression: 'happy', alive: true
    });
    const bubble = host.querySelector('.zy-buddy-say');
    let i = 0;
    let bubbleTimer = null;

    function say(text, ms) {
      if (!bubble) return;
      bubble.textContent = text;
      bubble.removeAttribute('hidden');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.setAttribute('hidden', ''), ms || 4600);
    }

    const btn = host.querySelector('.zy-buddy-hit') || host;
    btn.addEventListener('click', () => {
      bot.wave({ silent: true });
      const text = TIPS[i++ % TIPS.length];
      say(text, 5200);
      bot.say(text, { expression: 'happy' });
    });

    // يحيّي الزائر مرة واحدة بعد ثانيتين (بلا صوت — المتصفح يمنعه)
    setTimeout(() => {
      bot.wave({ silent: true });
      say(TIPS[0], 5200);
    }, 2200);

    // تغيّر هادئ كل فترة: لا يزعج ولا يشتت
    setInterval(() => {
      if (document.hidden) return;
      if (!bubble.hasAttribute('hidden')) return;
      const poses = ['stand', 'wave', 'present', 'thumbs', 'think'];
      bot.setPose(poses[Math.floor(Math.random() * poses.length)]);
      bot.setExpression(['happy', 'wink', 'star', 'idle'][Math.floor(Math.random() * 4)]);
      setTimeout(() => { bot.setPose('stand'); bot.setExpression('idle'); }, 4800);
    }, 21000);

    // على الشاشات الصغيرة نقلّل الإزعاج: الروبوت أقرب للزاوية وأصغر
    return bot;
  }

  function init() {
    document.querySelectorAll('[data-zynq-buddy]').forEach((host) => {
      try { build(host); } catch (_) { /* تجاهل */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
