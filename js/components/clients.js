/**
 * JocoAdmin - Clients Component
 * Database of Clients, Classification (Tipo 1, 2, 3), Codebtor Selection,
 * CC Document Annex Storage & Interactive Expediente Viewer.
 */

import { db } from '../db.js';
import { formatCurrency, formatDate, getClientTypeBadgeHtml, showToast } from '../utils.js';
import { esc } from '../pdf-doc.js';

// What the client bought in a sale: one line per product with quantity and line total.
const saleItemsHtml = (s) => (s.items || []).length ? `
  <div class="mt-1.5 pt-1.5 space-y-0.5" style="border-top: 1px dashed var(--border-color);">
    ${s.items.map((it) => `
      <div class="flex items-center justify-between gap-3">
        <span class="truncate" style="color: var(--text-main);">${esc(it.productName || 'Producto')} <span style="color: var(--text-muted);">× ${it.quantity || 1}</span></span>
        <span class="font-mono shrink-0" style="color: var(--text-muted);">${formatCurrency(it.total ?? (parseFloat(it.finalUnitPrice) || 0) * (it.quantity || 1))}</span>
      </div>`).join('')}
  </div>` : '';

let editingClientId = null;
let currentViewingClientId = null;
let clientsView = (() => { try { return localStorage.getItem('clientsView') || 'list'; } catch { return 'list'; } })();

