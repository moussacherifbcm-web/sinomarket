// SinoMarket BF - Service Worker
// OneSignal gère ses propres notifications push via son SDK
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// ⚠️ CHANGE CE NUMÉRO À CHAQUE DÉPLOIEMENT
// Ex: v20250619_01 → v20250619_02 → v20250620_01
const CACHE = 'sinomarket-v20250629_01';

self.addEventListener('install', e => {
  self.skipWaiting(); // Activation immédiate
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Suppression ancien cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim()) // Prend contrôle immédiat de tous les onglets
      .then(() => self.clients.matchAll({ type: 'window' }).then(clients => {
        // Notifie tous les onglets ouverts → bannière "nouvelle version"
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
      }))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne pas intercepter : Supabase, OneSignal, APIs externes, Vercel
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('onesignal') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('alicdn') ||
    url.hostname.includes('unsplash') ||
    url.pathname.startsWith('/api/')
  ) return;

  if (e.request.method !== 'GET') return;

  // index.html / manifest / sw.js — TOUJOURS depuis le réseau, jamais depuis le cache
  if (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.json'
  ) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Images — cache first (performance)
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

  // Fonts, CSS, JS — network first avec fallback cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
