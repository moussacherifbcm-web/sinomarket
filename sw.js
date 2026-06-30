// ── SinoMarket BF — Service Worker v2 ──
var CACHE_NAME = 'sinomarket-v2';
var ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Installation : vider l'ancien cache et installer le nouveau
self.addEventListener('install', function(event) {
  self.skipWaiting(); // Prendre le contrôle immédiatement
  event.waitUntil(
    // Supprimer TOUS les anciens caches
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          if (name !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      return caches.open(CACHE_NAME).then(function(cache) {
        return cache.addAll(ASSETS_TO_CACHE);
      });
    })
  );
});

// Activation : prendre le contrôle de tous les clients
self.addEventListener('activate', function(event) {
  event.waitUntil(
    clients.claim().then(function() {
      // Notifier toutes les pages ouvertes
      return clients.matchAll({ type: 'window' }).then(function(clientList) {
        clientList.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED' });
        });
      });
    })
  );
});

// Fetch : Network First pour HTML, Cache First pour assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Toujours chercher le réseau pour index.html et les API
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Pour le reste : cache d'abord, réseau en fallback
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
