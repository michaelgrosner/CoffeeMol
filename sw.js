const CACHE_NAME = 'coffeemol-v1';
const ASSETS = [
  './',
  './index.html',
  './index.css',
  './CoffeeMol.js',
  './CoffeeMol.js.map',
  './favicon.svg',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
