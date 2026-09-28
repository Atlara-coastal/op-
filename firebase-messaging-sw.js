importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// TODO: fill in with OP's own Firebase project config (must match js/config.js's
// FIREBASE_CONFIG exactly — this file can't import config.js, so it's duplicated here).
firebase.initializeApp({
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
});

const messaging = firebase.messaging();

// Notification messages are also displayed by the Firebase SDK itself; using the same tag
// makes this one replace it instead of showing a second notification. Tapping opens the
// link sent by the server (the "Cobros de hoy" list).
const TODAY_URL = '/?tab=today';

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  self.registration.showNotification(n.title || d.title || 'OP', {
    body: n.body || d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-32.png',
    tag: 'op-due',
    renotify: true,
    data: { url: (payload.fcmOptions && payload.fcmOptions.link) || d.url || TODAY_URL }
  });
});

self.addEventListener('notificationclick', (event) => {
  const url = event.notification.data && event.notification.data.url;
  if (!url) return; // the Firebase SDK handles its own notifications
  event.notification.close();
  event.waitUntil(clients.openWindow(url));
});