/* ==========================================================================
   ستيريو — عامل الخدمة (Service Worker)
   يجعل التطبيق يفتح بلا إنترنت: تُخزَّن قشرة التطبيق أول مرة، ثم تُقدَّم من
   الكاش مع تحديث في الخلفية. لا يُخزَّن أي ملف صوتي للمستخدم.
   ========================================================================== */
'use strict';

const CACHE = 'zynq-stereo-v3';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './sw.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // لا نلمس الخوادم الأخرى

  // التنقّل: من الكاش أولًا ثم الشبكة (يعمل بلا إنترنت)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(req).catch(() => caches.match('./index.html')))
    );
    return;
  }

  // الملفات الثابتة: كاش أولًا مع تحديث خلفي
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
