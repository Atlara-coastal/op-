/**
 * JocoAdmin - Main Application Controller
 * Handles Navigation, Tab Switcher, Global State & Backup Manager
 */

import { db } from './db.js';
import { renderDashboard } from './components/dashboard.js';
import { renderProducts } from './components/products.js';
import { renderQuotes } from './components/quotes.js';
import { renderClients } from './components/clients.js';
import { renderSales } from './components/sales.js';
import { renderPortfolio } from './components/portfolio.js';
import { renderToday } from './components/today.js';
import { showToast } from './utils.js';
import { initTheme } from './theme.js';
import { initAuth } from './auth.js';
import { animateTabIn } from './animations.js';
import { initPush } from './push.js';
import './reminder.js';
import './calculator.js';
import { initSelects } from './select-enhance.js';
import { initMobileUI } from './mobile-ui.js';
import { canView, canEdit, firstAllowedTab, applyReadOnlyUI, isAdmin } from './permissions.js';

class AppController {
  constructor() {
    this.currentTab = 'dashboard';
    this.mainContent = null;
  }

  init() {
    this.mainContent = document.getElementById('main-content');
    this.bindEvents();
    this.applyNavPermissions();

    // Opened from the daily notification (/?tab=today) → straight to the list.
    const requested = new URLSearchParams(location.search).get('tab');
    this.switchTab(requested && canView(requested) ? requested : (firstAllowedTab() || 'dashboard'));
    if (requested) history.replaceState(null, '', location.pathname);

    // App was already open when the notification was tapped.
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'open-tab' && canView(e.data.tab)) this.switchTab(e.data.tab);
    });
  }

  // Hide tabs the user can't see, and admin-only backup controls.
  applyNavPermissions() {
    document.querySelectorAll('[data-tab-target]').forEach((btn) => {
      btn.style.display = canView(btn.getAttribute('data-tab-target')) ? '' : 'none';
    });
    document.getElementById('acc-export')?.addEventListener('click', () => document.getElementById('export-backup-btn')?.click());
    document.getElementById('acc-import')?.addEventListener('click', () => document.getElementById('import-backup-input')?.click());
    if (!isAdmin()) {
      document.getElementById('mobile-backup')?.style.setProperty('display', 'none');
      document.getElementById('export-backup-btn')?.style.setProperty('display', 'none');
      document.getElementById('import-backup-input')?.closest('label')?.style.setProperty('display', 'none');
    }
  }

  bindEvents() {
    // Navigation tab click listeners
    const navButtons = document.querySelectorAll('[data-tab-target]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-tab-target');
        this.switchTab(target);
      });
    });

    // Logo: main panel if the user may see it, otherwise quotes (or their first allowed tab).
    const brand = document.getElementById('brand-home');
    if (brand) {
      const goHome = () => {
        const target = canView('dashboard') ? 'dashboard' : canView('quotes') ? 'quotes' : firstAllowedTab();
        if (target) this.switchTab(target);
        document.getElementById('mobile-menu')?.classList.add('hidden');
      };
      brand.addEventListener('click', goHome);
      brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });
    }

    // Mobile nav toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
      });
    }

    // Export Backup JSON
    const exportBtn = document.getElementById('export-backup-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const dataStr = db.exportDatabaseJSON();
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OP_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showToast('Copia de seguridad descargada en JSON', 'success');
      });
    }

    // Import Backup JSON
    const importInput = document.getElementById('import-backup-input');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !isAdmin()) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const success = db.importDatabaseJSON(event.target.result);
          if (success) {
            showToast('Base de datos restaurada correctamente', 'success');
            this.switchTab(this.currentTab);
          } else {
            showToast('El archivo de copia de seguridad no es válido', 'error');
          }
        };
        reader.readAsText(file);
      });
    }
  }

  switchTab(tabName, actionParam = null, extraData = null) {
    if (!canView(tabName)) tabName = firstAllowedTab() || 'dashboard';
    if (actionParam && !canEdit('sales')) actionParam = null;
    this.currentTab = tabName;

    // Highlight nav item
    const navButtons = document.querySelectorAll('[data-tab-target]');
    navButtons.forEach(btn => {
      const target = btn.getAttribute('data-tab-target');
      btn.classList.toggle('nav-btn-active', target === tabName);
      btn.classList.toggle('nav-btn-inactive', target !== tabName);
    });

    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) mobileMenu.classList.add('hidden');

    // Render corresponding view
    switch (tabName) {
      case 'dashboard':
        renderDashboard(this.mainContent);
        break;
      case 'products':
        renderProducts(this.mainContent);
        break;
      case 'quotes':
        renderQuotes(this.mainContent);
        break;
      case 'clients':
        renderClients(this.mainContent);
        break;
      case 'sales':
        renderSales(this.mainContent);
        if (actionParam === 'new-sale') {
          window.salesModule.openSaleModal();
        } else if (actionParam === 'new-payment') {
          window.salesModule.openPaymentModal();
        } else if (actionParam === 'from-quote' && extraData) {
          window.salesModule.openSaleModal(extraData);
        }
        break;
      case 'portfolio':
        renderPortfolio(this.mainContent);
        break;
      case 'today':
        renderToday(this.mainContent);
        break;
      default:
        renderDashboard(this.mainContent);
    }

    applyReadOnlyUI(this.mainContent, tabName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (window.lucide) window.lucide.createIcons();
    animateTabIn(this.mainContent);
  }
}

function updateSyncBadge(count) {
  const btn = document.getElementById('sync-status-btn');
  const label = document.getElementById('sync-status-count');
  if (!btn || !label) return;
  btn.classList.toggle('hidden', !count);
  label.textContent = count > 99 ? '99+' : String(count);
  btn.title = count === 1
    ? '1 cambio pendiente de sincronizar (se sube solo al recuperar conexión)'
    : `${count} cambios pendientes de sincronizar (se suben solos al recuperar conexión)`;
}

// Initialize application on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSelects();
  initMobileUI();

  // Tell Capgo the app booted fine (only present inside the native Android
  // shell) so it won't roll back to the previous bundle. Must be called on
  // every cold start, independent of login state.
  window.Capacitor?.Plugins?.CapacitorUpdater?.notifyAppReady().catch(() => {});

  initAuth(() => {
    window.app = new AppController();
    window.app.init();

    // Pull cloud data (if configured) and keep the active tab live-synced
    // across devices; re-render the current tab whenever remote data changes.
    db.connectCloud((collection) => {
      window.app.switchTab(window.app.currentTab);
    });

    db.onQueueChange = updateSyncBadge;
    updateSyncBadge(db.getPendingCount());
    document.getElementById('sync-status-btn')?.addEventListener('click', () => {
      showToast('Intentando subir los cambios pendientes…', 'info');
      db.flushPendingQueue();
    });

    initPush();
  });

  // Register Service Worker for Mobile PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrado correctamente:', reg.scope))
      .catch(err => console.warn('Fallo al registrar Service Worker:', err));
  }
});

