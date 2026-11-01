/* معاينة الملفات الأصلية، لا صورًا بديلة للمؤثرات. كل التشغيل محلي ومن نفس الموقع. */
(function (global) {
  'use strict';
  let sequence = 0;
  function mount(host, file, options) {
    const opt = options || {};
    const controller = { destroyed: false, paused: !!opt.paused, ready: null, setPaused, destroy };
    const abort = new AbortController();
    let animation = null;
    let svg = null;
    let audio = null;
    let gif = null;
    let placeholder = null;
    const url = new URL(file.url, global.location.href);
    if (url.origin !== global.location.origin) throw new Error('المعاينات متاحة لملفات الموقع فقط');
    host.replaceChildren();
    host.classList.add('zy-preview');
    function applyPause() {
      if (animation) { if (controller.paused) animation.pause(); else animation.play(); }
      if (svg) {
        svg.classList.toggle('is-paused', controller.paused);
        try { if (controller.paused) svg.pauseAnimations(); else svg.unpauseAnimations(); } catch (_) { /* CSS-only SVG */ }
      }
      if (audio && controller.paused) audio.pause();
      if (gif && placeholder) {
        gif.hidden = controller.paused;
        placeholder.hidden = !controller.paused;
      }
    }
    function setPaused(paused) { controller.paused = !!paused; applyPause(); return controller.paused; }
    function destroy() {
      controller.destroyed = true;
      abort.abort();
      if (animation) animation.destroy();
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      animation = svg = audio = gif = placeholder = null;
      host.replaceChildren();
    }
    function showStatic(message) {
      const node = document.createElement('div');
      node.className = 'preview-static';
      node.textContent = message;
      host.replaceChildren(node);
    }
    async function load() {
      const ext = String(file.ext || '').toLowerCase();
      try {
        if (ext === 'json' && file.format === 'Lottie JSON') {
          if (!global.lottie) throw new Error('مشغّل Lottie غير متاح');
          const response = await fetch(url, { signal: abort.signal, cache: 'no-cache' });
          if (!response.ok) throw new Error('تعذّر تحميل ملف الحركة');
          const data = await response.json();
          if (controller.destroyed) return;
          if (!Array.isArray(data.layers) || !data.w || !data.h) throw new Error('ملف الحركة غير صالح');
          host.replaceChildren();
          animation = global.lottie.loadAnimation({ container: host, renderer: 'svg', loop: true, autoplay: !controller.paused, animationData: data,
            rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true } });
          animation.addEventListener('data_failed', () => { if (!controller.destroyed) showStatic('تعذّر عرض الحركة. يمكنك تنزيل الملف الأصلي.'); });
          host.setAttribute('aria-label', 'معاينة متحركة: ' + file.name);
        } else if (ext === 'svg') {
          const response = await fetch(url, { signal: abort.signal, cache: 'no-cache' });
          if (!response.ok) throw new Error('تعذّر تحميل الرسم');
          const text = await response.text();
          if (controller.destroyed) return;
          const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
          if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('الرسم غير صالح');
          parsed.querySelectorAll('script,foreignObject,iframe,object,embed').forEach((node) => node.remove());
          const prefix = 'zy-preview-' + (++sequence) + '-';
          const ids = new Map();
          parsed.querySelectorAll('[id]').forEach((node) => { ids.set(node.id, prefix + node.id); node.id = prefix + node.id; });
          parsed.querySelectorAll('*').forEach((node) => {
            Array.from(node.attributes).forEach((attribute) => {
              if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
              let value = attribute.value.replace(/url\(#([^)]*)\)/g, (all, id) => ids.has(id) ? 'url(#' + ids.get(id) + ')' : all);
              if ((attribute.name === 'href' || attribute.name === 'xlink:href') && value.startsWith('#')) value = '#' + (ids.get(value.slice(1)) || value.slice(1));
              if (value !== attribute.value) node.setAttribute(attribute.name, value);
            });
          });
          svg = document.importNode(parsed.documentElement, true);
          svg.classList.add('zy-preview-svg');
          svg.setAttribute('role', 'img');
          svg.setAttribute('aria-label', file.name);
          host.replaceChildren(svg);
        } else if (/^(png|jpg|jpeg|webp|gif)$/.test(ext)) {
          const image = document.createElement('img');
          image.src = url.href;
          image.alt = file.name;
          image.loading = opt.thumbnail ? 'lazy' : 'eager';
          image.addEventListener('error', () => { if (!controller.destroyed) showStatic('تعذّر تحميل الصورة'); }, { once: true });
          host.replaceChildren(image);
          if (ext === 'gif') {
            gif = image;
            placeholder = document.createElement('div');
            placeholder.className = 'preview-static';
            placeholder.textContent = '⏸ معاينة GIF موقوفة — شغّل الحركة لعرضها';
            host.appendChild(placeholder);
          }
        } else if (/^(wav|mp3|ogg)$/.test(ext)) {
          const wrap = document.createElement('div');
          wrap.className = 'audio-preview';
          const label = document.createElement('p');
          label.textContent = '🎵 ' + file.name;
          audio = document.createElement('audio');
          audio.controls = true;
          audio.preload = 'none';
          audio.src = url.href;
          audio.setAttribute('aria-label', 'تشغيل ' + file.name);
          wrap.append(label, audio);
          host.replaceChildren(wrap);
        } else if (/^(txt|md|json|csv|html|js|css|cube)$/.test(ext)) {
          const response = await fetch(url, { signal: abort.signal, cache: 'no-cache' });
          if (!response.ok) throw new Error('تعذّر تحميل النص');
          const text = await response.text();
          if (controller.destroyed) return;
          const pre = document.createElement('pre');
          pre.className = 'text-preview';
          pre.dir = /^(js|css|html|json|csv|cube)$/.test(ext) ? 'ltr' : 'auto';
          pre.textContent = text.slice(0, 16000) + (text.length > 16000 ? '\n… المعاينة مختصرة؛ حمّل الملف لقراءته كاملًا.' : '');
          host.replaceChildren(pre);
        } else {
          showStatic(ext === 'zip' ? '📦 أرشيف ملفات — حمّله وفك الضغط لاستخدام المحتوى.' : '📄 حمّل الملف لفتحه بالبرنامج المناسب.');
        }
        applyPause();
      } catch (error) {
        if (!controller.destroyed && error.name !== 'AbortError') showStatic('تعذّرت المعاينة. جرّب مرة أخرى أو حمّل الملف الأصلي.');
      }
    }
    controller.ready = load();
    return controller;
  }
  global.ZynqPreview = { mount };
})(window);
