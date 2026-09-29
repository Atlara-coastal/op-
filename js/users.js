/**
 * JocoAdmin - Account administration UI (admin only): create users, choose
 * role and per-tab permissions, edit or delete accounts. All changes go through
 * the /api/create-user and /api/users serverless functions.
 */
import { supabase } from './supabase-client.js';
import { TABS, TAB_LABELS, isAdmin, isSuperadmin, getActiveTenant } from './permissions.js';
import { showToast } from './utils.js';

const LEVEL_LABEL = { none: 'Sin acceso', view: 'Solo ver', edit: 'Ver y editar' };

async function api(path, method, body) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Error inesperado.');
  return json;
}

const SHORT = { none: 'Ninguno', view: 'Ver', edit: 'Editar' };

function permsGrid(prefix, role, perms = {}) {
  return TABS.map((tab) => {
    const canEditTab = role === 'admin' || tab === 'quotes';
    const current = role === 'admin' ? 'edit' : perms[tab] || 'none';
    const levels = ['none', 'view', ...(canEditTab ? ['edit'] : [])];
    const buttons = levels
      .map((l) => `<button type="button" data-level="${l}" class="${l === (levels.includes(current) ? current : 'none') ? 'active' : ''}" ${role === 'admin' ? 'disabled' : ''}>${SHORT[l]}</button>`)
      .join('');
    return `
      <div class="flex items-center justify-between gap-2 text-xs" style="color: var(--text-main);">
        <span class="font-semibold">${TAB_LABELS[tab]}</span>
        <div class="seg" data-perm="${prefix}:${tab}" data-value="${levels.includes(current) ? current : 'none'}">${buttons}</div>
      </div>`;
  }).join('');
}

function readPerms(root, prefix) {
  const perms = {};
  TABS.forEach((tab) => {
    perms[tab] = root.querySelector(`[data-perm="${prefix}:${tab}"]`)?.dataset.value || 'none';
  });
  return perms;
}
function summary(u) {
  if (u.role === 'admin') return 'Acceso total';
  return TABS.filter((t) => (u.perms?.[t] || 'none') !== 'none')
    .map((t) => `${TAB_LABELS[t]} (${u.perms[t] === 'edit' ? 'editar' : 'ver'})`)
    .join(', ') || 'Sin acceso a ninguna pestaña';
}

const field = 'text-[11px] font-bold uppercase tracking-wider block mb-1.5';

function shell() {
  return `
    <h3 class="text-sm font-bold pt-3" style="color: var(--text-main);">Crear nueva cuenta</h3>
    <form id="create-user-form" class="space-y-3">
      <div id="create-user-error" class="hidden text-xs font-semibold text-center py-2 px-3 rounded-xl" style="background: var(--danger-bg); color: var(--danger);"></div>
      <div><label class="${field}" style="color: var(--text-muted);">Usuario</label>
        <input id="new-username" type="text" required class="input-field w-full px-4 py-2.5 text-sm" placeholder="nuevo.usuario"></div>
      <div><label class="${field}" style="color: var(--text-muted);">Contraseña</label>
        <input id="new-password" type="password" required minlength="8" class="input-field w-full px-4 py-2.5 text-sm" placeholder="Mínimo 8 caracteres"></div>
      <div><label class="${field}" style="color: var(--text-muted);">Perfil</label>
        <select id="new-role" class="input-field w-full px-3 py-2.5 text-sm">
          <option value="user">Usuario (permisos por pestaña)</option>
          <option value="admin">Administrador (acceso total)</option>
        </select></div>
      <div id="new-perms" class="space-y-2 p-3 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
        ${permsGrid('new', 'user', { products: 'view', clients: 'view', quotes: 'edit' })}
      </div>
      <p class="text-[11px]" style="color: var(--text-muted);">Los usuarios no administradores solo pueden editar cotizaciones; en las demás pestañas solo pueden ver.</p>
      <button type="submit" class="btn-primary w-full py-2.5 rounded-xl text-sm font-bold">Crear cuenta</button>
    </form>
    <h3 class="text-sm font-bold pt-3" style="color: var(--text-main);">Cuentas existentes</h3>
    <div id="users-list" class="space-y-2"></div>`;
}

