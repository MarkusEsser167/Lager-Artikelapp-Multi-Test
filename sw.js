const CACHE_NAME = 'lager-meldung-multi-test-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/barcode.js',
  './js/camera.js',
  './js/share.js',
  './js/export.js',
  './js/pdf.js',
  './js/format.js',
  './js/formFields.js',
  './js/refData.js',
  './js/version.js',
  './js/views/home.js',
  './js/views/siteSelect.js',
  './js/views/newLagerplatz.js',
  './js/views/newVerschrottung.js',
  './js/views/newMassenkorrektur.js',
  './js/views/newFehlbestand.js',
  './vendor/xlsx.full.min.js',
  './vendor/jspdf.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/logo-wego-vti.png',
];

self.addEventListener('install', (event) => {
  // { cache: 'reload' } statt cache.addAll(): umgeht den normalen HTTP-Cache des Browsers,
  // der sonst beim Precachen versehentlich eine veraltete Version einer Datei einfrieren kann.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE.map((url) => fetch(url, { cache: 'reload' }).then((res) => cache.put(url, res)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Artikel-/Lagerplatzliste sollen möglichst aktuell sein, sobald online: hier zuerst das
  // Netz versuchen (normale HTTP-Validierung/ETag genügt – kein 'reload', da die Artikelliste
  // mehrere MB groß sein kann und sonst bei jedem Öffnen komplett neu geladen würde) und nur
  // bei Offline auf die zuletzt zwischengespeicherte Version zurückfallen.
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
