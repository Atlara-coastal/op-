/**
 * JocoAdmin - Push notification registration.
 * Android (Capacitor): native FCM via the PushNotifications plugin.
 * iOS/browser PWA: Firebase Web Push via a service worker.
 * The device token is stored in Supabase (push_tokens) so the server-side
 * cron (api/send-due-notifications.js) can notify every registered device.
 */
import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from './config.js';
import { getCurrentUsername } from './auth.js';
import { showToast } from './utils.js';

const TOKEN_KEY = 'crediventas_push_token';

// Lets us (and the server) tell which kind of device a token belongs to.
function detectPlatform(platform) {
  if (platform !== 'web') return platform;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'web-ios';
  if (/Android/.test(ua)) return 'web-android';
  return 'web-desktop';
}

async function saveToken(token, platform) {
  if (!isSupabaseConfigured || !supabase || !token) return;
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* storage blocked */ }
  const { error } = await supabase.from('push_tokens').upsert({
    token,
    platform: detectPlatform(platform),
    username: getCurrentUsername(),
    updated_at: new Date().toISOString()
  });
  if (error) console.error('[JocoAdmin] No se pudo guardar el token de notificaciones:', error.message);
}

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

async function initNative() {
  const Push = window.Capacitor?.Plugins?.PushNotifications;
  if (!Push) return;
  const perm = await Push.requestPermissions();
  if (perm.receive !== 'granted') return;
  await Push.addListener('registration', (t) => saveToken(t.value, 'android'));
  await Push.addListener('registrationError', (e) => console.error('[JocoAdmin] Push error:', e));
  await Push.addListener('pushNotificationReceived', (n) => {
    showToast(`${n.title || ''} ${n.body || ''}`.trim(), 'info');
  });
  await Push.register();
}

// The app's own service worker (sw.js) owns scope "/". Firebase's push worker used to be
// registered on the same scope, so the two replaced each other and pushes could arrive at a
// worker that never displays them. It now lives in its own scope; any subscription left on
// "/" is legacy and is dropped so FCM stops targeting it.
async function dropLegacySubscription() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('./');
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) { /* nothing to clean */ }
}

async function getWebToken() {
  if (!window.firebase || !('serviceWorker' in navigator) || !('Notification' in window)) return null;
  if (!window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG);
  const messaging = window.firebase.messaging();
  await dropLegacySubscription();
  const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js', { scope: './firebase-cloud-messaging-push-scope' });
  // A brand-new registration is still installing; subscribing before it's active fails.
  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (worker) {
      await new Promise((resolve) => {
        if (worker.state === 'activated') return resolve();
        worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(); });
      });
    }
  }
  const token = await messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
  messaging.onMessage((payload) => {
    const n = payload.notification || {};
    showToast(`${n.title || ''} ${n.body || ''}`.trim(), 'info');
  });
  return token;
}

// Must be called from a user gesture on iOS (button tap).
export async function enableWebPush() {
  if (!('Notification' in window)) {
    showToast('Este navegador no soporta notificaciones. En iPhone, instala la app en la pantalla de inicio.', 'warning');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('Permiso de notificaciones denegado', 'warning');
    return;
  }
  try {
    const token = await getWebToken();
    await saveToken(token, 'web');
    showToast('Notificaciones activadas', 'success');
  } catch (e) {
    console.error('[JocoAdmin] Push web error:', e);
    showToast('No se pudieron activar las notificaciones', 'error');
  }
}

// Asks the server to push to THIS user's own devices only (no one else is notified).
async function sendTestPush(mode, btn) {
  if (!isSupabaseConfigured || !supabase) return;
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    const { data } = await supabase.auth.getSession();
    // Send only to THIS device, so it's clear which phone is (not) receiving.
    let token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    const res = await fetch('/api/test-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify({ mode, token })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) showToast(json.error || 'No se pudo enviar la notificación', 'error');
    else if (json.devices === 0) showToast('Este dispositivo aún no está registrado. Toca "Activar notificaciones de cobro" primero.', 'warning');
    else if (json.sent > 0) showToast('Notificación enviada a ESTE dispositivo. Minimiza la app: debería llegar en unos segundos.', 'success');
    else showToast('El servidor no pudo entregar la notificación. Vuelve a activar las notificaciones.', 'error');
  } catch (e) {
    showToast('No se pudo contactar el servidor (¿sin internet?)', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
    if (window.lucide) window.lucide.createIcons();
  }
}

// Reports what this device can actually do and fires a LOCAL notification (no server,
// no Firebase): if that one shows but pushes don't, the problem is the push pipeline;
// if it doesn't show either, the OS/app notification settings are blocking it.
async function runDiagnostics(btn, out) {
  const lines = [];
  const add = (k, v) => lines.push(`${k}: ${v}`);
  btn.disabled = true;
  out.classList.remove('hidden');
  out.textContent = 'Revisando…';
  try {
    const ua = navigator.userAgent;
    add('Dispositivo', detectPlatform('web'));
    add('Sistema', (/OS (\d+[_\d]*) like Mac/.exec(ua)?.[1] || /Android [\d.]+/.exec(ua)?.[0] || '—').replace(/_/g, '.'));
    add('App instalada (pantalla completa)', (navigator.standalone || matchMedia('(display-mode: standalone)').matches) ? 'sí' : 'NO (ábrela desde el icono de inicio)');
    add('Notificaciones soportadas', 'Notification' in window ? 'sí' : 'NO');
    add('Permiso', 'Notification' in window ? Notification.permission : '—');
    add('Push API', 'PushManager' in window ? 'sí' : 'NO');
    let token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    add('Token guardado en este dispositivo', token ? `sí (…${token.slice(-6)})` : 'NO');

    const regs = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    let fcmReg = null;
    for (const r of regs) {
      const w = r.active || r.waiting || r.installing;
      const sub = await r.pushManager?.getSubscription().catch(() => null);
      add('Service worker', `${new URL(r.scope).pathname} · ${w ? w.state : '—'} · suscripción push: ${sub ? new URL(sub.endpoint).host : 'no'}`);
      if (r.scope.includes('firebase-cloud-messaging-push-scope')) fcmReg = r;
    }
    if (!fcmReg) add('Worker de notificaciones', 'NO registrado');

    const reg = fcmReg || regs[0];
    if (reg && Notification.permission === 'granted') {
      await reg.showNotification('Prueba local de OP', { body: 'Si ves esto, el celular sí puede mostrar notificaciones.', icon: './icons/icon-192.png' });
      add('Notificación local', 'enviada: ¿la ves? (minimiza la app si no aparece)');
    } else {
      add('Notificación local', 'no se pudo enviar (falta permiso o worker)');
    }
  } catch (e) {
    add('Error', e.message);
  }
  out.textContent = lines.join('\n');
  btn.disabled = false;
}

export async function initPush() {
  const diagBtn = document.getElementById('push-diag-btn');
  const diagOut = document.getElementById('push-diag');
  diagBtn?.addEventListener('click', () => runDiagnostics(diagBtn, diagOut));
  const testBtn = document.getElementById('push-test-btn');
  const dueBtn = document.getElementById('push-due-btn');
  testBtn?.addEventListener('click', () => sendTestPush('test', testBtn));
  dueBtn?.addEventListener('click', () => sendTestPush('due', dueBtn));

  try {
    if (isNative()) {
      await initNative();
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      await saveToken(await getWebToken(), 'web');
    }
    document.getElementById('enable-push-btn')?.addEventListener('click', enableWebPush);
  } catch (e) {
    console.error('[JocoAdmin] initPush:', e);
  }
}
