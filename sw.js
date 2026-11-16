// Service Worker: die App offline verfügbar halten. Code immer zuerst aus dem Netz (neue Versionen kommen sofort), sonst aus dem Cache.
const VERSION = 'wci-v1';
const CORE = [
  './', './index.html', './css/app.css', './manifest.webmanifest', './icon.svg', './icon-192.png',
  './js/main.js',
  './js/audio/context.js', './js/audio/player.js', './js/audio/space.js', './js/audio/spectra.js', './js/audio/synth.js',
  './js/engine/lesson.js', './js/engine/placement.js', './js/engine/probe.js', './js/engine/rating.js', './js/engine/skills.js', './js/engine/state.js', './js/engine/sync.js',
  './js/modules/common.js', './js/modules/tasks.js',
  './js/theory/instruments.js', './js/theory/names.js', './js/theory/tuning.js',
  './js/ui/compare.js', './js/ui/placement.js', './js/ui/runner.js', './js/ui/staff.js', './js/ui/views.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('wci-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
