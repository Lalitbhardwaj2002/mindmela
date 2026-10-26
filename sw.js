/* Service worker: lets Mindmela install as an app and open instantly.
 * Game files are fetched from the network first, so players always get the latest version,
 * with the saved copy as a fallback. The CDN libraries and fonts never change at a given URL,
 * so they're served from the saved copy once fetched.
 */
'use strict';

const CACHE = 'mindmela-v1';
const SHELL = ['./', './index.html', './style.css', './game.js', './questions.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'];
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...SHELL, ...CDN])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // One saved copy per file, whatever ?room=… is on the address.
    const key = url.origin + url.pathname;
    event.respondWith(fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(key, copy)); }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || caches.match('./'))));
    return;
  }

  if (CDN.includes(req.url) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
      return res;
    })));
  }
});
