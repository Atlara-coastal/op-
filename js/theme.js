/**
 * JocoAdmin - Theme Manager (Light / Dark)
 */

const THEME_KEY = 'crediventas_theme';

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) { /* localStorage unavailable */ }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const color = theme === 'dark' ? '#000000' : '#ffffff';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
  updateToggleIcon(theme);
  syncNativeStatusBar(theme, color);
}

// Keep the native Android/iOS status bar in sync with the in-app theme.
// window.Capacitor is only present when running inside the packaged app
// (injected by the native runtime), so this is a no-op in a normal browser.
function syncNativeStatusBar(theme, color) {
  const StatusBar = window.Capacitor?.Plugins?.StatusBar;
  if (!StatusBar) return;
  StatusBar.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
  StatusBar.setBackgroundColor({ color }).catch(() => {});
}

function updateToggleIcon(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const icon = btn.querySelector('[data-lucide]');
  if (icon) {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    if (window.lucide) window.lucide.createIcons();
  }
}

// Per-space branding (see tenants.theme in the database): accent palette via the
// data-tenant-theme attribute (styles.css), matching logo, and the space's name
// under the header brand.
const TENANT_LOGOS = { green: './icons/icon.svg', pink: './icons/icon-pink.svg' };

export function applyTenantTheme(tenant) {
  const theme = TENANT_LOGOS[tenant?.theme] ? tenant.theme : 'green';
  document.documentElement.dataset.tenantTheme = theme;
  document.querySelectorAll('[data-brand-logo]').forEach((img) => { img.src = TENANT_LOGOS[theme]; });
  const sub = document.getElementById('brand-subtitle');
  if (sub && tenant?.name) sub.textContent = tenant.name;
}

export function initTheme() {
  applyTheme(getPreferredTheme());
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      applyTheme(next);
    });
  }
}
