/**
 * Shared push-notification helpers (server only) used by the daily cron
 * (api/send-due-notifications.js) and the manual test endpoint
 * (api/test-notification.js).
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging as fcmMessaging } from 'firebase-admin/messaging';

export const fmtMoney = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

export function getMessaging() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.replace(/^\uFEFF/, '').trim())) });
  }
  return fcmMessaging();
}

export const TODAY_LINK = 'https://opgestion.vercel.app/?tab=today';
const TAG = 'jocoadmin-due';

// One short line; tapping the notification opens the "Cobros de hoy" list.
export function composeDueMessage(list) {
  return list.length === 0
    ? { title: 'Hoy no hay cobros pendientes' }
    : { title: 'Estas personas deben pagar hoy' };
}

// Sends to every token, deletes the ones FCM reports as dead. Returns { sent, failed }.
export async function sendToTokens(db, tokens, notification, link = TODAY_LINK, dryRun = false) {
  if (!tokens.length) return { sent: 0, failed: 0 };
  const result = await getMessaging().sendEachForMulticast({
    tokens,
    notification,
    webpush: {
      headers: { Urgency: 'high', TTL: '86400' },
      fcmOptions: { link },
      notification: { tag: TAG, renotify: true }
    }
  }, dryRun);
  const dead = [];
  tokens.forEach((tk, i) => {
    const code = result.responses[i].error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') dead.push(tk);
  });
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  return { sent: result.successCount, failed: result.failureCount };
}