export function renderClients(container) {
  const clients = db.getCollection('clients');
  const sales = db.getCollection('sales');

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">

      <!-- Top Action Bar -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight" style="color: var(--text-main);">Base de Datos de Clientes & Documentación</h1>
          <p class="text-sm" style="color: var(--text-muted);">Administra expedientes, clasifica puntualidad (Tipo 1, 2, 3), asigna codeudores y anexa documentos CC.</p>
        </div>
        <button onclick="window.clientsModule.openModal()" class="btn-primary px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2">
          <i data-lucide="user-plus" class="w-4.5 h-4.5"></i> Registrar Cliente
        </button>
      </div>

      <!-- Search & Filters -->
      <div class="glass-panel p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="relative w-full sm:w-80">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3" style="color: var(--text-muted);"></i>
          <input type="text" id="search-clients" placeholder="Buscar por nombre, CC, correo o lugar..." class="input-field w-full pl-9 pr-4 py-2 text-sm">
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto">
          <div class="inline-flex items-center gap-1 p-1 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <button id="cview-list" type="button" onclick="window.clientsModule.setView('list')" title="Ver como listado" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="list" class="w-3.5 h-3.5"></i> Listado</button>
            <button id="cview-cards" type="button" onclick="window.clientsModule.setView('cards')" title="Ver como tarjetas" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="layout-grid" class="w-3.5 h-3.5"></i> Tarjetas</button>
          </div>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <label class="text-xs font-semibold whitespace-nowrap" style="color: var(--text-muted);">Filtrar por Calidad:</label>          <select id="filter-client-type" onchange="window.clientsModule.filterClients()" class="input-field px-3 py-1.5 text-xs">
            <option value="all">Todos los Tipos</option>
            <option value="tipo-1">Frecuente / Excelente</option>
            <option value="tipo-2">Primera Vez / Regular</option>
            <option value="tipo-3">Riesgoso / Mora</option>
          </select>
          <select id="filter-client-place" onchange="window.clientsModule.filterClients()" title="Filtrar por lugar" class="input-field px-3 py-1.5 text-xs">
            <option value="all">Todos los lugares</option>
          </select>
        </div>
      </div>

      <!-- Clients Cards Grid -->
      <div id="clients-cards-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Dynamically Populated -->
      </div>

    </div>

    <!-- Client Registration / Edit Modal -->
    <div id="client-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-xl p-6 space-y-5 animate-fade-in relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 id="modal-client-title" class="text-lg font-bold" style="color: var(--text-main);">Registrar Nuevo Cliente</h3>
          <button onclick="window.clientsModule.closeModal()" style="color: var(--text-muted);">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="client-form" onsubmit="window.clientsModule.saveClient(event)" class="space-y-4">

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Nombre Completo *</label>
              <input type="text" id="cli-fullname" required placeholder="Ej: Pedro Antonio Pérez" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Cédula de Ciudadanía (CC)</label>
              <input type="text" id="cli-cc" placeholder="Ej: 1098765432" class="input-field w-full px-3 py-2 text-sm">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Correo Electrónico</label>
              <input type="email" id="cli-email" placeholder="pedro@email.com" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Teléfono Móvil</label>
              <input type="text" id="cli-phone" placeholder="3101234567" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Edad</label>
              <input type="number" id="cli-age" min="18" max="100" placeholder="30" class="input-field w-full px-3 py-2 text-sm">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Dirección de Residencia</label>
              <input type="text" id="cli-address" placeholder="Calle 100 #15-20" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Lugar (zona / municipio)</label>
              <input type="text" id="cli-place" list="cli-place-list" autocomplete="off" placeholder="Ej: Barranquilla" class="input-field w-full px-3 py-2 text-sm">
              <datalist id="cli-place-list"></datalist>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Próxima fecha de pago acordada</label>
              <input type="date" id="cli-next-pay" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Abono prometido</label>
              <input type="number" id="cli-promised" min="0" step="any" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Nota</label>
              <input type="text" id="cli-note" class="input-field w-full px-3 py-2 text-sm">
            </div>
          </div>

          <!-- Client Classification (Tipo 1, 2, 3) -->
          <div class="p-4 rounded-xl space-y-2" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <label class="block text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">Clasificación / Calidad del Cliente *</label>
            <select id="cli-type" required class="input-field w-full px-3 py-2 text-sm">
              <option value="tipo-1">🟢 Frecuente / Excelente</option>
              <option value="tipo-2">⚪ Primera Vez / Regular</option>
              <option value="tipo-3">🔴 Riesgoso / Mora</option>
            </select>
            <p class="text-[11px]" style="color: var(--text-muted);">Esta categoría te permite filtrar cartera e identificar el nivel de riesgo crediticio.</p>
          </div>

          <!-- Codebtor Selection -->
          <div class="p-4 rounded-xl space-y-2" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <label class="block text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">Codeudor Asignado</label>
            <select id="cli-codebtor" class="input-field w-full px-3 py-2 text-sm">
              <option value="">Sin Codeudor (Cliente Antiguo / Confiable)</option>
              ${clients.map(c => `<option value="${c.id}">${c.fullName} (CC: ${c.cc || '—'})</option>`).join('')}
            </select>
          </div>

          <!-- CC Document Annex Upload -->
          <div class="p-4 rounded-xl space-y-2" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <label class="block text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">Anexo de Documento Cédula (CC)</label>
            <input type="file" id="cli-doc-file" accept="image/*,application/pdf" class="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--primary)] file:text-[var(--text-on-primary)] hover:file:bg-[var(--primary-container)] cursor-pointer" style="color: var(--text-muted);">
            <p class="text-[11px]" style="color: var(--text-muted);">Al subirlo, el documento se guardará automáticamente con el nombre completo del cliente.</p>
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" onclick="window.clientsModule.closeModal()" class="btn-glass px-4 py-2 rounded-xl text-sm">Cancelar</button>
            <button type="submit" class="btn-primary px-5 py-2 rounded-xl text-sm font-semibold">Guardar Cliente</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Client Expediente Detail Modal -->
    <div id="expediente-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-3xl p-6 space-y-5 animate-fade-in relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg" style="background: var(--success-bg); border: 1px solid var(--success); color: var(--success);">
              <i data-lucide="user-check" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 id="exp-client-name" class="text-lg font-bold leading-tight" style="color: var(--text-main);">Expediente del Cliente</h3>
              <p id="exp-client-cc" class="text-xs font-mono" style="color: var(--text-muted);">CC: -</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <button id="exp-payments-btn" type="button" title="Enviar resumen de todos los abonos del cliente" class="btn-glass px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <i data-lucide="wallet" class="w-4 h-4"></i> Resumen de abonos
            </button>
            <button id="exp-statement-btn" type="button" title="Enviar estado de cuenta con todas sus ventas activas" class="btn-primary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <i data-lucide="receipt-text" class="w-4 h-4"></i> Estado de cuenta
            </button>
            <button onclick="document.getElementById('expediente-modal').classList.add('hidden')" style="color: var(--text-muted);">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <div id="expediente-body-content" class="space-y-6">
          <!-- Dynamically Rendered -->
        </div>
      </div>
    </div>
  `;

  renderCards();

  const searchInput = document.getElementById('search-clients');
  if (searchInput) {
    searchInput.addEventListener('input', () => window.clientsModule.filterClients());
  }

  if (window.lucide) window.lucide.createIcons();
}

// "Lugar" is a free-text classification (where the client is from). The filter and the
// form's suggestions are rebuilt from the places already in use.
const placesOf = (clients) => [...new Set(clients.map((c) => (c.place || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

function syncPlaceOptions(clients) {
  const places = placesOf(clients);
  const sel = document.getElementById('filter-client-place');
  if (sel) {
    const wanted = ['all', '__none__', ...places];
    if (wanted.join('|') !== [...sel.options].map((o) => o.value).join('|')) {
      const current = sel.value;
      sel.innerHTML = `<option value="all">Todos los lugares</option><option value="__none__">Sin lugar</option>${places.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}`;
      sel.value = wanted.includes(current) ? current : 'all';
    }
  }
  const list = document.getElementById('cli-place-list');
  if (list) list.innerHTML = places.map((p) => `<option value="${esc(p)}">`).join('');
}

function renderCards() {
  const container = document.getElementById('clients-cards-grid');
  if (!container) return;

  const clients = db.getCollection('clients');
  const sales = db.getCollection('sales');
  syncPlaceOptions(clients);

  const search = document.getElementById('search-clients')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('filter-client-type')?.value || 'all';
  const placeFilter = document.getElementById('filter-client-place')?.value || 'all';

  const filtered = clients.filter(c => {
    const matchesSearch = c.fullName.toLowerCase().includes(search) ||
                          (c.cc || '').includes(search) ||
                          (c.email && c.email.toLowerCase().includes(search)) ||
                          (c.place || '').toLowerCase().includes(search);
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    const matchesPlace = placeFilter === 'all' || (placeFilter === '__none__' ? !(c.place || '').trim() : (c.place || '').trim() === placeFilter);
    return matchesSearch && matchesType && matchesPlace;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-panel p-12 text-center col-span-full" style="color: var(--text-muted);">
        <i data-lucide="users-2" class="w-12 h-12 mx-auto mb-3" style="color: var(--primary); opacity: 0.5;"></i>
        <p class="font-medium text-base" style="color: var(--text-main);">No se encontraron clientes</p>
        <p class="text-xs mt-1" style="color: var(--text-muted);">Registra nuevos clientes para habilitar ventas a crédito.</p>
      </div>
    `;
    return;
  }

  const metrics = (c) => {
    const cs = sales.filter(s => s.clientId === c.id);
    return {
      purchases: cs.reduce((a, s) => a + (parseFloat(s.totalAmount) || 0), 0),
      debt: cs.reduce((a, s) => a + (parseFloat(s.outstandingBalance) || 0), 0)
    };
  };

  container.className = clientsView === 'list' ? '' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
  ['list', 'cards'].forEach((v) => {
    const b = document.getElementById('cview-' + v);
    if (!b) return;
    b.style.background = v === clientsView ? 'var(--primary-gradient)' : '';
    b.style.color = v === clientsView ? 'var(--text-on-primary)' : 'var(--text-muted)';
  });

  if (clientsView === 'list') {
    container.innerHTML = `
      <div class="glass-panel overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm" style="color: var(--text-muted);">
            <thead class="text-xs font-semibold uppercase" style="background: var(--bg-card-hover); border-bottom: 1px solid var(--border-color);">
              <tr>
                <th class="px-4 py-3">Cliente</th>
                <th class="px-4 py-3">Calidad</th>
                <th class="px-4 py-3">Teléfono</th>
                <th class="px-4 py-3">Lugar</th>
                <th class="px-4 py-3">Dirección</th>
                <th class="px-4 py-3 text-right">Total compras</th>
                <th class="px-4 py-3 text-right">Deuda actual</th>
                <th class="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y" style="border-color: var(--border-color);">
              ${filtered.map(c => {
                const m = metrics(c);
                return `
                <tr class="transition-colors hover:bg-[var(--bg-card-hover)]">
                  <td class="px-4 py-3"><div class="font-bold" style="color: var(--text-main);">${c.fullName}</div><div class="text-[11px] font-mono">CC: ${c.cc || '—'}</div></td>
                  <td class="px-4 py-3">${getClientTypeBadgeHtml(c.type)}</td>
                  <td class="px-4 py-3 whitespace-nowrap">${c.phone || '—'}</td>
                  <td class="px-4 py-3 text-xs whitespace-nowrap">${c.place ? `<span class="px-2 py-0.5 rounded-full font-semibold" style="background: var(--primary-container); color: var(--primary);">${esc(c.place)}</span>` : '—'}</td>
                  <td class="px-4 py-3 text-xs max-w-[11rem] truncate">${c.address || '—'}</td>
                  <td class="px-4 py-3 text-right font-mono" style="color: var(--text-main);">${formatCurrency(m.purchases)}</td>
                  <td class="px-4 py-3 text-right font-mono font-bold" style="color: ${m.debt > 0 ? 'var(--warning)' : 'var(--success)'};">${formatCurrency(m.debt)}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-center gap-1.5">
                      <button onclick="window.clientsModule.openExpediente('${c.id}')" title="Ver expediente" class="btn-primary px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"><i data-lucide="folder-open" class="w-3.5 h-3.5"></i> Expediente</button>
                      <button onclick="window.clientsModule.openModal('${c.id}')" title="Editar" class="btn-glass p-1.5 rounded-lg"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
                      <button onclick="window.clientsModule.deleteClient('${c.id}')" title="Eliminar" class="p-1.5 rounded-lg" style="background: var(--danger-bg); color: var(--danger);"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(c => {    // Client financial metrics
    const clientSales = sales.filter(s => s.clientId === c.id);
    const totalPurchases = clientSales.reduce((acc, s) => acc + (parseFloat(s.totalAmount) || 0), 0);
    const totalPaid = clientSales.reduce((acc, s) => acc + (parseFloat(s.totalPaid) || 0), 0);
    const totalDebt = clientSales.reduce((acc, s) => acc + (parseFloat(s.outstandingBalance) || 0), 0);

    return `
      <div class="glass-panel p-5 space-y-4 flex flex-col justify-between transition-all">
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-2 pb-3" style="border-bottom: 1px solid var(--border-color);">
            <div>
              <h3 class="font-bold text-base leading-snug" style="color: var(--text-main);">${c.fullName}</h3>
              <p class="text-xs font-mono" style="color: var(--text-muted);">CC: ${c.cc || '—'}</p>
            </div>
            <div>
              ${getClientTypeBadgeHtml(c.type)}
            </div>
          </div>

          <div class="space-y-1.5 text-xs" style="color: var(--text-muted);">
            <div class="flex items-center gap-2">
              <i data-lucide="phone" class="w-3.5 h-3.5" style="color: var(--text-muted);"></i> ${c.phone || 'Sin teléfono'}
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="map-pin" class="w-3.5 h-3.5" style="color: var(--text-muted);"></i> ${c.address || 'Sin dirección'}
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="map" class="w-3.5 h-3.5" style="color: var(--text-muted);"></i> Lugar: <strong style="color: var(--text-main);">${c.place ? esc(c.place) : 'Sin lugar'}</strong>
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="shield" class="w-3.5 h-3.5" style="color: var(--text-muted);"></i> Codeudor: <strong style="color: var(--text-main);">${c.codebtorName || 'Sin Codeudor'}</strong>
            </div>
          </div>

          <!-- Financial summary badge -->
          <div class="p-3 rounded-xl grid grid-cols-2 gap-2 text-xs" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <div>
              <span class="block" style="color: var(--text-muted);">Total Compras:</span>
              <strong style="color: var(--text-main);">${formatCurrency(totalPurchases)}</strong>
            </div>
            <div>
              <span class="block" style="color: var(--text-muted);">Deuda Actual:</span>
              <strong class="font-bold" style="color: ${totalDebt > 0 ? 'var(--warning)' : 'var(--success)'};">${formatCurrency(totalDebt)}</strong>
            </div>
          </div>
        </div>

        <div class="pt-3 flex items-center justify-between gap-2" style="border-top: 1px solid var(--border-color);">
          <button onclick="window.clientsModule.openExpediente('${c.id}')" class="btn-primary flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5">
            <i data-lucide="folder-open" class="w-3.5 h-3.5"></i> Ver Expediente
          </button>
          <button onclick="window.clientsModule.openModal('${c.id}')" class="btn-glass p-2 rounded-xl">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="window.clientsModule.deleteClient('${c.id}')" class="p-2 rounded-xl" style="background: var(--danger-bg); color: var(--danger);">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

window.clientsModule = {
  setView(view) {
    clientsView = view;
    try { localStorage.setItem('clientsView', view); } catch {}
    renderCards();
  },

  openModal(clientId = null) {
    editingClientId = clientId;
    const modal = document.getElementById('client-modal');
    const form = document.getElementById('client-form');
    const title = document.getElementById('modal-client-title');

    form.reset();

    if (clientId) {
      title.innerText = 'Editar Datos de Cliente';
      const clients = db.getCollection('clients');
      const c = clients.find(item => item.id === clientId);
      if (c) {
        document.getElementById('cli-fullname').value = c.fullName || '';
        document.getElementById('cli-cc').value = c.cc || '';
        document.getElementById('cli-next-pay').value = c.nextPaymentDate || '';
        document.getElementById('cli-promised').value = c.promisedAmount || '';
        document.getElementById('cli-note').value = c.sheetNote || '';
        document.getElementById('cli-email').value = c.email || '';
        document.getElementById('cli-phone').value = c.phone || '';
        document.getElementById('cli-age').value = c.age || '';
        document.getElementById('cli-address').value = c.address || '';
        document.getElementById('cli-place').value = c.place || '';
        document.getElementById('cli-type').value = c.type || 'tipo-1';
        document.getElementById('cli-codebtor').value = c.codebtorId || '';
      }
    } else {
      title.innerText = 'Registrar Nuevo Cliente';
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  closeModal() {
    document.getElementById('client-modal').classList.add('hidden');
    editingClientId = null;
  },

  filterClients() {
    renderCards();
  },

  async saveClient(e) {
    e.preventDefault();
    const fullName = document.getElementById('cli-fullname').value.trim();
    const cc = document.getElementById('cli-cc').value.trim();
    const email = document.getElementById('cli-email').value.trim();
    const phone = document.getElementById('cli-phone').value.trim();
    const age = parseInt(document.getElementById('cli-age').value) || null;
    const address = document.getElementById('cli-address').value.trim();
    // Reuse the spelling of a place that already exists ("barranquilla" → "Barranquilla")
    // so the same place never splits into two filter entries.
    const typedPlace = document.getElementById('cli-place').value.trim().replace(/\s+/g, ' ');
    const place = placesOf(db.getCollection('clients')).find((p) => p.toLowerCase() === typedPlace.toLowerCase()) || typedPlace || null;
    const type = document.getElementById('cli-type').value;
    const codebtorId = document.getElementById('cli-codebtor').value || null;
    const nextPaymentDate = document.getElementById('cli-next-pay').value || null;
    const promisedAmount = parseFloat(document.getElementById('cli-promised').value) || null;
    const sheetNote = document.getElementById('cli-note').value.trim() || null;

    let codebtorName = 'Sin Codeudor (Cliente Antiguo/Confiable)';
    if (codebtorId) {
      const allClients = db.getCollection('clients');
      const foundCodebtor = allClients.find(c => c.id === codebtorId);
      if (foundCodebtor) {
        codebtorName = `${foundCodebtor.fullName} (CC: ${foundCodebtor.cc})`;
      }
    }

    let savedClientId = editingClientId;

    if (editingClientId) {
      db.updateItem('clients', editingClientId, {
        fullName, cc, email, phone, age, address, place, type, codebtorId, codebtorName, nextPaymentDate, promisedAmount, sheetNote
      });
      showToast('Cliente actualizado correctamente', 'success');
    } else {
      savedClientId = 'cli-' + Date.now();
      const newClient = {
        id: savedClientId,
        fullName, cc, email, phone, age, address, place, type, codebtorId, codebtorName, nextPaymentDate, promisedAmount, sheetNote,
        createdAt: new Date().toISOString()
      };
      db.addItem('clients', newClient);
      showToast('Cliente registrado con éxito', 'success');
    }

    // Save CC Document if file was chosen
    const fileInput = document.getElementById('cli-doc-file');
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      try {
        await db.saveDocument(savedClientId, fullName, file, file.name);
        showToast(`Documento CC guardado como CC_${fullName.replace(/\s+/g, '_')}`, 'info');
      } catch (err) {
        console.error('Error saving CC document:', err);
      }
    }

    this.closeModal();
    renderCards();
  },

  async openExpediente(clientId) {
    currentViewingClientId = clientId;
    const clients = db.getCollection('clients');
    const sales = db.getCollection('sales');
    const payments = db.getCollection('payments');

    const c = clients.find(item => item.id === clientId);
    if (!c) return;

    document.getElementById('exp-client-name').innerText = c.fullName;
    const statementBtn = document.getElementById('exp-statement-btn');
    if (statementBtn) statementBtn.onclick = () => window.reminderModule?.openStatement(clientId);
    const paymentsBtn = document.getElementById('exp-payments-btn');
    if (paymentsBtn) paymentsBtn.onclick = () => window.reminderModule?.openPaymentsSummary(clientId);
    document.getElementById('exp-client-cc').innerText = `CC: ${c.cc || '—'} • Edad: ${c.age || '-'} años`;

    const clientSales = sales.filter(s => s.clientId === clientId);
    const clientPayments = payments.filter(p => p.clientId === clientId);

    const docs = await db.getClientDocuments(clientId);

    const body = document.getElementById('expediente-body-content');
    body.innerHTML = `
      <!-- Client Profile Overview Card -->
      <div class="p-5 rounded-2xl space-y-4" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <div>
            <span class="text-xs font-semibold block" style="color: var(--text-muted);">Clasificación del Cliente:</span>
            <div class="mt-1">${getClientTypeBadgeHtml(c.type)}</div>
          </div>
          <div class="text-right">
            <span class="text-xs font-semibold block" style="color: var(--text-muted);">Fecha Registro:</span>
            <span class="text-xs" style="color: var(--text-main);">${formatDate(c.createdAt)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs" style="color: var(--text-muted);">
          <div><strong style="color: var(--text-main);">Correo:</strong> ${c.email || 'No registrado'}</div>
          <div><strong style="color: var(--text-main);">Teléfono:</strong> ${c.phone || 'No registrado'}</div>
          <div><strong style="color: var(--text-main);">Dirección:</strong> ${c.address || 'No registrada'}</div>
          <div><strong style="color: var(--text-main);">Lugar:</strong> ${c.place ? esc(c.place) : 'No registrado'}</div>
          <div><strong style="color: var(--text-main);">Codeudor:</strong> ${c.codebtorName}</div>
        </div>
      </div>

      <!-- CC Attached Documents Section -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-bold flex items-center gap-2" style="color: var(--text-main);">
            <i data-lucide="file-text" class="w-4 h-4" style="color: var(--primary);"></i> Documentos Adjuntos (CC Cédula)
          </h4>
        </div>

        ${docs.length === 0 ? `
          <div class="p-4 rounded-xl text-center text-xs" style="background: var(--bg-card-hover); border: 1px solid var(--border-color); color: var(--text-muted);">
            No hay documentos de CC adjuntos para este cliente.
          </div>
        ` : docs.map(doc => {
          const fileUrl = URL.createObjectURL(doc.fileBlob);
          const isImage = doc.fileType.startsWith('image/');
          return `
            <div class="p-4 rounded-xl space-y-3" style="background: var(--bg-card-hover); border: 1px solid var(--primary);">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <i data-lucide="paperclip" class="w-4 h-4" style="color: var(--primary);"></i>
                  <span class="font-mono text-xs font-bold" style="color: var(--primary);">${doc.formattedName}</span>
                </div>
                <a href="${fileUrl}" download="${doc.formattedName}" class="btn-primary px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar
                </a>
              </div>

              <!-- Viewer Preview -->
              ${isImage ? `
                <div class="rounded-xl overflow-hidden max-h-60 flex justify-center" style="border: 1px solid var(--border-color); background: rgba(0,0,0,0.4);">
                  <img src="${fileUrl}" alt="CC Document" class="object-contain max-h-60">
                </div>
              ` : `
                <div class="p-3 rounded-xl text-xs flex items-center gap-2" style="background: var(--bg-card-hover); border: 1px solid var(--border-color); color: var(--text-muted);">
                  <i data-lucide="file-check" class="w-5 h-5" style="color: var(--success);"></i> Documento PDF adjunto disponible para descargar.
                </div>
              `}
            </div>
          `;
        }).join('')}
      </div>

      <!-- Sales & Payment History -->
      <div class="space-y-3">
        <h4 class="text-sm font-bold flex items-center gap-2" style="color: var(--text-main);">
          <i data-lucide="history" class="w-4 h-4" style="color: var(--primary);"></i> Historial de Créditos y Compras (${clientSales.length})
        </h4>

        <div class="space-y-2">
          ${clientSales.length === 0 ? `
            <p class="text-xs italic" style="color: var(--text-muted);">Este cliente no tiene créditos ni ventas registradas aún.</p>
          ` : clientSales.map(s => `
            <div class="p-3 rounded-xl flex items-start justify-between gap-2 text-xs" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
              <div class="min-w-0 flex-1">
                <span class="font-mono font-bold" style="color: var(--primary);">${s.saleNumber}</span> &bull;
                <span style="color: var(--text-muted);">${formatDate(s.startDate)}</span>
                <p style="color: var(--text-muted);">Total: <strong style="color: var(--text-main);">${formatCurrency(s.totalAmount)}</strong> &bull; Abonado: <strong style="color: var(--success);">${formatCurrency(s.totalPaid)}</strong></p>
                ${saleItemsHtml(s)}
              </div>
              <div class="text-right shrink-0">
                <span class="text-xs block" style="color: var(--text-muted);">Saldo Restante:</span>
                <span class="font-bold font-mono text-sm" style="color: var(--warning);">${formatCurrency(s.outstandingBalance)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('expediente-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  deleteClient(clientId) {
    if (confirm('¿Deseas eliminar este cliente de la base de datos?')) {
      db.deleteItem('clients', clientId);
      showToast('Cliente eliminado', 'warning');
      renderCards();
    }
  }
};
