/**
 * GET /api/send-due-notifications
 * Invoked by Vercel Cron (11:00 and 15:00 Colombia time). Finds clients whose
 * pay day is today and pushes a summary to every registered device.
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token automatically).
 */
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import { getDueToday, bogotaToday } from '../js/due.js';
import { composeDueMessage, sendToTokens } from './_notify.js';

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  try {
    const db = getSupabaseAdmin();
    const today = bogotaToday();

    const { data: rows, error } = await db.from('sales').select('data, tenant').eq('deleted', false);
    if (error) throw error;

    const { data: clientRows } = await db.from('clients').select('data, tenant').eq('deleted', false);

    // Each business space is handled on its own: its admins get its full list and
    // its sellers their own sales — nobody is notified about another space's clients.
    const { data: profiles } = await db.from('profiles').select('username, role, tenant');
    const { data: tokenRows, error: tokenError } = await db.from('push_tokens').select('token, username');
    if (tokenError) throw tokenError;

    const tenantIds = [...new Set(rows.map((r) => r.tenant).filter(Boolean))];
    const groups = [];
    let dueTotal = 0;
    for (const tenant of tenantIds) {
      const clients = (clientRows || []).filter((r) => r.tenant === tenant).map((r) => r.data);
      const due = getDueToday(rows.filter((r) => r.tenant === tenant).map((r) => r.data), clients, today).map((x) => x.sale);
      dueTotal += due.length;
      if (!due.length) continue;
      const members = (profiles || []).filter((p) => p.tenant === tenant);
      const adminNames = new Set(members.filter((p) => p.role === 'admin').map((p) => p.username));
      const memberNames = new Set(members.map((p) => p.username));
      groups.push({ tokens: tokenRows.filter((t) => adminNames.has(t.username)).map((t) => t.token), list: due, showSeller: true });
      const bySeller = new Map();
      for (const s of due) {
        if (!s.sellerUsername || adminNames.has(s.sellerUsername) || !memberNames.has(s.sellerUsername)) continue;
        if (!bySeller.has(s.sellerUsername)) bySeller.set(s.sellerUsername, []);
        bySeller.get(s.sellerUsername).push(s);
      }
      for (const [seller, list] of bySeller) {
        groups.push({ tokens: tokenRows.filter((t) => t.username === seller).map((t) => t.token), list });
      }
    }

    if (req.query?.dry) {
      res.status(200).json({ ok: true, dry: true, today, due: dueTotal });
      return;
    }
    if (dueTotal === 0) {
      res.status(200).json({ ok: true, today, due: 0, sent: 0 });
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const g of groups) {
      const r = await sendToTokens(db, g.tokens, composeDueMessage(g.list));
      sent += r.sent;
      failed += r.failed;
    }

    res.status(200).json({ ok: true, today, due: dueTotal, sent, failed });
  } catch (err) {
    console.error('[send-due-notifications]', err);
    res.status(500).json({ error: err.message });
  }
}