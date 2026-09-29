/**
 * POST /api/create-user
 * Body: { username, password, role: 'admin'|'user', perms?: { tab: 'none'|'view'|'edit' } }
 * Header: Authorization: Bearer <access token of an ADMIN>
 *
 * Only admins can create accounts. The service_role key stays on the server.
 */
import { getSupabaseAdmin, usernameToEmail, getCaller, sanitizePerms, isAdminRole, resolveTenant } from './_supabaseAdmin.js';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    res.status(500).json({ error: err.message });
    return;
  }

  const caller = await getCaller(admin, req);
  if (caller.error) {
    res.status(caller.status).json({ error: caller.error });
    return;
  }
  if (!isAdminRole(caller.profile?.role)) {
    res.status(403).json({ error: 'Solo un administrador puede crear cuentas.' });
    return;
  }

  const { username, password, role, perms } = req.body || {};
  // New accounts always land in the caller's space (a superadmin says which one).
  const tenant = await resolveTenant(admin, caller, req.body?.tenant);
  if (!tenant) {
    res.status(400).json({ error: 'No se pudo determinar el espacio para la nueva cuenta.' });
    return;
  }
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Usuario inválido (usa 3-32 caracteres: letras, números, punto, guion).' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    return;
  }
  const finalRole = role === 'admin' ? 'admin' : 'user';
  const cleanUsername = username.trim().toLowerCase();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username: cleanUsername }
  });

  if (createError) {
    const message = /already registered|already exists/i.test(createError.message)
      ? 'Ese nombre de usuario ya existe.'
      : createError.message;
    res.status(400).json({ error: message });
    return;
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: created.user.id,
    username: cleanUsername,
    role: finalRole,
    perms: sanitizePerms(finalRole, perms),
    tenant
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    res.status(500).json({ error: profileError.message });
    return;
  }

  res.status(200).json({ ok: true, userId: created.user.id, username: cleanUsername });
}
