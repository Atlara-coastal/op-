/**
 * JocoAdmin - Quotes Component
 * Create, print, and convert quotes (cotizaciones) to credit sales.
 */

import { db } from '../db.js';
import { formatCurrency, formatDate, calculateProductPricing, getInterestRateByClientType, showToast } from '../utils.js';
import { paper, docBox, esc, fitPaper, exportPdfById, brand } from '../pdf-doc.js';

let quoteSelectedItems = [];

export function renderQuotes(container) {
  const quotes = db.getCollection('quotes');
  const products = db.getCollection('products');

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      
      <!-- Top Action Bar -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight" style="color: var(--text-main);">Generador de Cotizaciones</h1>
          <p class="text-sm" style="color: var(--text-muted);">Crea cotizaciones personalizadas e imprímelas o conviértelas directamente en ventas a crédito.</p>
        </div>
        <button onclick="window.quotesModule.openModal()" class="btn-primary px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2">
          <i data-lucide="file-plus" class="w-4.5 h-4.5"></i> Crear Cotización
        </button>
      </div>

      <!-- Quotes List -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${quotes.length === 0 ? `
          <div class="glass-panel p-12 text-center col-span-full" style="color: var(--text-muted);">
            <i data-lucide="file-text" class="w-12 h-12 mx-auto mb-3" style="color: var(--primary); opacity: 0.5;"></i>
            <p class="font-medium text-base" style="color: var(--text-main);">No hay cotizaciones registradas</p>
            <p class="text-xs mt-1" style="color: var(--text-muted);">Haz clic en "Crear Cotización" para generar la primera.</p>
          </div>
        ` : quotes.map(q => `
          <div class="glass-panel glass-card-hover p-5 space-y-4 flex flex-col justify-between transition-all">
            <div class="space-y-3">
              <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
                <div>
                  <span class="font-mono text-xs font-bold" style="color: var(--success);">${q.quoteNumber}</span>
                  <h3 class="text-base font-bold leading-tight" style="color: var(--text-main);">${q.clientName}</h3>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-semibold" style="background: var(--bg-card-hover); color: var(--text-muted); border: 1px solid var(--border-color);">
                  ${q.installmentsCount} cuotas ${q.frequency}
                </span>
              </div>

              <!-- Product items preview -->
              <div class="space-y-1.5 text-xs" style="color: var(--text-muted);">
                ${q.items.map(item => `
                  <div class="flex items-center justify-between">
                    <span class="line-clamp-1" style="color: var(--text-main);">${item.quantity}x ${item.productName}</span>
                    <span class="font-mono font-semibold" style="color: var(--text-muted);">${formatCurrency(item.total)}</span>
                  </div>
                `).join('')}
              </div>

              <!-- Calculations summary -->
              <div class="p-3 rounded-xl space-y-1 text-xs" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
                <div class="flex justify-between" style="color: var(--text-muted);">
                  <span>Monto Total Cotizado:</span>
                  <strong style="color: var(--text-main);">${formatCurrency(q.totalAmount)}</strong>
                </div>
                <div class="flex justify-between font-semibold pt-1" style="color: var(--success); border-top: 1px solid var(--border-color);">
                  <span>Valor Cuota:</span>
                  <strong class="text-sm font-bold" style="color: var(--success);">${formatCurrency(q.installmentValue)} / ${q.frequency}</strong>
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="pt-3 flex items-center gap-2" style="border-top: 1px solid var(--border-color);">
              <button onclick="window.quotesModule.viewPrintModal('${q.id}')" class="btn-glass flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5">
                <i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir / Ver
              </button>
              <button onclick="window.quotesModule.convertToSale('${q.id}')" class="flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style="background: var(--success); color: var(--text-on-primary);">
                <i data-lucide="arrow-right-circle" class="w-3.5 h-3.5"></i> Convertir a Venta
              </button>
              <button onclick="window.quotesModule.deleteQuote('${q.id}')" title="Eliminar cotización" class="p-2 rounded-xl shrink-0" style="background: var(--danger-bg); color: var(--danger);">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

    </div>

    <!-- Create Quote Modal -->
    <div id="quote-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-2xl p-6 space-y-5 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-lg font-bold" style="color: var(--text-main);">Nueva Cotización de Crédito</h3>
          <button onclick="window.quotesModule.closeModal()" style="color: var(--text-muted);">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="quote-form" onsubmit="window.quotesModule.saveQuote(event)" class="space-y-4">

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Nombre Prospecto</label>
              <input type="text" id="quote-client-name" required placeholder="Ej: Diana Torres" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Teléfono</label>
              <input type="text" id="quote-client-phone" placeholder="3001234567" class="input-field w-full px-3 py-2 text-sm">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Tipo Cliente (Interés)</label>
              <select id="quote-client-type" onchange="window.quotesModule.onRateTypeChanged()" class="input-field w-full px-3 py-2 text-sm">
                <option value="tipo-1">Tipo 1 (10% Interés)</option>
                <option value="tipo-2">Tipo 2 (15% Interés)</option>
                <option value="tipo-3">Tipo 3 (20% Interés)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">% Interés (editable)</label>
              <input type="number" id="quote-rate" min="0" step="0.5" value="10" oninput="window.quotesModule.updateClientType()" class="input-field w-full px-3 py-2 text-sm font-mono">
            </div>
          </div>

          <!-- Add Product to Quote -->
          <div class="p-4 rounded-xl space-y-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <label class="block text-xs font-semibold uppercase tracking-wide" style="color: var(--success);">Seleccionar Producto del Catálogo</label>
            <div class="flex items-center gap-3">
              <select id="quote-select-product" class="input-field flex-1 px-3 py-2 text-sm">
                <option value="">-- Elige un producto --</option>
                ${products.map(p => {
                  return `<option value="${p.id}">${p.name} - (Base: ${formatCurrency(p.cost + (p.cost * (p.extraExpensesPercent/100)))})</option>`;
                }).join('')}
              </select>
              <button type="button" onclick="window.quotesModule.addItem()" class="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1" style="background: var(--success); color: var(--text-on-primary);">
                <i data-lucide="plus" class="w-4 h-4"></i> Añadir
              </button>
            </div>

            <!-- Items table -->
            <div class="overflow-x-auto pt-2">
              <table class="w-full text-xs text-left" style="color: var(--text-muted);">
                <thead style="color: var(--text-muted);">
                  <tr>
                    <th class="p-2">Producto</th>
                    <th class="p-2 text-center">Cant.</th>
                    <th class="p-2 text-right">Precio Un.</th>
                    <th class="p-2 text-right">Subtotal</th>
                    <th class="p-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody id="quote-items-tbody" class="divide-y" style="border-color: var(--border-color);">
                  <tr>
                    <td colspan="5" class="text-center py-4" style="color: var(--text-muted);">Ningún producto añadido a la cotización aún.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Installments & Terms -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Número de Cuotas</label>
              <select id="quote-installments" onchange="window.quotesModule.updateClientType()" class="input-field w-full px-3 py-2 text-sm">
                <option value="1">1 cuota</option>
                <option value="2">2 cuotas</option>
                <option value="3">3 cuotas</option>
                <option value="4">4 cuotas</option>
                <option value="5">5 cuotas</option>
                <option value="6" selected>6 cuotas</option>
                <option value="7">7 cuotas</option>
                <option value="8">8 cuotas</option>
                <option value="9">9 cuotas</option>
                <option value="10">10 cuotas</option>
                <option value="11">11 cuotas</option>
                <option value="12">12 cuotas</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Frecuencia de Pago</label>
              <select id="quote-frequency" onchange="window.quotesModule.recalculateTotals()" class="input-field w-full px-3 py-2 text-sm">
                <option value="semanal">Semanal</option>
                <option value="quincenal">Quincenal</option>
                <option value="mensual" selected>Mensual</option>
              </select>
            </div>
            <div class="col-span-2 sm:col-span-1">
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Válida hasta</label>
              <input type="date" id="quote-valid-until" class="input-field w-full px-3 py-2 text-sm">
            </div>
          </div>

          <!-- Total Calculation Banner -->
          <div class="p-4 rounded-xl flex items-center justify-between" style="background: var(--success-bg); border: 1px solid var(--success);">
            <div>
              <span class="text-xs font-semibold block" style="color: var(--success);">TOTAL COTIZADO</span>
              <span id="quote-total-amount" class="text-2xl font-extrabold" style="color: var(--text-main);">$ 0</span>
            </div>
            <div class="text-right">
              <span class="text-xs font-semibold block" style="color: var(--success);">VALOR CUOTA ESTIMADA</span>
              <span id="quote-installment-val" class="text-xl font-bold" style="color: var(--success);">$ 0 / mes</span>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" onclick="window.quotesModule.closeModal()" class="btn-glass px-4 py-2 rounded-xl text-sm">Cancelar</button>
            <button type="submit" class="px-5 py-2 rounded-xl text-sm font-semibold" style="background: var(--success); color: var(--text-on-primary);">Guardar Cotización</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Printable Quote Modal -->
    <div id="print-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-2xl p-5 space-y-4 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3 no-print" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-lg font-bold" style="color: var(--text-main);">Documento Oficial de Cotización</h3>
          <div class="flex items-center gap-2">
            <button onclick="window.quotesModule.downloadPdf(this)" class="btn-primary px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
              <i data-lucide="file-down" class="w-4 h-4"></i> Descargar PDF
            </button>
            <button onclick="document.getElementById('print-modal').classList.add('hidden')" class="p-1" style="color: var(--text-muted);">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <div id="printable-quote" class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-color);">
          <!-- Dynamic Content Rendered Here -->
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

window.quotesModule = {
  openModal() {
    quoteSelectedItems = [];
    document.getElementById('quote-form').reset();
    
    // Set default valid date (+15 days)
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + 15);
    document.getElementById('quote-valid-until').value = validDate.toISOString().split('T')[0];

    this.renderItemsTable();
    document.getElementById('quote-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  closeModal() {
    document.getElementById('quote-modal').classList.add('hidden');
  },

  // Prefills the % Interés field with the type's default rate when the type changes
  // (the field stays editable afterwards; typing in it never gets overwritten).
  onRateTypeChanged() {
    const clientType = document.getElementById('quote-client-type').value;
    document.getElementById('quote-rate').value = getInterestRateByClientType(clientType);
    this.updateClientType();
  },

  // Interest depends on the % Interés field (editable, defaults from the client type) and
  // the number of installments: reprice every item.
  updateClientType() {
    const clientType = document.getElementById('quote-client-type').value;
    const rate = document.getElementById('quote-rate')?.value;
    const n = parseInt(document.getElementById('quote-installments')?.value) || 1;
    quoteSelectedItems = quoteSelectedItems.map(item => {
      const pricing = calculateProductPricing(item.cost, item.extraExpensesPercent, clientType, n, rate);
      return {
        ...item,
        finalUnitPrice: pricing.finalPrice,
        total: item.quantity * pricing.finalPrice
      };
    });
    this.renderItemsTable();
  },

  addItem() {
    const prodId = document.getElementById('quote-select-product').value;
    if (!prodId) return showToast('Selecciona un producto primero', 'warning');

    const products = db.getCollection('products');
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    const clientType = document.getElementById('quote-client-type').value;
    const rate = document.getElementById('quote-rate')?.value;
    const pricing = calculateProductPricing(prod.cost, prod.extraExpensesPercent, clientType, parseInt(document.getElementById('quote-installments')?.value) || 1, rate);

    const existing = quoteSelectedItems.find(i => i.productId === prodId);
    if (existing) {
      existing.quantity += 1;
      existing.total = existing.quantity * existing.finalUnitPrice;
    } else {
      quoteSelectedItems.push({
        productId: prod.id,
        productName: prod.name,
        cost: prod.cost,
        extraExpensesPercent: prod.extraExpensesPercent,
        finalUnitPrice: pricing.finalPrice,
        quantity: 1,
        total: pricing.finalPrice
      });
    }

    this.renderItemsTable();
    showToast('Producto añadido a la cotización', 'info');
  },

  removeItem(index) {
    quoteSelectedItems.splice(index, 1);
    this.renderItemsTable();
  },

  renderItemsTable() {
    const tbody = document.getElementById('quote-items-tbody');
    if (!tbody) return;

    if (quoteSelectedItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4" style="color: var(--text-muted);">Ningún producto añadido a la cotización aún.</td></tr>`;
    } else {
      tbody.innerHTML = quoteSelectedItems.map((item, idx) => `
        <tr>
          <td class="p-2 font-medium" style="color: var(--text-main);">${item.productName}</td>
          <td class="p-2 text-center font-bold" style="color: var(--text-main);">${item.quantity}</td>
          <td class="p-2 text-right font-mono" style="color: var(--text-main);">${formatCurrency(item.finalUnitPrice)}</td>
          <td class="p-2 text-right font-mono font-bold" style="color: var(--success);">${formatCurrency(item.total)}</td>
          <td class="p-2 text-center">
            <button type="button" onclick="window.quotesModule.removeItem(${idx})" style="color: var(--danger);">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }

    this.recalculateTotals();
    if (window.lucide) window.lucide.createIcons();
  },

  recalculateTotals() {
    const totalAmount = quoteSelectedItems.reduce((acc, item) => acc + item.total, 0);
    const count = parseInt(document.getElementById('quote-installments')?.value || 1);
    const freq = document.getElementById('quote-frequency')?.value || 'mensual';

    const installmentVal = totalAmount > 0 ? (totalAmount / count) : 0;

    document.getElementById('quote-total-amount').innerText = formatCurrency(totalAmount);
    document.getElementById('quote-installment-val').innerText = `${formatCurrency(installmentVal)} / ${freq}`;
  },

  saveQuote(e) {
    e.preventDefault();
    if (quoteSelectedItems.length === 0) {
      return showToast('Agrega al menos un producto a la cotización', 'warning');
    }

    const clientName = document.getElementById('quote-client-name').value.trim();
    const clientPhone = document.getElementById('quote-client-phone').value.trim();
    const installmentsCount = parseInt(document.getElementById('quote-installments').value);
    const frequency = document.getElementById('quote-frequency').value;
    const validUntil = document.getElementById('quote-valid-until').value;

    const totalAmount = quoteSelectedItems.reduce((acc, item) => acc + item.total, 0);
    const installmentValue = totalAmount / installmentsCount;

    const newQuote = {
      id: 'quote-' + Date.now(),
      quoteNumber: 'COT-' + Math.floor(100 + Math.random() * 900),
      clientName,
      clientPhone,
      items: quoteSelectedItems,
      totalAmount,
      installmentsCount,
      installmentValue,
      frequency,
      clientType: document.getElementById('quote-client-type').value,
      interestRate: parseFloat(document.getElementById('quote-rate')?.value) || 0,
      validUntil,
      createdAt: new Date().toISOString()
    };

    db.addItem('quotes', newQuote);
    showToast('Cotización guardada exitosamente', 'success');
    this.closeModal();
    renderQuotes(document.getElementById('main-content'));
  },

  viewPrintModal(quoteId) {
    const quotes = db.getCollection('quotes');
    const q = quotes.find(item => item.id === quoteId);
    if (!q) return;

    const printContainer = document.getElementById('printable-quote');
    printContainer.innerHTML = paper({
      title: 'Cotización de crédito',
      number: q.quoteNumber,
      date: formatDate(q.createdAt),
      footer: `Cotización válida hasta el ${formatDate(q.validUntil)}.<br>Sujeta a aprobación de cupo.`,
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${docBox('Cliente cotizado', `<div style="font-size:14px;font-weight:700;">${esc(q.clientName)}</div>
            <div style="color:#5b6b7f;margin-top:3px;">Tel: <b style="color:#0b1220;">${esc(q.clientPhone || 'No registrado')}</b></div>`)}
          ${docBox('Condiciones de crédito', `<div style="font-size:14px;font-weight:700;color:${brand().accent};">${q.installmentsCount} cuotas ${esc(q.frequency)}es</div>
            <div style="color:#5b6b7f;margin-top:3px;">Válida hasta: <b style="color:#0b1220;">${formatDate(q.validUntil)}</b></div>`, 'cyan')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#050708;color:#fff;">
              <th style="text-align:left;padding:9px 10px;border-radius:8px 0 0 8px;">Producto</th>
              <th style="text-align:center;padding:9px 10px;">Cant.</th>
              <th style="text-align:right;padding:9px 10px;">Precio un.</th>
              <th style="text-align:right;padding:9px 10px;border-radius:0 8px 8px 0;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${q.items.map(item => `
              <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px;font-weight:600;">${esc(item.productName)}</td>
                <td style="padding:10px;text-align:center;font-weight:700;">${item.quantity}</td>
                <td style="padding:10px;text-align:right;font-family:'Courier New',monospace;">${formatCurrency(item.finalUnitPrice)}</td>
                <td style="padding:10px;text-align:right;font-family:'Courier New',monospace;font-weight:700;color:${brand().accent};">${formatCurrency(item.total)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${docBox('Total plan de crédito', `<div style="font-size:22px;font-weight:800;font-family:'Courier New',monospace;">${formatCurrency(q.totalAmount)}</div>`)}
          ${docBox('Valor de cada cuota', `<div style="font-size:22px;font-weight:800;font-family:'Courier New',monospace;color:#059669;">${formatCurrency(q.installmentValue)}</div><div style="color:#059669;font-size:10px;">por ${esc(q.frequency)}</div>`, 'ok')}
        </div>`
    });
    fitPaper(printContainer);


    document.getElementById('print-modal').classList.remove('hidden');
    fitPaper(printContainer);
    if (window.lucide) window.lucide.createIcons();
  },

  downloadPdf(btn) {
    const num = document.querySelector('#printable-quote [style*="Courier"]')?.textContent.trim() || 'cotizacion';
    exportPdfById('printable-quote', `Cotizacion-${num}.pdf`, btn);
  },

  deleteQuote(quoteId) {
    const q = db.getCollection('quotes').find(item => item.id === quoteId);
    if (!q || !confirm('¿Eliminar la cotización ' + q.quoteNumber + ' de ' + q.clientName + '? No se puede deshacer.')) return;
    db.deleteItem('quotes', quoteId);
    showToast('Cotización eliminada', 'success');
    renderQuotes(document.getElementById('main-content'));
  },

  convertToSale(quoteId) {
    const quotes = db.getCollection('quotes');
    const q = quotes.find(item => item.id === quoteId);
    if (!q) return;

    if (confirm(`¿Deseas convertir la cotización ${q.quoteNumber} en una Venta a Crédito activa?`)) {
      window.app.switchTab('sales', 'from-quote', q);
      showToast(`Cotización ${q.quoteNumber} lista para formalizar como venta`, 'success');
    }
  }
};
