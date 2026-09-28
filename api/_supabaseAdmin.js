/**
 * Server-only Supabase client using the service_role key.
 * This file must NEVER be imported by browser code — it is only ever
 * executed inside Vercel's serverless runtime, where SUPABASE_SERVICE_ROLE_KEY
 * is set as a project environment variable (never committed, never shipped
 * to the client bundle).
 */
import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export const TABS = ['dashboard', 'products', 'quotes', 'clients', 'sales', 'portfolio'];
const LEVELS = ['none', 'view', 'edit'];

// Non-admins can only ever EDIT quotes; every other tab is at most "view".
export function sanitizePerms(role, perms) {
  const out = {};
  for (const tab of TABS) {
    let level = LEVELS.includes(perms?.[tab]) ? perms[tab] : 'none';
    if (role !== 'admin' && tab !== 'quotes' && level === 'edit') level = 'view';
    out[tab] = level;
  }
  return out;
}

// Verifies the bearer token and returns { user, profile } (profile null if none).
export async function getCaller(admin, req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { error: 'No autenticado.', status: 401 };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { error: 'Sesión inválida o expirada.', status: 401 };
  const { data: profile } = await admin.from('profiles').select('*').eq('user_id', data.user.id).maybeSingle();
  return { user: data.user, profile };
}

// Must match js/config.js's AUTH_USERNAME_DOMAIN.
export const AUTH_USERNAME_DOMAIN = 'users.op.internal';

export function usernameToEmail(username) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${clean}@${AUTH_USERNAME_DOMAIN}`;
}
