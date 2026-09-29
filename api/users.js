/**
 * /api/users  (admin only)
 *   GET     -> list profiles
 *   PATCH   -> { userId, role?, perms?, password? }  update role/permissions/password
 *   DELETE  -> { userId }  remove account
 */
import { getSupabaseAdmin, getCaller, sanitizePerms, isAdminRole, resolveTenant } from './_supabaseAdmin.js';

export default async function handler(req, res) {
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
    res.status(403).json({ error: 'Solo un administrador puede gestionar cuentas.' });
    return;
  }

  const body = req.body || {};
  const isSuper = caller.profile.role === 'superadmin';

  // Accounts of another space are invisible and untouchable (superadmin excepted).
  const loadTarget = async (userId) => {
    const { data: target } = await admin.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (!target) return null;
    if (!isSuper && (target.role === 'superadmin' || target.tenant !== caller.profile.tenant)) return null;
    return target;
  };

  if (req.method === 'GET') {
    const tenant = await resolveTenant(admin, caller, req.query?.tenant);
    if (!tenant) {
      res.status(400).json({ error: 'Espacio no válido.' });
      return;
    }
    const { data, error } = await admin.from('profiles').select('user_id, username, role, perms, created_at').eq('tenant', tenant).order('created_at');
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ users: data });
    return;
  }

  if (req.method === 'PATCH') {
    const { userId, role, perms, password } = body;
    if (typeof userId !== 'string') {
      res.status(400).json({ error: 'Falta userId.' });
      return;
    }
    const target = await loadTarget(userId);
    if (!target) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    // The superadmin role is never granted or removed from the UI.
    const finalRole = target.role === 'superadmin' ? 'superadmin' : (role === 'admin' || role === 'user' ? role : target.role);
    if (userId === caller.user.id && !isAdminRole(finalRole)) {
      res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de administrador.' });
      return;
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
        return;
      }
      const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password });
      if (pwError) {
        res.status(400).json({ error: pwError.message });
        return;
      }
    }
    const { error } = await admin
      .from('profiles')
      .update({ role: finalRole, perms: sanitizePerms(finalRole, perms ?? target.perms) })
      .eq('user_id', userId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { userId } = body;
    if (typeof userId !== 'string') {
      res.status(400).json({ error: 'Falta userId.' });
      return;
    }
    if (userId === caller.user.id) {
      res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
      return;
    }
    const target = await loadTarget(userId);
    if (!target || target.role === 'superadmin') {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Método no permitido.' });
}
