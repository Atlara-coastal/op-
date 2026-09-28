/**
 * JocoAdmin - Products Component
 * Product Catalog & Pricing Math Calculator (% Interest & % Extra Expenses on Cost)
 */

import { db } from '../db.js';
import { formatCurrency, calculateProductPricing, showToast } from '../utils.js';

let editingProductId = null;
let productsView = (() => { try { return localStorage.getItem('productsView') || 'cards'; } catch { return 'cards'; } })();
const NO_CATEGORY = '__none__';

export function renderProducts(container) {
  const products = db.getCollection('products');

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      
      <!-- Top Action Bar -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight" style="color: var(--text-main);">Catálogo de Productos y Calculadora de Precios</h1>
          <p class="text-sm" style="color: var(--text-muted);">Gestiona tus productos y calcula automáticamente el precio final con interés y gastos extras.</p>
        </div>
        <button onclick="window.productsModule.openModal()" class="btn-primary px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2">
          <i data-lucide="plus-circle" class="w-4.5 h-4.5"></i> Agregar Producto
        </button>
      </div>

      <!-- Pricing Formula Info Card -->
      <div class="glass-panel p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4" style="border-left: 4px solid var(--success);">
        <div class="flex items-start gap-3">
          <div class="p-2.5 rounded-xl shrink-0" style="background: var(--success-bg); color: var(--success);">
            <i data-lucide="calculator" class="w-5 h-5"></i>
          </div>
          <div class="space-y-1">
            <h4 class="text-sm font-bold" style="color: var(--text-main);">Fórmula de Costo Total Aplicado:</h4>
            <p class="text-xs font-mono" style="color: var(--text-muted);">
              Costo Total = Costo Base + (Costo &times; % Gastos Extras)
            </p>
          </div>
        </div>
        <div class="text-xs px-3 py-2 rounded-lg" style="color: var(--text-muted); background: var(--bg-card-hover); border: 1px solid var(--border-color);">
          * Esto es el costo total del producto, no el precio de venta. El precio final se calcula en la cotización sumando el % de Interés según el Tipo de Cliente.
        </div>
      </div>

      <!-- Products Grid / Table -->
      <div class="glass-panel overflow-hidden">
        <div class="p-4 flex items-center justify-between gap-4" style="border-bottom: 1px solid var(--border-color);">
          <div class="relative flex-1 max-w-xs">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3" style="color: var(--text-muted);"></i>
            <input type="text" id="search-products" placeholder="Buscar por código o nombre..." class="input-field w-full rounded-xl pl-9 pr-4 py-2 text-sm transition-all">
          </div>
          <select id="filter-product-category" onchange="window.productsModule.renderTable()" class="input-field rounded-xl px-3 py-1.5 text-xs">
            <option value="all">Todas las Categorías</option>
            ${[...new Set(products.map(p => p.category || NO_CATEGORY))].sort((a, b) => a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b)).map(c => `<option value="${c === NO_CATEGORY ? NO_CATEGORY : c}">${c === NO_CATEGORY ? 'Sin categoría' : c}</option>`).join('')}
          </select>
          <div class="flex items-center gap-3">
            <span class="text-xs hidden sm:inline" style="color: var(--text-muted);">${products.length} productos</span>
            <div class="inline-flex items-center gap-1 p-1 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
              <button id="pview-cards" type="button" onclick="window.productsModule.setView('cards')" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="layout-grid" class="w-3.5 h-3.5"></i> Tarjetas</button>
              <button id="pview-list" type="button" onclick="window.productsModule.setView('list')" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="list" class="w-3.5 h-3.5"></i> Listado</button>
            </div>
          </div>
        </div>

        <div id="products-cards-grid" class="hidden p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"></div>

        <div id="products-table-wrap" class="overflow-x-auto">
          <table class="w-full text-left text-sm" style="color: var(--text-muted);">
            <thead class="text-xs font-semibold uppercase" style="background: var(--bg-card-hover); color: var(--text-muted); border-bottom: 1px solid var(--border-color);">
              <tr>
                <th class="px-5 py-3.5">Código</th>
                <th class="px-5 py-3.5">Producto</th>
                <th class="px-5 py-3.5 text-right">Costo Base</th>
                <th class="px-5 py-3.5 text-center">% Gastos Extras</th>
                <th class="px-5 py-3.5 text-right font-bold" style="color: var(--success);">Costo Total</th>
                <th class="px-5 py-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody id="products-table-body" class="divide-y divide-[var(--border-color)]">
              <!-- Dynamically Populated -->
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- Product Form Modal -->
    <div id="product-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-lg p-6 space-y-5 animate-fade-in shadow-2xl relative">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 id="modal-product-title" class="text-lg font-bold" style="color: var(--text-main);">Nuevo Producto</h3>
          <button onclick="window.productsModule.closeModal()" class="hover:opacity-70 transition-opacity" style="color: var(--text-muted);">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="product-form" onsubmit="window.productsModule.saveProduct(event)" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Código / SKU</label>
              <input type="text" id="prod-code" required placeholder="Ej: PRD-005" class="input-field w-full rounded-xl px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Nombre del Producto</label>
              <input type="text" id="prod-name" required placeholder="Ej: Computador Portátil HP" class="input-field w-full rounded-xl px-3 py-2 text-sm">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Descripción corta</label>
              <input type="text" id="prod-desc" placeholder="Detalles o especificaciones principales..." class="input-field w-full rounded-xl px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Categoría</label>
              <input type="text" id="prod-category" list="prod-category-list" placeholder="Ej: Tecnología" class="input-field w-full rounded-xl px-3 py-2 text-sm">
              <datalist id="prod-category-list">${[...new Set(db.getCollection('products').map(p => p.category).filter(Boolean))].sort().map(c => `<option value="${c}">`).join('')}</datalist>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 p-3 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Costo Base ($)</label>
              <input type="number" id="prod-cost" required min="0" step="100" placeholder="100000" oninput="window.productsModule.calculatePreview()" class="input-field w-full rounded-xl px-3 py-2 text-sm font-mono">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">% Gastos Extras</label>
              <input type="number" id="prod-extra" required min="0" max="100" step="0.5" placeholder="5" oninput="window.productsModule.calculatePreview()" class="input-field w-full rounded-xl px-3 py-2 text-sm font-mono">
            </div>
          </div>

          <!-- Live Price Preview Card -->
          <div class="p-4 rounded-xl space-y-2" style="background: var(--success-bg); border: 1px solid var(--success);">
            <div class="text-xs font-semibold uppercase tracking-wide" style="color: var(--success);">Desglose Base:</div>
            <div class="grid grid-cols-1 gap-2 text-xs" style="color: var(--text-muted);">
              <div>+ Gastos Extras Monto: <strong id="preview-ext-val" style="color: var(--text-main);">$ 0</strong></div>
            </div>
            <div class="pt-2 flex items-center justify-between" style="border-top: 1px solid var(--success);">
              <span class="text-sm font-bold" style="color: var(--text-main);">Costo Total:</span>
              <span id="preview-final-price" class="text-xl font-extrabold" style="color: var(--success);">$ 0</span>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" onclick="window.productsModule.closeModal()" class="btn-glass px-4 py-2 rounded-xl text-sm font-medium">Cancelar</button>
            <button type="submit" class="btn-primary px-5 py-2 rounded-xl text-sm font-semibold">Guardar Producto</button>
          </div>
        </form>
      </div>
    </div>
  `;

  renderTable();

  // Attach search listener
  const searchInput = document.getElementById('search-products');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => renderTable(e.target.value));
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderTable(searchTerm = '') {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;
  const grid = document.getElementById('products-cards-grid');
  const wrap = document.getElementById('products-table-wrap');
  const asCards = productsView === 'cards';
  grid?.classList.toggle('hidden', !asCards);
  wrap?.classList.toggle('hidden', asCards);
  [['cards', 'pview-cards'], ['list', 'pview-list']].forEach(([v, id]) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.style.background = (v === 'cards') === asCards ? 'var(--primary-gradient)' : '';
    b.style.color = (v === 'cards') === asCards ? 'var(--text-on-primary)' : 'var(--text-muted)';
  });

  const products = db.getCollection('products');
  const categoryFilter = document.getElementById('filter-product-category')?.value || 'all';
  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const cat = p.category || NO_CATEGORY;
    const matchesCategory = categoryFilter === 'all' || cat === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const byCategory = new Map();
  filtered.forEach((p) => {
    const cat = p.category || 'Sin categoría';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(p);
  });
  const categoryGroups = [...byCategory.entries()].sort((a, b) => a[0] === 'Sin categoría' ? 1 : b[0] === 'Sin categoría' ? -1 : a[0].localeCompare(b[0]));

  if (asCards && grid) {
    const card = (p) => {
      const extVal = p.cost * (p.extraExpensesPercent / 100);
      return `
      <div class="p-4 rounded-2xl flex flex-col justify-between gap-4 transition-all" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
        <div class="space-y-2">
          <span class="font-mono text-[11px] font-semibold px-2 py-0.5 rounded inline-block" style="color: var(--primary); background: var(--primary-container);">${p.code}</span>
          <h3 class="font-bold text-sm leading-snug" style="color: var(--text-main);">${p.name}</h3>
          ${p.description && p.description !== `Categoría: ${p.category}` ? `<p class="text-xs line-clamp-2" style="color: var(--text-muted);">${p.description}</p>` : ''}
        </div>
        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div><span class="block" style="color: var(--text-muted);">Costo base</span><strong class="font-mono" style="color: var(--text-main);">${formatCurrency(p.cost)}</strong></div>
            <div><span class="block" style="color: var(--text-muted);">Gastos extras</span><strong style="color: var(--warning);">${p.extraExpensesPercent}% · ${formatCurrency(extVal)}</strong></div>
          </div>
          <div class="pt-2 flex items-center justify-between gap-2" style="border-top: 1px solid var(--border-color);">
            <div><span class="block text-[10px] uppercase font-semibold" style="color: var(--text-muted);">Costo total</span><strong class="text-base font-mono" style="color: var(--success);">${formatCurrency(p.cost + extVal)}</strong></div>
            <div class="flex items-center gap-1.5">
              <button onclick="window.productsModule.editProduct('${p.id}')" title="Editar" class="p-1.5 rounded-lg" style="background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-muted);"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
              <button onclick="window.productsModule.deleteProduct('${p.id}')" title="Eliminar" class="p-1.5 rounded-lg" style="background: var(--danger-bg); color: var(--danger);"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
          </div>
        </div>
      </div>`;
    };
    grid.innerHTML = filtered.length === 0
      ? '<div class="col-span-full text-center py-8" style="color: var(--text-muted);">No se encontraron productos registrados.</div>'
      : categoryGroups.map(([cat, items]) => `
        <div class="col-span-full flex items-center gap-2 pt-2 first:pt-0">
          <h4 class="text-xs font-bold uppercase tracking-wide" style="color: var(--primary);">${cat}</h4>
          <span class="text-[11px]" style="color: var(--text-muted);">(${items.length})</span>
          <div class="flex-1 h-px" style="background: var(--border-color);"></div>
        </div>
        ${items.map(card).join('')}
      `).join('');
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-8" style="color: var(--text-muted);">
          No se encontraron productos registrados.
        </td>
      </tr>
    `;
    return;
  }

  const row = (p) => {
    const extVal = (p.cost * (p.extraExpensesPercent / 100));
    const basePrice = p.cost + extVal;
    return `
      <tr class="transition-colors hover:bg-[var(--bg-card-hover)]">
        <td class="px-5 py-4 font-mono text-xs font-semibold" style="color: var(--primary);">${p.code}</td>
        <td class="px-5 py-4">
          <div class="font-bold" style="color: var(--text-main);">${p.name}</div>
          ${p.description && p.description !== `Categoría: ${p.category}` ? `<div class="text-xs line-clamp-1" style="color: var(--text-muted);">${p.description}</div>` : ''}
        </td>
        <td class="px-5 py-4 text-right font-mono" style="color: var(--text-main);">${formatCurrency(p.cost)}</td>
        <td class="px-5 py-4 text-center">
          <span class="px-2 py-1 rounded text-xs font-semibold" style="background: var(--warning-bg); color: var(--warning);">${p.extraExpensesPercent}%</span>
        </td>
        <td class="px-5 py-4 text-right font-bold text-base font-mono" style="color: var(--success);">
          ${formatCurrency(basePrice)}
        </td>
        <td class="px-5 py-4 text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="window.productsModule.editProduct('${p.id}')" class="p-1.5 rounded-lg" style="background: var(--bg-card-hover); border: 1px solid var(--border-color); color: var(--text-muted);">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            <button onclick="window.productsModule.deleteProduct('${p.id}')" class="p-1.5 rounded-lg" style="background: var(--danger-bg); color: var(--danger);">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  tbody.innerHTML = categoryGroups.map(([cat, items]) => `
    <tr><td colspan="6" class="px-5 py-2 text-xs font-bold uppercase tracking-wide" style="background: var(--bg-card-hover); color: var(--primary);">${cat} <span class="font-normal normal-case" style="color: var(--text-muted);">(${items.length})</span></td></tr>
    ${items.map(row).join('')}
  `).join('');

  if (window.lucide) window.lucide.createIcons();
}

// Global Products module handlers
window.productsModule = {
  setView(view) {
    productsView = view;
    try { localStorage.setItem('productsView', view); } catch {}
    renderTable(document.getElementById('search-products')?.value || '');
  },

  renderTable() {
    renderTable(document.getElementById('search-products')?.value || '');
  },

  openModal(productId = null) {
    editingProductId = productId;
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('modal-product-title');
    const form = document.getElementById('product-form');

    form.reset();

    if (productId) {
      title.innerText = 'Editar Producto';
      const products = db.getCollection('products');
      const prod = products.find(p => p.id === productId);
      if (prod) {
        document.getElementById('prod-code').value = prod.code;
        document.getElementById('prod-name').value = prod.name;
        document.getElementById('prod-desc').value = prod.description || '';
        document.getElementById('prod-category').value = prod.category || '';
        document.getElementById('prod-cost').value = prod.cost;
        document.getElementById('prod-extra').value = prod.extraExpensesPercent;
      }
    } else {
      title.innerText = 'Nuevo Producto';
      document.getElementById('prod-code').value = 'PRD-' + Math.floor(100 + Math.random() * 900);
      document.getElementById('prod-extra').value = 5;
    }

    this.calculatePreview();
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  closeModal() {
    const modal = document.getElementById('product-modal');
    modal.classList.add('hidden');
    editingProductId = null;
  },

  calculatePreview() {
    const cost = parseFloat(document.getElementById('prod-cost')?.value) || 0;
    const extPct = parseFloat(document.getElementById('prod-extra')?.value) || 0;

    const extraExpensesAmount = cost * (extPct / 100);
    const basePrice = cost + extraExpensesAmount;

    document.getElementById('preview-ext-val').innerText = formatCurrency(extraExpensesAmount);
    document.getElementById('preview-final-price').innerText = formatCurrency(basePrice);
  },

  saveProduct(e) {
    e.preventDefault();
    const code = document.getElementById('prod-code').value.trim();
    const name = document.getElementById('prod-name').value.trim();
    const description = document.getElementById('prod-desc').value.trim();
    const category = document.getElementById('prod-category').value.trim();
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const extraExpensesPercent = parseFloat(document.getElementById('prod-extra').value) || 0;

    if (editingProductId) {
      db.updateItem('products', editingProductId, {
        code, name, description, category, cost, extraExpensesPercent
      });
      showToast('Producto actualizado correctamente', 'success');
    } else {
      const newProd = {
        id: 'prod-' + Date.now(),
        code, name, description, category, cost, extraExpensesPercent,
        createdAt: new Date().toISOString()
      };
      db.addItem('products', newProd);
      showToast('Producto agregado al catálogo', 'success');
    }

    this.closeModal();
    renderTable();
  },

  editProduct(id) {
    this.openModal(id);
  },

  deleteProduct(id) {
    if (confirm('¿Estás seguro de eliminar este producto del catálogo?')) {
      db.deleteItem('products', id);
      showToast('Producto eliminado', 'warning');
      renderTable();
    }
  }
};
