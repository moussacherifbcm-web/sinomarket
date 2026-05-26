// SinoMarket BF - Service Worker v2 — Cache intelligent
const CACHE = 'sinomarket-v2';
const STATIC = 'sinomarket-static-v2';

// Assets à précacher
const PRECACHE = [
  '/',
  '/manifest.json',
];

// ===== INSTALL =====
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ===== ACTIVATE =====
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE && k !== STATIC).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ===== FETCH — Stratégie mixte =====
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne pas intercepter les API Supabase, OneSignal, Gemini
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('onesignal') ||
    url.hostname.includes('googleapis') ||
    url.pathname.startsWith('/api/')
  ) return;

  // Images : Cache first (rapide sur connexion lente)
  if (e.request.destination === 'image') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const response = await fetch(e.request);
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // HTML/JS/CSS : Network first, fallback cache
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'SinoMarket BF', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'SinoMarket BF', {
      body: data.body || data.message || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: data.url ? { url: data.url } : {},
      actions: [
        { action: 'open', title: 'Voir →' },
        { action: 'close', title: 'Fermer' }
      ]
    })
  );
});

// ===== CLICK NOTIFICATION =====
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
