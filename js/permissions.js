/**
 * JocoAdmin - Role & per-tab permission checks (UI side).
 * Real enforcement lives in the database (RLS, see supabase/migrations/0004_roles.sql);
 * this module only decides what to show and blocks writes early with a clear message.
 */
import { supabase, isSupabaseConfigured } from './supabase-client.js';

export const TABS = ['dashboard', 'products', 'quotes', 'clients', 'sales', 'portfolio'];
export const TAB_LABELS = {
  dashboard: 'Panel',
  products: 'Productos',
  quotes: 'Cotizaciones',
  clients: 'Clientes',
  sales: 'Ventas y Abonos',
  portfolio: 'Cartera'
};

// Which tab governs each stored collection.
const COLLECTION_TAB = { products: 'products', clients: 'clients', sales: 'sales', payments: 'sales', quotes: 'quotes' };

// Elements hidden when the tab is view-only (matched by their inline onclick).
const WRITE_SELECTORS = {
  products: ['window.productsModule.openModal', 'window.productsModule.editProduct', 'window.productsModule.deleteProduct'],
  clients: ['window.clientsModule.openModal', 'window.clientsModule.deleteClient'],
  sales: ['window.salesModule.openSaleModal', 'window.salesModule.openPaymentModal', 'window.salesModule.openPaymentForSale', 'window.salesModule.openEditSale', 'window.salesModule.openEditPayment'],
  quotes: ['window.quotesModule.openModal', 'window.quotesModule.removeItem', 'window.quotesModule.deleteQuote'],
  dashboard: ["'new-sale'", "'new-payment'"]
};

let profile = { role: 'admin', perms: {} }; // local mode (no Supabase) = full access
let loaded = !isSupabaseConfigured;

let sellers = [];

// Business spaces ("tenants"). Each account belongs to one; a superadmin belongs
// to none and picks which one to work in (remembered on this device).
const ACTIVE_TENANT_KEY = 'op_active_tenant';
let tenants = [];
let activeTenant = null;

export async function loadProfile(userId) {
  if (!isSupabaseConfigured || !supabase) return profile;
  const { data } = await supabase.from('profiles').select('role, perms, username, tenant').eq('user_id', userId).maybeSingle();
  profile = data || { role: 'none', perms: {} };
  loaded = true;

  const { data: tenantRows } = await supabase.from('tenants').select('id, name, theme').order('name');
  tenants = tenantRows || [];
  if (profile.role === 'superadmin') {
    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_TENANT_KEY); } catch {}
    activeTenant = tenants.some((t) => t.id === saved) ? saved : tenants[0]?.id || null;
  } else {
    activeTenant = profile.tenant || null;
  }

  // Admins can read their space's profiles: use them as the list of possible sellers.
  if (isAdmin()) {
    let q = supabase.from('profiles').select('username').order('username');
    if (activeTenant) q = q.eq('tenant', activeTenant);
    const { data: all } = await q;
    sellers = (all || []).map((p) => p.username);
  } else if (profile.username) {
    sellers = [profile.username];
  }
  return profile;
}

export const getMyUsername = () => profile.username || null;
export const getSellers = () => sellers;

export const isSuperadmin = () => profile.role === 'superadmin';
export const isAdmin = () => profile.role === 'admin' || profile.role === 'superadmin';
// Without a space there is no data to show (e.g. an account created before spaces existed).
export const hasAnyAccess = () => !loaded || ((!isSupabaseConfigured || !!activeTenant) && (isAdmin() || TABS.some((t) => level(t) !== 'none')));

export const getTenants = () => tenants;
export const getActiveTenant = () => activeTenant;
export const getActiveTenantInfo = () => tenants.find((t) => t.id === activeTenant) || null;

// Superadmin only: switch space. Reloads so every view and the local cache restart
// clean; the boot loader (in the target space's colors) covers the transition.
export function setActiveTenant(id) {
  const target = tenants.find((t) => t.id === id);
  if (!isSuperadmin() || !target) return;
  const html = document.documentElement;
  try {
    localStorage.setItem(ACTIVE_TENANT_KEY, id);
    localStorage.setItem('op_tenant_theme', target.theme || 'green');
    sessionStorage.setItem('op_boot_msg', `Cambiando a ${target.name}…`);
  } catch {}
  const text = document.getElementById('boot-loader-text');
  if (text) text.textContent = `Cambiando a ${target.name}…`;
  html.dataset.tenantTheme = target.theme || 'green';
  html.classList.add('restoring-session');
  document.getElementById('account-modal')?.classList.add('hidden');
  setTimeout(() => window.location.reload(), 450);
}

export function level(tab) {
  if (!loaded || isAdmin()) return 'edit';
  return profile.perms?.[tab] || 'none';
}

// 'today' (Cobros de hoy) is not a permission of its own: anyone who can see the panel, cartera or ventas can see it.
export const canView = (tab) => tab === 'today' ? ['dashboard', 'portfolio', 'sales'].some((t) => level(t) !== 'none') : level(tab) !== 'none';
export const canEdit = (tab) => level(tab) === 'edit';
export const canEditCollection = (collection) => canEdit(COLLECTION_TAB[collection] || collection);

export function firstAllowedTab() {
  return TABS.find(canView) || null;
}

// Hide write-only controls for tabs the user can only view.
export function applyReadOnlyUI(container, tab) {
  const selectors = [];
  if (!canEdit(tab)) selectors.push(...(WRITE_SELECTORS[tab] || []));
  // Converting a quote into a sale requires sales edit rights.
  if (tab === 'quotes' && !canEdit('sales')) selectors.push('window.quotesModule.convertToSale');
  if (tab === 'dashboard') {
    if (!canEdit('sales')) selectors.push("'new-sale'", "'new-payment'");
  }
  if (!selectors.length || !container) return;
  container.querySelectorAll('[onclick]').forEach((el) => {
    const code = el.getAttribute('onclick');
    if (selectors.some((s) => code.includes(s))) el.style.display = 'none';
  });
}
