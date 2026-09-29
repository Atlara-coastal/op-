importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyACQypHsPbTxx3soo9szT6A1icdUF2loAI',
  authDomain: 'opgestion-fbea7.firebaseapp.com',
  projectId: 'opgestion-fbea7',
  storageBucket: 'opgestion-fbea7.firebasestorage.app',
  messagingSenderId: '675989086511',
  appId: '1:675989086511:web:5226c9ff1f923433d6c1da'
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