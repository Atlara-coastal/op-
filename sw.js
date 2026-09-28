/**
 * OP - Service Worker
 * Provides offline caching and mobile PWA installability
 */

const CACHE_NAME = 'op-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './tailwind.build.css',
  './manifest.json',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/theme.js',
  './js/config.js',
  './js/supabase-client.js',
  './js/auth.js',
  './js/animations.js',
  './js/push.js',
  './js/permissions.js',
  './js/users.js',
  './js/select-enhance.js',
  './js/mobile-ui.js',
  './js/pdf-doc.js',
  './js/reminder.js',
  './js/components/collections.js',
  './js/due.js',
  './js/components/dashboard.js',
  './js/components/products.js',
  './js/components/quotes.js',
  './js/components/clients.js',
  './js/components/sales.js',
  './js/components/portfolio.js',
  './js/components/today.js',
  './icons/icon.svg',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('PWA cache addAll warning (some CDN assets might be dynamic):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fallback for push subscriptions that still point at this worker: always show the
// notification (iOS revokes subscriptions that receive pushes without showing one).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { notification: { body: e.data ? e.data.text() : '' } }; }
  const n = d.notification || d.data || {};
  e.waitUntil(self.registration.showNotification(n.title || 'OP', {
    body: n.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-32.png',
    tag: 'op-due',
    data: { url: '/?tab=today' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow((e.notification.data && e.notification.data.url) || './index.html');
  }));
});

self.addEventListener('fetch', (e) => {
  // Try network first, fallback to cache for app files
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});
