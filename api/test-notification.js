/**
 * POST /api/test-notification   Body: { mode: 'test' | 'due' }
 * Header: Authorization: Bearer <access token of any signed-in user>
 * Sends a push ONLY to the caller's own devices, so notifications can be
 * checked at any time without bothering anyone else:
 *   test -> a plain "it works" notification
 *   due  -> the same daily summary the cron would send this user right now
 */
import { getSupabaseAdmin, getCaller } from './_supabaseAdmin.js';
import { getDueToday, bogotaToday } from '../js/due.js';
import { composeDueMessage, sendToTokens } from './_notify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const db = getSupabaseAdmin();
    const caller = await getCaller(db, req);
    if (caller.error) {
      res.status(caller.status).json({ error: caller.error });
      return;
    }
    const username = caller.profile?.username;
    if (!username) {
      res.status(403).json({ error: 'Tu cuenta no tiene perfil.' });
      return;
    }

    const { data: tokenRows, error: tokenError } = await db.from('push_tokens').select('token').eq('username', username);
    if (tokenError) throw tokenError;
    let tokens = (tokenRows || []).map((t) => t.token);
    // When the caller passes its own device token, notify only that device.
    const only = req.body?.token;
    if (only) tokens = tokens.filter((t) => t === only);
    if (!tokens.length) {
      res.status(200).json({ ok: false, devices: 0, message: 'Este dispositivo no está registrado para este usuario.' });
      return;
    }

    let notification = { title: 'Prueba de OP', body: 'Si ves esto, las notificaciones funcionan correctamente.' };
    let due = null;
    if (req.body?.mode === 'due') {
      const isAdmin = caller.profile.role === 'admin';
      const { data: rows } = await db.from('sales').select('data').eq('deleted', false);
      const { data: clientRows } = await db.from('clients').select('data').eq('deleted', false);
      const clients = (clientRows || []).map((r) => r.data);
      const sales = (rows || []).map((r) => r.data).filter((s) => isAdmin || s.sellerUsername === username);
      const list = getDueToday(sales, clients, bogotaToday()).map((x) => x.sale);
      due = list.length;
      notification = composeDueMessage(list);
    }

    const { sent, failed } = await sendToTokens(db, tokens, notification, undefined, !!req.body?.dry);
    res.status(200).json({ ok: sent > 0, devices: tokens.length, sent, failed, due });
  } catch (err) {
    console.error('[test-notification]', err);
    res.status(500).json({ error: err.message });
  }
}