async function renderList(root) {
  const list = root.querySelector('#users-list');
  list.innerHTML = '<p class="text-xs" style="color: var(--text-muted);">Cargando…</p>';
  try {
    // A superadmin manages the accounts of the space currently selected.
    const { users } = await api(isSuperadmin() ? `/api/users?tenant=${encodeURIComponent(getActiveTenant())}` : '/api/users', 'GET');
    list.innerHTML = users.map((u) => `
      <div class="p-3 rounded-xl space-y-2" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);" data-user="${u.user_id}">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-bold truncate" style="color: var(--text-main);">${u.username}
              <span class="text-[10px] px-2 py-0.5 rounded-full ml-1" style="background: var(--primary-container); color: var(--primary);">${u.role === 'admin' ? 'Admin' : 'Usuario'}</span></p>
            <p class="text-[11px]" style="color: var(--text-muted);">${summary(u)}</p>
          </div>
          <div class="flex gap-1.5">
            <button data-action="edit" class="btn-glass px-2.5 py-1.5 rounded-lg text-xs font-semibold">Editar</button>
            <button data-action="delete" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold" style="background: var(--danger-bg); color: var(--danger);">Eliminar</button>
          </div>
        </div>
        <div data-editor class="hidden space-y-2 pt-2" style="border-top: 1px solid var(--border-color);">
          <select data-role class="input-field w-full px-3 py-2 text-xs">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Usuario</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
          <div data-perms class="space-y-2">${permsGrid(u.user_id, u.role, u.perms)}</div>
          <input data-pass type="password" minlength="8" class="input-field w-full px-3 py-2 text-xs" placeholder="Nueva contraseña (opcional)">
          <button data-action="save" class="btn-primary w-full py-2 rounded-lg text-xs font-bold">Guardar cambios</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-user]').forEach((card) => {
      const id = card.dataset.user;
      const user = users.find((x) => x.user_id === id);
      const editor = card.querySelector('[data-editor]');
      card.querySelector('[data-action="edit"]').addEventListener('click', () => editor.classList.toggle('hidden'));
      card.querySelector('[data-role]').addEventListener('change', (e) => {
        card.querySelector('[data-perms]').innerHTML = permsGrid(id, e.target.value, readPerms(card, id));
      });
      card.querySelector('[data-action="save"]').addEventListener('click', async () => {
        try {
          const password = card.querySelector('[data-pass]').value;
          await api('/api/users', 'PATCH', {
            userId: id,
            role: card.querySelector('[data-role]').value,
            perms: readPerms(card, id),
            ...(password ? { password } : {})
          });
          showToast('Cuenta actualizada', 'success');
          renderList(root);
        } catch (e) { showToast(e.message, 'error'); }
      });
      card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`¿Eliminar la cuenta "${user.username}"? Esta acción no se puede deshacer.`)) return;
        try {
          await api('/api/users', 'DELETE', { userId: id });
          showToast('Cuenta eliminada', 'success');
          renderList(root);
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="text-xs" style="color: var(--danger);">${e.message}</p>`;
  }
}

export function initUsersAdmin() {
  const root = document.getElementById('user-admin-section');
  if (!root || !isAdmin()) return;
  root.classList.remove('hidden');
  root.innerHTML = shell();
  if (!root.dataset.segBound) {
    root.dataset.segBound = '1';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (!b || b.disabled) return;
      const seg = b.parentElement;
      seg.dataset.value = b.dataset.level;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    });
  }

  const roleSel = root.querySelector('#new-role');
  roleSel.addEventListener('change', () => {
    root.querySelector('#new-perms').innerHTML = permsGrid('new', roleSel.value, readPerms(root, 'new'));
  });

  const form = root.querySelector('#create-user-form');
  const errorEl = root.querySelector('#create-user-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    const username = root.querySelector('#new-username').value.trim();
    try {
      await api('/api/create-user', 'POST', {
        username,
        password: root.querySelector('#new-password').value,
        role: roleSel.value,
        perms: readPerms(root, 'new'),
        ...(isSuperadmin() ? { tenant: getActiveTenant() } : {})
      });
      showToast(`Cuenta "${username}" creada`, 'success');
      form.reset();
      root.querySelector('#new-perms').innerHTML = permsGrid('new', 'user', { products: 'view', clients: 'view', quotes: 'edit' });
      renderList(root);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });
  renderList(root);
}
