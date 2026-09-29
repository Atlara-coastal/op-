/**
 * JocoAdmin - Authentication & Account Management
 * Login is username + password; internally mapped to a Supabase Auth email
 * (username@AUTH_USERNAME_DOMAIN) so Supabase's battle-tested email/password
 * auth (hashed passwords, JWT sessions, refresh tokens) can be reused as-is.
 *
 * Accounts are created only by admins (see js/users.js -> /api/create-user).
 * After login the user's role/permissions are loaded (js/permissions.js).
 */
import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { AUTH_USERNAME_DOMAIN } from './config.js';
import { animateModalIn, animateLoginIn, animateShellIn } from './animations.js';
import { loadProfile, hasAnyAccess, getActiveTenant, getActiveTenantInfo, isSuperadmin, getTenants, setActiveTenant } from './permissions.js';
import { initUsersAdmin } from './users.js';
import { db } from './db.js';
import { applyTenantTheme } from './theme.js';

function usernameToEmail(username) {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${clean}@${AUTH_USERNAME_DOMAIN}`;
}

function emailToUsername(email) {
  return (email || '').split('@')[0];
}

let currentSession = null;

function setFormBusy(form, busy) {
  const btn = form.querySelector('[type="submit"]');
  if (!btn) return;
  btn.disabled = busy;
  btn.classList.toggle('opacity-60', busy);
}

function showAppShell(show) {
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');
  if (loginScreen) loginScreen.classList.toggle('hidden', show);
  if (appShell) appShell.classList.toggle('hidden', !show);
  hideBootLoader(show);
  if (show) animateShellIn();
  else animateLoginIn();
}

// The boot loader (see index.html) covers the page while a saved session is restored.
function hideBootLoader(fade) {
  const html = document.documentElement;
  if (!html.classList.contains('restoring-session')) return;
  const loader = document.getElementById('boot-loader');
  if (!fade || !loader) { html.classList.remove('restoring-session'); return; }
  loader.classList.add('bl-out');
  setTimeout(() => { html.classList.remove('restoring-session'); loader.classList.remove('bl-out'); }, 350);
}

export function getCurrentUsername() {
  if (!currentSession) return null;
  return currentSession.user.user_metadata?.username || emailToUsername(currentSession.user.email);
}

export function getAccessToken() {
  return currentSession?.access_token || null;
}

// Loads the role/permissions for the session; returns false if the account has no access.
async function enterApp(session, onAuthenticated, errorEl) {
  currentSession = session;
  await loadProfile(session.user.id);
  if (!hasAnyAccess()) {
    await supabase.auth.signOut();
    currentSession = null;
    showAppShell(false);
    if (errorEl) {
      errorEl.textContent = 'Tu cuenta no tiene permisos asignados. Pide a un administrador que te los configure.';
      errorEl.classList.remove('hidden');
    }
    return false;
  }
  // Must happen before the app renders anything: it decides which space's local
  // cache is read and which colors/logo are shown.
  db.setTenant(getActiveTenant());
  applyTenantTheme(getActiveTenantInfo());
  showAppShell(true);
  onAuthenticated();
  return true;
}

function bindLoginForm(onAuthenticated) {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    if (!username.trim() || password.length < 4) {
      errorEl.textContent = 'Ingresa usuario y contraseña válidos.';
      errorEl.classList.remove('hidden');
      return;
    }

    setFormBusy(form, true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password
    });

    if (error) {
      setFormBusy(form, false);
      // Generic message on purpose: never reveal whether the username exists.
      errorEl.textContent = 'Usuario o contraseña incorrectos.';
      errorEl.classList.remove('hidden');
      return;
    }

    const ok = await enterApp(data.session, onAuthenticated, errorEl);
    setFormBusy(form, false);
    if (ok) form.reset();
  });
}

function bindLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    currentSession = null;
    try { localStorage.removeItem('op_tenant_theme'); } catch {}
    window.location.reload();
  });
}

function bindChangePassword() {
  const toggle = document.getElementById('change-pass-toggle');
  const form = document.getElementById('change-pass-form');
  const msg = document.getElementById('cp-msg');
  if (!toggle || !form) return;
  const say = (text, ok) => {
    msg.textContent = text;
    msg.style.color = ok ? 'var(--success)' : 'var(--danger)';
    msg.classList.remove('hidden');
  };
  toggle.addEventListener('click', () => form.classList.toggle('hidden'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.classList.add('hidden');
    const current = document.getElementById('cp-current').value;
    const next = document.getElementById('cp-new').value;
    if (next.length < 8) return say('La nueva contraseña debe tener al menos 8 caracteres.', false);
    if (next !== document.getElementById('cp-confirm').value) return say('Las contraseñas nuevas no coinciden.', false);
    if (next === current) return say('La nueva contraseña debe ser distinta a la actual.', false);
    setFormBusy(form, true);
    const email = currentSession?.user?.email;
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) { setFormBusy(form, false); return say('La contraseña actual es incorrecta.', false); }
    const { error } = await supabase.auth.updateUser({ password: next });
    setFormBusy(form, false);
    if (error) return say('No se pudo cambiar la contraseña: ' + error.message, false);
    form.reset();
    say('Contraseña actualizada correctamente.', true);
  });
}

function bindAccountModal() {
  const openBtn = document.getElementById('account-btn');
  const modal = document.getElementById('account-modal');
  const closeBtn = document.getElementById('account-modal-close');
  const usernameLabel = document.getElementById('account-current-username');
  if (!openBtn || !modal) return;

  const switcher = document.getElementById('tenant-switcher');
  const tenantSelect = document.getElementById('tenant-select');
  tenantSelect?.addEventListener('change', () => setActiveTenant(tenantSelect.value));

  openBtn.addEventListener('click', () => {
    if (usernameLabel) usernameLabel.textContent = getCurrentUsername() || '—';
    if (switcher && tenantSelect) {
      switcher.classList.toggle('hidden', !isSuperadmin());
      if (isSuperadmin()) {
        tenantSelect.innerHTML = getTenants()
          .map((t) => `<option value="${t.id}" ${t.id === getActiveTenant() ? 'selected' : ''}>${t.name}</option>`)
          .join('');
      }
    }
    modal.classList.remove('hidden');
    initUsersAdmin();
    if (window.lucide) window.lucide.createIcons();
    animateModalIn(modal);
  });
  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

/**
 * Boots the auth gate. Calls onAuthenticated() once a valid session exists
 * (restored from storage or via fresh login) and the profile is loaded, and
 * keeps the app shell hidden behind the login screen until then.
 *
 * If Supabase isn't configured yet (see js/config.js), auth is skipped
 * entirely so the app keeps working in local-only mode during setup.
 */
export async function initAuth(onAuthenticated) {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('[JocoAdmin] Supabase no está configurado (js/config.js). La app funciona en modo local sin login.');
    showAppShell(true);
    onAuthenticated();
    return;
  }

  bindLoginForm(onAuthenticated);
  bindLogout();
  bindAccountModal();
  bindChangePassword();

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await enterApp(data.session, onAuthenticated, document.getElementById('login-error'));
  } else {
    showAppShell(false);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
  });
}
