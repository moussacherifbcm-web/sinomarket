// SinoMarket BF - Service Worker v3
// OneSignal gère ses propres notifications push via son SDK
// Ce fichier gère uniquement le cache PWA

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

const CACHE = 'sinomarket-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne pas intercepter : Supabase, OneSignal, APIs externes, appels API Vercel
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('onesignal') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('alicdn') ||
    url.hostname.includes('unsplash') ||
    url.pathname.startsWith('/api/')
  ) return;

  if (e.request.method !== 'GET') return;

  // Images — cache first
  if (e.request.destination === 'image') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch {
          return new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // HTML/JS/CSS — network first
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
