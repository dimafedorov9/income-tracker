// Офлайн-кэш оболочки приложения. Данные (запросы к Apps Script) не кэшируются.
const CACHE = 'income-tracker-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'css/premium.css', 'js/app.js', 'js/api.js', 'js/store.js', 'js/calc.js', 'js/charts.js',
  'js/money.js', 'js/lock.js', 'js/ui.js', 'js/util.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname.includes('fonts.g'))) { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
