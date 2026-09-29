/**
 * JocoAdmin - Sales & Credit Payment Engine
 * Register Sales, Credit Amortization Schedules, Abono Payments, Remaining Debt Tracking.
 */

import { db } from '../db.js';
import { getSellers, getMyUsername } from '../permissions.js';
import { paper, docBox, esc, fitPaper, exportPdfById } from '../pdf-doc.js';
import { effectiveStatus, installmentValue, nextDue, bogotaToday } from '../due.js';
import { formatCurrency, formatDate, repriceItems, showToast, generateWhatsAppPaymentReceipt } from '../utils.js';

let newSaleItems = [];

export function renderSales(container) {
  const sales = db.getCollection('sales');
  const payments = db.getCollection('payments');

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      
      <!-- Top Action Bar -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight" style="color: var(--text-main);">Registro de Ventas & Control de Pagos</h1>
          <p class="text-sm" style="color: var(--text-muted);">Administra créditos activos, saldos pendientes y registra los abonos cobrados.</p>
        </div>

        <div class="flex items-center gap-3">
          <button onclick="window.salesModule.openPaymentModal()" class="btn-glass px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2">
            <i data-lucide="dollar-sign" class="w-4.5 h-4.5"></i> Registrar Abono / Pago
          </button>
          <button onclick="window.salesModule.openSaleModal()" class="btn-primary px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2">
            <i data-lucide="shopping-cart" class="w-4.5 h-4.5"></i> Nueva Venta
          </button>
        </div>
      </div>

      <!-- Sales Table -->
      <div class="glass-panel overflow-hidden">
        <div class="p-4 flex items-center justify-between gap-4" style="border-bottom: 1px solid var(--border-color);">
          <div class="relative flex-1 max-w-xs">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3" style="color: var(--text-muted);"></i>
            <input type="text" id="search-sales" placeholder="Buscar por número o cliente..." class="input-field w-full pl-9 pr-4 py-2 text-sm">
          </div>
          <span class="text-xs" style="color: var(--text-muted);">${sales.length} registros de venta</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm" style="color: var(--text-muted);">
            <thead class="text-xs font-semibold uppercase" style="background: var(--bg-card-hover); color: var(--text-muted); border-bottom: 1px solid var(--border-color);">
              <tr>
                <th class="px-3 xl:px-5 py-3.5 whitespace-nowrap">N° Venta</th>
                <th class="px-3 xl:px-5 py-3.5">Cliente</th>
                <th class="hidden xl:table-cell px-5 py-3.5">Vendedor</th>
                <th class="hidden xl:table-cell px-5 py-3.5 text-center">Tipo</th>
                <th class="px-3 xl:px-5 py-3.5 text-right">Monto Total</th>
                <th class="px-3 xl:px-5 py-3.5 text-right" style="color: var(--success);">Total Pagado</th>
                <th class="px-3 xl:px-5 py-3.5 text-right font-bold" style="color: var(--warning);">Saldo Restante</th>
                <th class="px-3 xl:px-5 py-3.5 text-center">Estado</th>
                <th class="px-3 xl:px-5 py-3.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody id="sales-table-body" class="divide-y" style="border-color: var(--border-color);">
              <!-- Dynamically Populated -->
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- New Sale Modal -->
    <div id="sale-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-2xl p-6 space-y-5 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-lg font-bold" style="color: var(--text-main);">Registrar Nueva Venta / Crédito</h3>
          <button onclick="window.salesModule.closeSaleModal()" style="color: var(--text-muted);" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="sale-form" onsubmit="window.salesModule.saveSale(event)" class="space-y-4">

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Cliente Registrado *</label>
              <select id="sale-client-id" required onchange="window.salesModule.onClientSelectChanged()" class="input-field w-full px-3 py-2 text-sm">
                <option value="">-- Selecciona el Cliente --</option>
                ${db.getCollection('clients').map(c => `<option value="${c.id}">${c.fullName} (CC: ${c.cc} - ${c.type})</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Vendedor *</label>
              <select id="sale-seller" class="input-field w-full px-3 py-2 text-sm">
                <option value="">— Sin vendedor —</option>${getSellers().map(u => `<option value="${u}" ${u === getMyUsername() ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Modalidad de Pago</label>
              <select id="sale-type" onchange="window.salesModule.toggleCreditFields()" class="input-field w-full px-3 py-2 text-sm">
                <option value="credito" selected>Venta a Crédito (Financiado)</option>
                <option value="contado">Venta de Contado</option>
              </select>
            </div>
          </div>

          <!-- Add Products to Sale -->
          <div class="p-4 rounded-xl space-y-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <label class="block text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">Añadir Productos</label>
            <div class="flex items-center gap-3">
              <select id="sale-select-product" class="input-field flex-1 px-3 py-2 text-sm">
                <option value="">-- Elige un producto --</option>
                ${db.getCollection('products').map(p => {
                  return `<option value="${p.id}">${p.name} - (Base: ${formatCurrency(p.cost + (p.cost * (p.extraExpensesPercent/100)))})</option>`;
                }).join('')}
              </select>
              <button type="button" onclick="window.salesModule.addItem()" class="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1">
                <i data-lucide="plus" class="w-4 h-4"></i> Añadir
              </button>
            </div>

            <!-- Items Table -->
            <div class="overflow-x-auto pt-2">
              <table class="w-full text-xs text-left" style="color: var(--text-muted);">
                <thead style="background: var(--bg-card-hover); color: var(--text-muted);">
                  <tr>
                    <th class="p-2">Producto</th>
                    <th class="p-2 text-center">Cant.</th>
                    <th class="p-2 text-right">Precio Un.</th>
                    <th class="p-2 text-right">Subtotal</th>
                    <th class="p-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody id="sale-items-tbody" class="divide-y" style="border-color: var(--border-color);">
                  <tr>
                    <td colspan="5" class="text-center py-4" style="color: var(--text-muted);">No hay productos agregados.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Credit Terms Options -->
          <div id="credit-fields-container" class="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Cuota Inicial ($)</label>
              <input type="number" id="sale-initial" min="0" step="any" value="0" oninput="window.salesModule.onTermsChanged()" class="input-field w-full px-3 py-2 text-sm font-mono">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Valor de cada cuota ($)</label>
              <input type="number" id="sale-inst-amount" min="0" step="any" placeholder="Automático" class="input-field w-full px-3 py-2 text-sm font-mono">
              <p id="sale-cuota-hint" class="text-[10px] mt-1" style="color: var(--text-muted);"></p>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Número de Cuotas</label>              <input type="number" id="sale-installments" min="1" max="12" value="4" oninput="window.salesModule.onTermsChanged()" class="input-field w-full px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Frecuencia</label>
              <select id="sale-frequency" class="input-field w-full px-3 py-2 text-sm">
                <option value="quincenal">Quincenal</option>
                <option value="mensual" selected>Mensual</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Fecha Primer Cobro</label>
              <input type="date" id="sale-start-date" class="input-field w-full px-3 py-2 text-sm">
            </div>
          </div>

          <!-- Cash Sale: set a final sale value after the cost, distributed across the items -->
          <div id="cash-fields-container" class="hidden grid grid-cols-2 gap-3 p-3 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Costo Total de Productos</label>
              <div id="sale-cash-cost" class="input-field w-full px-3 py-2 text-sm font-mono flex items-center" style="color: var(--text-muted);">$ 0</div>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Valor Final de Venta ($)</label>
              <input type="number" id="sale-cash-final" min="0" step="any" placeholder="Igual al costo + gastos" oninput="window.salesModule.applyCashFinal()" class="input-field w-full px-3 py-2 text-sm font-mono">
              <p class="text-[10px] mt-1" style="color: var(--text-muted);">Se reparte entre los productos de la venta.</p>
            </div>
          </div>

          <!-- Sale Summary Card -->
          <div class="p-4 rounded-xl flex justify-between items-center" style="background: var(--success-bg); border: 1px solid var(--success);">
            <span class="text-xs font-semibold uppercase" style="color: var(--success);">TOTAL DE LA VENTA:</span>
            <span id="sale-total-display" class="text-2xl font-extrabold" style="color: var(--text-main);">$ 0</span>
          </div>
          <p id="sale-financed-hint" class="text-xs text-right -mt-2" style="color: var(--text-muted);"></p>

          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" onclick="window.salesModule.closeSaleModal()" class="btn-glass px-4 py-2 rounded-xl text-sm">Cancelar</button>
            <button type="submit" class="btn-primary px-5 py-2 rounded-xl text-sm font-semibold">Confirmar Venta</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Register Payment Abono Modal -->
    <div id="payment-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-lg p-6 space-y-5 animate-fade-in shadow-2xl relative">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-lg font-bold flex items-center gap-2" style="color: var(--text-main);">
            <i data-lucide="dollar-sign" class="w-5 h-5" style="color: var(--success);"></i> Registrar Abono a Crédito
          </h3>
          <button onclick="window.salesModule.closePaymentModal()" style="color: var(--text-muted);" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form id="payment-form" onsubmit="window.salesModule.savePayment(event)" class="space-y-4">

          <div>
            <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Seleccionar Crédito Activo *</label>
            <select id="pay-sale-id" required onchange="window.salesModule.onSelectSaleForPayment()" class="input-field w-full px-3 py-2 text-sm">
              <option value="">-- Selecciona una Venta --</option>
              ${sales.filter(s => s.outstandingBalance > 0).map(s => `
                <option value="${s.id}">${s.saleNumber} - ${s.clientName} (Debe: ${formatCurrency(s.outstandingBalance)})</option>
              `).join('')}
            </select>
          </div>

          <!-- Debt Status Card -->
          <div id="payment-debt-summary" class="p-4 rounded-xl space-y-2 hidden text-xs" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <div class="flex justify-between" style="color: var(--text-muted);">
              <span>Monto Inicial del Crédito:</span>
              <strong id="pay-summary-total" style="color: var(--text-main);">$ 0</strong>
            </div>
            <div class="flex justify-between" style="color: var(--text-muted);">
              <span>Total Ya Abonado:</span>
              <strong id="pay-summary-paid" style="color: var(--success);">$ 0</strong>
            </div>
            <div class="pt-2 flex justify-between text-sm font-bold" style="border-top: 1px solid var(--border-color); color: var(--warning);">
              <span>CUÁNTO SIGUE DEBIENDO EL CLIENTE:</span>
              <span id="pay-summary-debt" class="font-mono text-base">$ 0</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Monto del Abono ($) *</label>
              <input type="number" id="pay-amount" required min="1" step="any" placeholder="100000" class="input-field w-full px-3 py-2 text-sm font-mono">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Método de Pago</label>
              <select id="pay-method" class="input-field w-full px-3 py-2 text-sm">
                <option value="Efectivo">Efectivo</option>
                <option value="Nequi" selected>Nequi</option>
                <option value="Daviplata">Daviplata</option>
                <option value="Transferencia Bancaria">Transferencia Bancaria</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Fecha del Abono</label>
            <input type="date" id="pay-date" class="input-field w-full px-3 py-2 text-sm">
          </div>

          <div>
            <label class="block text-xs font-semibold mb-1" style="color: var(--text-muted);">Notas / Observaciones</label>
            <input type="text" id="pay-notes" placeholder="Ej: Comprobante Nequi #981273" class="input-field w-full px-3 py-2 text-sm">
          </div>

          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" onclick="window.salesModule.closePaymentModal()" class="btn-glass px-4 py-2 rounded-xl text-sm">Cancelar</button>
            <button type="submit" class="btn-primary px-5 py-2 rounded-xl text-sm font-semibold">Guardar Abono</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Printable Payment Receipt Modal -->
    <div id="receipt-modal" class="fixed inset-0 z-[60] modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-2xl p-5 space-y-4 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3 no-print" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-base font-bold flex items-center gap-2" style="color: var(--text-main);">
            <i data-lucide="receipt" class="w-5 h-5" style="color: var(--success);"></i> Comprobante de Abono
          </h3>
          <div class="flex items-center gap-2">
            <a id="btn-whatsapp-receipt" href="#" target="_blank" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all" style="background: var(--success); color: var(--text-on-primary);">
              <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp
            </a>
            <button onclick="window.salesModule.downloadReceiptPdf(this)" class="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all">
              <i data-lucide="file-down" class="w-4 h-4"></i> PDF
            </button>
            <button onclick="window.salesModule.closeReceiptModal()" class="p-1" style="color: var(--text-muted);" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
        </div>

        <div id="printable-receipt" class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-color);">
          <!-- Dynamic Receipt Content Injected Here -->
        </div>
      </div>
    </div>

    <!-- Payment History Modal for a Sale -->
    <div id="payment-history-modal" class="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4 hidden">
      <div class="glass-panel w-full max-w-2xl p-6 space-y-4 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
          <div>
            <h3 class="text-base font-bold flex items-center gap-2" style="color: var(--text-main);">
              <i data-lucide="history" class="w-5 h-5" style="color: var(--success);"></i> Historial de Abonos y Recibos
            </h3>
            <p id="history-modal-subtitle" class="text-xs mt-0.5" style="color: var(--text-muted);">Venta #VTA-000</p>
          </div>
          <button onclick="window.salesModule.closePaymentHistoryModal()" class="p-1" style="color: var(--text-muted);" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div id="history-modal-content" class="space-y-4">
          <!-- Populated dynamically -->
        </div>
      </div>
    </div>
  `;

  renderSalesTable();

  const searchInput = document.getElementById('search-sales');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => renderSalesTable(e.target.value));
  }

  if (window.lucide) window.lucide.createIcons();
}

function renderSalesTable(searchTerm = '') {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  const sales = db.getCollection('sales');
  const filtered = sales.filter(s => 
    s.saleNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8" style="color: var(--text-muted);">No hay registros de ventas que coincidan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => {
    const statusBadges = {
      'pagado': '<span class="inline-block whitespace-nowrap px-2.5 py-1 rounded-full badge-al-dia text-xs font-semibold">Pagado 100%</span>',
      'al_dia': '<span class="inline-block whitespace-nowrap px-2.5 py-1 rounded-full badge-proximo text-xs font-semibold">Al Día</span>',
      'mora': '<span class="inline-block whitespace-nowrap px-2.5 py-1 rounded-full badge-mora text-xs font-semibold">En Mora</span>'
    };

    const st = effectiveStatus(s);
    const nd = nextDue(s);

    return `
      <tr class="transition-colors" style="border-color: var(--border-color);" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'">
        <td class="px-3 xl:px-5 py-4 font-mono font-bold text-xs whitespace-nowrap" style="color: var(--primary);">${s.saleNumber}</td>
        <td class="px-3 xl:px-5 py-4 font-semibold" style="color: var(--text-main);">${s.clientName}
          <div class="xl:hidden text-[10px] font-normal uppercase mt-0.5" style="color: var(--text-muted);">${s.type} · ${s.sellerName || s.sellerUsername || '—'}</div>
        </td>
        <td class="hidden xl:table-cell px-5 py-4 text-xs" style="color: var(--text-muted);">${s.sellerName || s.sellerUsername || '—'}</td>
        <td class="hidden xl:table-cell px-5 py-4 text-center">
          <span class="px-2 py-0.5 rounded text-[11px] font-medium uppercase" style="${s.type === 'credito' ? 'background: var(--bg-card-hover); color: var(--text-muted);' : 'background: var(--success-bg); color: var(--success);'}">
            ${s.type}
          </span>
        </td>
        <td class="px-3 xl:px-5 py-4 text-right font-mono font-semibold whitespace-nowrap" style="color: var(--text-main);">${formatCurrency(s.totalAmount)}
          ${s.type !== 'contado' ? `<div class="text-[10px] font-sans font-medium" style="color: var(--text-muted);">Inicial: ${formatCurrency(s.initialPayment || 0)}</div>` : ''}
        </td>
        <td class="px-3 xl:px-5 py-4 text-right font-mono font-semibold whitespace-nowrap" style="color: var(--success);">${formatCurrency(s.totalPaid)}</td>
        <td class="px-3 xl:px-5 py-4 text-right">
          <div class="font-mono font-bold text-base whitespace-nowrap" style="color: var(--warning);">${formatCurrency(s.outstandingBalance)}</div>
          <div class="text-[10px] font-sans mt-0.5 whitespace-nowrap" style="color: var(--text-muted);">Cuota: <span class="font-bold font-mono" style="color: var(--text-main);">${formatCurrency(installmentValue(s))}</span></div>
          ${nd ? `<div class="text-[10px] font-sans" style="color: ${nd.daysOverdue > 0 ? 'var(--danger, #ef4444)' : 'var(--text-muted)'};">Próx: ${formatDate(nd.date)}${nd.daysOverdue > 0 ? ` (${nd.daysOverdue}d atraso)` : ''}</div>` : ''}
        </td>
        <td class="px-3 xl:px-5 py-4 text-center">
          ${statusBadges[st] || statusBadges['al_dia']}
        </td>
        <td class="px-3 xl:px-5 py-4 text-center">
          <div class="flex items-center justify-center gap-1.5 whitespace-nowrap">
            <button onclick="window.salesModule.openPaymentForSale('${s.id}')" title="Registrar abono" class="btn-primary px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i> Abono
            </button>
            <button onclick="window.salesModule.openPaymentHistoryModal('${s.id}')" title="Historial de abonos y recibos" class="btn-glass p-1 rounded-lg transition-colors">
              <i data-lucide="receipt" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="window.salesModule.openEditSale('${s.id}')" title="Editar venta" class="btn-glass p-1 rounded-lg transition-colors">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');


  if (window.lucide) window.lucide.createIcons();
}

window.salesModule = {
  openSaleModal(prefilledQuote = null) {
    newSaleItems = [];
    document.getElementById('sale-form').reset();
    
    // Set default payment start date (today)
    document.getElementById('sale-start-date').value = bogotaToday();

    if (prefilledQuote) {
      document.getElementById('sale-installments').value = prefilledQuote.installmentsCount || 4;
      document.getElementById('sale-frequency').value = prefilledQuote.frequency || 'mensual';
      
      newSaleItems = prefilledQuote.items.map(item => ({ ...item }));
    }

    this.renderItemsTable();
    document.getElementById('sale-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  closeSaleModal() {
    document.getElementById('sale-modal').classList.add('hidden');
  },

  toggleCreditFields() {
    const type = document.getElementById('sale-type').value;
    const container = document.getElementById('credit-fields-container');
    const cashContainer = document.getElementById('cash-fields-container');
    container.classList.toggle('hidden', type === 'contado');
    cashContainer.classList.toggle('hidden', type !== 'contado');
    this.onTermsChanged();
  },

  // Number of installments the interest is calculated for (cash = a single payment).
  termInstallments() {
    if (document.getElementById('sale-type')?.value === 'contado') return 1;
    return Math.max(1, parseInt(document.getElementById('sale-installments')?.value) || 1);
  },

  // The interest is charged on the DEBT (total cost − down payment) and depends on the number
  // of installments: reprice every item that has no manual price, then refresh the totals.
  // A cash sale has no debt, so it carries no interest.
  onTermsChanged() {
    const cash = document.getElementById('sale-type')?.value === 'contado';
    const client = db.getCollection('clients').find(c => c.id === document.getElementById('sale-client-id')?.value);
    if (!cash) newSaleItems.forEach(i => { delete i.customPrice; });
    if (client && newSaleItems.length) {
      const auto = newSaleItems.filter(i => !i.customPrice);
      const initial = cash ? Infinity : (parseFloat(document.getElementById('sale-initial')?.value) || 0);
      const repriced = repriceItems(auto, client.type, this.termInstallments(), initial);
      let k = 0;
      newSaleItems = newSaleItems.map(i => (i.customPrice ? i : repriced[k++]));
    }
    this.renderItemsTable();
  },
  // Lets the final sale value for a cash sale be set directly (after seeing
  // the cost), distributing it proportionally across the items so their
  // totals still add up to exactly that value.
  applyCashFinal() {
    const value = Math.max(0, parseFloat(document.getElementById('sale-cash-final')?.value) || 0);
    if (!value || !newSaleItems.length) return;
    const currentSum = newSaleItems.reduce((acc, i) => acc + i.total, 0) || 1;
    let allocated = 0;
    newSaleItems.forEach((item, idx) => {
      item.customPrice = true;
      if (idx === newSaleItems.length - 1) {
        item.total = value - allocated;
      } else {
        item.total = Math.round((item.total / currentSum) * value);
        allocated += item.total;
      }
      item.finalUnitPrice = item.total / (item.quantity || 1);
    });
    this.renderItemsTable(true);
  },

  saleTotals() {
    const total = newSaleItems.reduce((acc, i) => acc + i.total, 0);
    const cash = document.getElementById('sale-type')?.value === 'contado';
    const initial = cash ? total : Math.min(total, Math.max(0, parseFloat(document.getElementById('sale-initial')?.value) || 0));
    const count = Math.max(1, parseInt(document.getElementById('sale-installments')?.value) || 1);
    const financed = total - initial;
    return { total, cash, initial, count, financed, auto: Math.round(financed / count) };
  },

  updateCuota() {
    const t = this.saleTotals();
    const hint = document.getElementById('sale-cuota-hint');
    const fin = document.getElementById('sale-financed-hint');
    const inst = document.getElementById('sale-inst-amount');
    if (inst) inst.placeholder = t.cash ? '' : 'Automático';
    if (hint) hint.textContent = t.cash ? '' : 'Dejar vacío = ' + formatCurrency(t.auto);
    let interestNote = '';
    if (!t.cash) {
      const auto = newSaleItems.filter(i => !i.customPrice);
      const interest = auto.reduce((acc, i) => acc + i.total - i.cost * (1 + (i.extraExpensesPercent || 0) / 100) * i.quantity, 0);
      if (interest > 0.5) interestNote = ' · Incluye interés ' + formatCurrency(interest);
    }    if (fin) fin.textContent = t.cash ? '' : 'Cuota inicial ' + formatCurrency(t.initial) + ' · Financiado ' + formatCurrency(t.financed) + interestNote;
  },

  setItemPrice(idx, value) {
    const item = newSaleItems[idx];
    const price = Math.max(0, parseFloat(value) || 0);
    if (!item) return;
    item.finalUnitPrice = price;
    item.customPrice = true;
    item.total = price * item.quantity;
    this.renderItemsTable();
  },

  onClientSelectChanged() {
    const clientId = document.getElementById('sale-client-id').value;
    if (!clientId || newSaleItems.length === 0) return;

    const clients = db.getCollection('clients');
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    this.onTermsChanged();
  },

  addItem() {
    const clientId = document.getElementById('sale-client-id').value;
    if (!clientId) return showToast('Selecciona el cliente primero para calcular su interés', 'warning');

    const clients = db.getCollection('clients');
    const client = clients.find(c => c.id === clientId);

    const prodId = document.getElementById('sale-select-product').value;
    if (!prodId) return showToast('Selecciona un producto primero', 'warning');

    const products = db.getCollection('products');
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    const existing = newSaleItems.find(i => i.productId === prodId);
    if (existing) {
      existing.quantity += 1;
      existing.total = existing.quantity * existing.finalUnitPrice;
    } else {
      newSaleItems.push({
        productId: prod.id,
        productName: prod.name,
        cost: prod.cost,
        extraExpensesPercent: prod.extraExpensesPercent,
        finalUnitPrice: 0,
        quantity: 1,
        total: 0
      });
    }

    this.onTermsChanged();
    showToast('Producto agregado a la venta', 'info');
  },

  removeItem(idx) {
    newSaleItems.splice(idx, 1);
    this.renderItemsTable();
  },

  renderItemsTable(skipCashFinalSync = false) {
    const tbody = document.getElementById('sale-items-tbody');
    if (!tbody) return;

    const cashSale = document.getElementById('sale-type')?.value === 'contado';
    const cashCost = document.getElementById('sale-cash-cost');
    if (cashCost) cashCost.textContent = formatCurrency(newSaleItems.reduce((acc, i) => acc + i.cost * i.quantity, 0));
    const cashFinal = document.getElementById('sale-cash-final');
    if (cashSale && cashFinal && !skipCashFinalSync && document.activeElement !== cashFinal) {
      cashFinal.value = newSaleItems.length ? Math.round(newSaleItems.reduce((acc, i) => acc + i.total, 0)) : '';
    }

    if (newSaleItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4" style="color: var(--text-muted);">No hay productos agregados.</td></tr>`;
    } else {
      tbody.innerHTML = newSaleItems.map((item, idx) => `
        <tr onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'">
          <td class="p-2 font-medium" style="color: var(--text-main);">${item.productName}</td>
          <td class="p-2 text-center font-bold" style="color: var(--text-main);">${item.quantity}</td>
          <td class="p-2 text-right font-mono" style="color: var(--text-main);">${cashSale
            ? `<input type="number" min="0" step="any" value="${Math.round(item.finalUnitPrice)}" onchange="window.salesModule.setItemPrice(${idx}, this.value)" class="input-field px-2 py-1 text-xs text-right font-mono w-28">`
            : formatCurrency(item.finalUnitPrice)}</td>
          <td class="p-2 text-right font-mono font-bold" style="color: var(--success);">${formatCurrency(item.total)}</td>
          <td class="p-2 text-center">
            <button type="button" onclick="window.salesModule.removeItem(${idx})" style="color: var(--danger);">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }

    const total = newSaleItems.reduce((acc, i) => acc + i.total, 0);
    document.getElementById('sale-total-display').innerText = formatCurrency(total);
    this.updateCuota();
    if (window.lucide) window.lucide.createIcons();
  },

  saveSale(e) {
    e.preventDefault();
    if (newSaleItems.length === 0) return showToast('Añade al menos un producto', 'warning');

    const clientId = document.getElementById('sale-client-id').value;
    if (!clientId) return showToast('Selecciona un cliente', 'warning');

    const clients = db.getCollection('clients');
    const client = clients.find(c => c.id === clientId);

    const saleType = document.getElementById('sale-type').value;
    const installmentsCount = parseInt(document.getElementById('sale-installments').value) || 1;
    const frequency = document.getElementById('sale-frequency').value;
    const startDate = document.getElementById('sale-start-date').value;

    const { total: totalAmount, initial, auto } = this.saleTotals();
    const customCuota = parseFloat(document.getElementById('sale-inst-amount')?.value) || 0;
    const totalPaid = initial;
    const outstandingBalance = Math.max(0, totalAmount - totalPaid);
    const today = bogotaToday();
    const saleId = 'sale-' + Date.now();
    const saleNumber = 'VTA-' + Math.floor(100 + Math.random() * 900);

    const newSale = {
      id: saleId,
      saleNumber,
      clientId: client.id,
      clientName: client.fullName,
      sellerUsername: document.getElementById('sale-seller')?.value || getMyUsername() || null,
      type: saleType,
      items: newSaleItems,
      totalAmount,
      initialPayment: initial,
      totalPaid,
      outstandingBalance,
      installmentsCount: saleType === 'contado' ? 1 : installmentsCount,
      installmentAmount: saleType === 'contado' ? 0 : (customCuota || auto),
      frequency,
      status: outstandingBalance === 0 ? 'pagado' : 'al_dia',
      date: today,
      startDate,
      createdAt: new Date().toISOString()
    };

    db.addItem('sales', newSale);
    if (initial > 0) {
      db.addItem('payments', {
        id: 'pay-' + Date.now() + '-i',
        receiptNumber: 'REC-' + Math.floor(1000 + Math.random() * 9000),
        saleId, saleNumber,
        clientId: client.id, clientName: client.fullName,
        amount: initial,
        previousBalance: totalAmount,
        newBalance: outstandingBalance,
        paymentMethod: 'Efectivo',
        date: today,
        notes: saleType === 'contado' ? 'Pago de contado' : 'Cuota inicial',
        createdAt: new Date().toISOString()
      });
    }
    showToast('Venta registrada con éxito', 'success');
    this.closeSaleModal();
    renderSales(document.getElementById('main-content'));
  },

  // Payment Abono Module Handlers
  openPaymentModal() {
    document.getElementById('payment-form').reset();
    document.getElementById('pay-date').value = bogotaToday();
    document.getElementById('payment-debt-summary').classList.add('hidden');
    document.getElementById('payment-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  openPaymentForSale(saleId) {
    this.openPaymentModal();
    const select = document.getElementById('pay-sale-id');
    if (select) {
      select.value = saleId;
      this.onSelectSaleForPayment();
    }
  },

  closePaymentModal() {
    document.getElementById('payment-modal').classList.add('hidden');
  },

  onSelectSaleForPayment() {
    const saleId = document.getElementById('pay-sale-id').value;
    const summaryCard = document.getElementById('payment-debt-summary');
    if (!saleId) {
      summaryCard.classList.add('hidden');
      return;
    }

    const sales = db.getCollection('sales');
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      document.getElementById('pay-summary-total').innerText = formatCurrency(sale.totalAmount);
      document.getElementById('pay-summary-paid').innerText = formatCurrency(sale.totalPaid);
      document.getElementById('pay-summary-debt').innerText = formatCurrency(sale.outstandingBalance);
      summaryCard.classList.remove('hidden');
    }
  },

  savePayment(e) {
    e.preventDefault();
    const saleId = document.getElementById('pay-sale-id').value;
    const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
    const paymentMethod = document.getElementById('pay-method').value;
    const date = document.getElementById('pay-date').value;
    const notes = document.getElementById('pay-notes').value.trim();

    if (!saleId || amount <= 0) return showToast('Ingresa un monto de abono válido', 'warning');

    const sales = db.getCollection('sales');
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    // Derive the paid total from the payment records themselves rather than adding
    // onto sale.totalPaid: that stored value can be momentarily stale (a realtime echo
    // of an earlier save arriving late), which made consecutive abonos undercount.
    const paidBefore = db.getCollection('payments').filter(p => p.saleId === saleId).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const previousBalance = Math.max(0, (parseFloat(sale.totalAmount) || 0) - paidBefore);
    const newTotalPaid = paidBefore + amount;
    const newBalance = Math.max(0, (parseFloat(sale.totalAmount) || 0) - newTotalPaid);
    const newStatus = newBalance === 0 ? 'pagado' : sale.status;
    const receiptNumber = 'REC-' + Math.floor(1000 + Math.random() * 9000);

    // Update sale record
    db.updateItem('sales', saleId, {
      totalPaid: newTotalPaid,
      outstandingBalance: newBalance,
      status: newStatus
    });

    // Record payment receipt
    const newPayment = {
      id: 'pay-' + Date.now(),
      receiptNumber,
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      clientId: sale.clientId,
      clientName: sale.clientName,
      amount,
      previousBalance,
      newBalance,
      paymentMethod,
      date,
      notes,
      createdAt: new Date().toISOString()
    };
    db.addItem('payments', newPayment);

    // Confetti celebration if loan fully paid!
    if (newBalance === 0 && window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      showToast(`¡Crédito ${sale.saleNumber} PAGADO AL 100%! 🎉`, 'success');
    } else {
      showToast(`Abono de ${formatCurrency(amount)} registrado. Saldo restante: ${formatCurrency(newBalance)}`, 'success');
    }

    this.closePaymentModal();
    renderSales(document.getElementById('main-content'));
    window.collectionsModule?.refresh?.();
    this.openReceiptModal(newPayment.id);
  },

  openReceiptModal(paymentId) {
    const payments = db.getCollection('payments');
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return showToast('Comprobante no encontrado', 'error');

    const sales = db.getCollection('sales');
    const sale = sales.find(s => s.id === payment.saleId);

    const clients = db.getCollection('clients');
    const client = clients.find(c => c.id === payment.clientId);

    const receiptNumber = payment.receiptNumber || 'REC-' + payment.id.slice(-5);
    const saleNumber = payment.saleNumber || (sale ? sale.saleNumber : 'N/A');
    const clientName = payment.clientName || (client ? client.fullName : 'Cliente');
    const clientCc = client ? client.cc : 'N/A';
    const clientPhone = client ? client.phone : '';
    const date = payment.date || payment.createdAt;
    const paymentMethod = payment.paymentMethod || 'Efectivo';
    const notes = payment.notes || '';
    const amountPaid = parseFloat(payment.amount) || 0;
    
    // Balance calculations
    let previousBalance = payment.previousBalance;
    let newBalance = payment.newBalance;
    if (previousBalance === undefined || newBalance === undefined) {
      if (sale) {
        newBalance = parseFloat(sale.outstandingBalance) || 0;
        previousBalance = newBalance + amountPaid;
      } else {
        previousBalance = amountPaid;
        newBalance = 0;
      }
    }

    const itemsSummary = sale && sale.items && sale.items.length > 0
      ? sale.items.map(i => `${i.productName} (x${i.quantity})`).join(', ')
      : 'Venta comercial de productos / crédito';

    // Update WhatsApp link
    const waBtn = document.getElementById('btn-whatsapp-receipt');
    if (waBtn) {
      waBtn.href = generateWhatsAppPaymentReceipt(
        clientName,
        clientPhone,
        receiptNumber,
        saleNumber,
        amountPaid,
        previousBalance,
        newBalance,
        paymentMethod,
        date
      );
    }

    const receiptContainer = document.getElementById('printable-receipt');
    if (receiptContainer) {
      receiptContainer.innerHTML = paper({
        title: 'Comprobante de abono',
        number: receiptNumber,
        date: formatDate(date),
        footer: `<div style="width:170px;border-bottom:1px solid #94a3b8;margin-bottom:4px;height:22px;"></div>Firma recaudador / vendedor`,
        body: `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${docBox('Cliente', `<div style="font-size:14px;font-weight:700;">${esc(clientName)}</div>
              <div style="color:#5b6b7f;margin-top:3px;">Cédula: <b style="color:#0b1220;">${esc(clientCc || '—')}</b></div>
              <div style="color:#5b6b7f;">Teléfono: <b style="color:#0b1220;">${esc(clientPhone || 'No registrado')}</b></div>`)}
            ${docBox('Crédito', `<div style="font-size:14px;font-weight:700;font-family:'Courier New',monospace;color:#16a34a;">#${esc(saleNumber)}</div>
              <div style="color:#5b6b7f;margin-top:3px;">Medio de pago: <b style="color:#0b1220;">${esc(paymentMethod)}</b></div>
              ${notes ? `<div style="color:#5b6b7f;font-style:italic;">${esc(notes)}</div>` : ''}`)}
          </div>
          ${docBox('Concepto', `<div style="line-height:1.5;">${esc(itemsSummary)}</div>`)}
          <div style="display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:10px;text-align:center;">
            ${docBox('Saldo anterior', `<div style="font-size:15px;font-weight:700;font-family:'Courier New',monospace;">${formatCurrency(previousBalance)}</div>`)}
            ${docBox('Monto abonado', `<div style="font-size:19px;font-weight:800;font-family:'Courier New',monospace;color:#059669;">${formatCurrency(amountPaid)}</div>`, 'ok')}
            ${docBox('Nuevo saldo', `<div style="font-size:15px;font-weight:700;font-family:'Courier New',monospace;color:${newBalance === 0 ? '#059669' : '#d97706'};">${formatCurrency(newBalance)}</div>`)}
          </div>
          <div style="text-align:center;padding:11px;border-radius:12px;font-weight:600;${newBalance === 0 ? 'background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;' : 'background:#f1f5f9;color:#5b6b7f;border:1px solid #e2e8f0;'}">
            ${newBalance === 0 ? 'Crédito liquidado al 100%. ¡Gracias por tu pago!' : 'Abono registrado con éxito. Mantente al día para conservar tu buena calificación.'}
          </div>`
      });
      fitPaper(receiptContainer);
    }

    document.getElementById('receipt-modal').classList.remove('hidden');
    if (receiptContainer) fitPaper(receiptContainer);
    if (window.lucide) window.lucide.createIcons();
  },

  downloadReceiptPdf(btn) {
    const name = document.querySelector('#printable-receipt [style*="Courier"]')?.textContent.trim() || 'recibo';
    exportPdfById('printable-receipt', `Recibo-${name}.pdf`, btn);
  },

  closeReceiptModal() {
    document.getElementById('receipt-modal').classList.add('hidden');
  },

  openPaymentHistoryModal(saleId) {
    const sales = db.getCollection('sales');
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return showToast('Venta no encontrada', 'error');

    const payments = db.getCollection('payments').filter(p => p.saleId === saleId);
    const clients = db.getCollection('clients');
    const client = clients.find(c => c.id === sale.clientId);

    document.getElementById('history-modal-subtitle').innerText = `Venta ${sale.saleNumber} - ${sale.clientName}`;

    const container = document.getElementById('history-modal-content');
    if (!container) return;

    if (payments.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 rounded-xl space-y-2" style="color: var(--text-muted); background: var(--bg-card-hover); border: 1px solid var(--border-color);">
          <i data-lucide="receipt" class="w-8 h-8 mx-auto" style="color: var(--text-muted);"></i>
          <p class="text-sm">Aún no se han registrado abonos para esta venta.</p>
          <button onclick="window.salesModule.closePaymentHistoryModal(); window.salesModule.openPaymentForSale('${sale.id}')" class="btn-primary px-4 py-2 rounded-xl text-xs font-semibold">
            Registrar Primer Abono
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <!-- Summary Cards -->
        <div class="grid grid-cols-3 gap-3">
          <div class="p-3 rounded-xl text-center" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <span class="text-[10px] uppercase font-semibold block" style="color: var(--text-muted);">Total Venta</span>
            <span class="font-mono font-bold text-sm" style="color: var(--text-main);">${formatCurrency(sale.totalAmount)}</span>
          </div>
          <div class="p-3 rounded-xl text-center" style="background: var(--success-bg); border: 1px solid var(--success);">
            <span class="text-[10px] uppercase font-semibold block" style="color: var(--success);">Total Abonado</span>
            <span class="font-mono font-bold text-sm" style="color: var(--success);">${formatCurrency(sale.totalPaid)}</span>
          </div>
          <div class="p-3 rounded-xl text-center" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            <span class="text-[10px] uppercase font-semibold block" style="color: var(--text-muted);">Saldo Pendiente</span>
            <span class="font-mono font-bold text-sm" style="color: ${sale.outstandingBalance === 0 ? 'var(--success)' : 'var(--warning)'};">${formatCurrency(sale.outstandingBalance)}</span>
          </div>
        </div>

        <!-- Payments List -->
        <div class="overflow-x-auto rounded-xl" style="border: 1px solid var(--border-color);">
          <table class="w-full text-xs text-left" style="color: var(--text-muted);">
            <thead style="background: var(--bg-card-hover); color: var(--text-muted); border-bottom: 1px solid var(--border-color);">
              <tr>
                <th class="p-3">Recibo N°</th>
                <th class="p-3">Fecha</th>
                <th class="p-3">Método</th>
                <th class="p-3 text-right">Valor Abono</th>
                <th class="p-3 text-center">Comprobante</th>
              </tr>
            </thead>
            <tbody class="divide-y" style="border-color: var(--border-color);">
              ${payments.map(p => {
                const recNum = p.receiptNumber || 'REC-' + p.id.slice(-5);
                const clientPhone = client?.phone || '';
                const prevBal = p.previousBalance !== undefined ? p.previousBalance : (sale.totalAmount);
                const newBal = p.newBalance !== undefined ? p.newBalance : Math.max(0, prevBal - p.amount);
                const waUrl = generateWhatsAppPaymentReceipt(
                  p.clientName,
                  clientPhone,
                  recNum,
                  p.saleNumber,
                  p.amount,
                  prevBal,
                  newBal,
                  p.paymentMethod,
                  p.date
                );

                return `
                  <tr class="transition-colors" style="border-color: var(--border-color);" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'">
                    <td class="p-3 font-mono font-bold" style="color: var(--primary);">${recNum}</td>
                    <td class="p-3" style="color: var(--text-muted);">${formatDate(p.date || p.createdAt)}</td>
                    <td class="p-3" style="color: var(--text-muted);">
                      <span class="px-2 py-0.5 rounded font-medium" style="background: var(--bg-card-hover); color: var(--text-muted); border: 1px solid var(--border-color);">${p.paymentMethod || 'Efectivo'}</span>
                      ${p.notes ? `<div class="text-[10px] truncate max-w-xs" style="color: var(--text-muted);">${p.notes}</div>` : ''}
                    </td>
                    <td class="p-3 text-right font-mono font-bold text-sm" style="color: var(--success);">${formatCurrency(p.amount)}</td>
                    <td class="p-3 text-center">
                      <div class="flex items-center justify-center gap-1.5">
                        <button onclick="window.salesModule.openReceiptModal('${p.id}')" title="Ver e imprimir recibo" class="btn-primary px-2.5 py-1 rounded-lg font-medium text-xs flex items-center gap-1">
                          <i data-lucide="eye" class="w-3.5 h-3.5"></i> Recibo
                        </button>
                        <button onclick="window.salesModule.openEditPayment('${p.id}')" title="Editar abono" class="btn-glass p-1 rounded-lg"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                        <a href="${waUrl}" target="_blank" title="Enviar comprobante por WhatsApp" class="p-1 rounded-lg flex items-center justify-center" style="background: var(--success); color: var(--text-on-primary);">
                          <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    document.getElementById('payment-history-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  closePaymentHistoryModal() {
    document.getElementById('payment-history-modal').classList.add('hidden');
  },

  openEditSale(saleId) {
    const s = db.getCollection('sales').find(x => x.id === saleId);
    if (!s) return;
    const clients = db.getCollection('clients');
    const days = Array.isArray(s.paymentDays) ? s.paymentDays.join(',') : '';
    const inp = 'input-field w-full px-3 py-2 text-sm';
    const lbl = 'block text-xs font-semibold mb-1';
    const field = (label, html) => `<div><label class="${lbl}" style="color: var(--text-muted);">${label}</label>${html}</div>`;
    const num = (id, v) => `<input id="${id}" type="number" min="0" step="any" value="${v ?? ''}" class="${inp}">`;
    const opt = (v, cur, text) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${text}</option>`;
    closeEditModal();
    const wrap = document.createElement('div');
    wrap.id = 'edit-sale-modal';
    wrap.className = 'modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60';
    wrap.innerHTML = `
      <form class="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4" style="background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main);">
        <h3 class="text-lg font-bold">Editar venta ${s.saleNumber}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${field('Cliente', `<select id="es-client" class="${inp}">${clients.map(c => opt(c.id, s.clientId, c.fullName)).join('')}</select>`)}
          ${field('Vendedor (nombre)', `<input id="es-seller" type="text" value="${(s.sellerName || s.sellerUsername || '').replace(/"/g, '&quot;')}" class="${inp}">`)}
          ${field('Usuario vendedor (para notificaciones)', `<input id="es-seller-user" type="text" value="${s.sellerUsername || ''}" class="${inp}">`)}
          ${field('Fecha de venta', `<input id="es-date" type="date" value="${(s.date || s.createdAt || '').slice(0, 10)}" class="${inp}">`)}
          ${field('Tipo', `<select id="es-type" class="${inp}">${opt('credito', s.type, 'Crédito')}${opt('contado', s.type, 'Contado')}</select>`)}
          ${field('Frecuencia', `<select id="es-freq" class="${inp}">${opt('mensual', s.frequency, 'Mensual')}${opt('quincenal', s.frequency, 'Quincenal')}${opt('semanal', s.frequency, 'Semanal')}</select>`)}
          ${field('Valor total', num('es-total', s.totalAmount))}
          ${field('Cuota inicial', num('es-initial', s.initialPayment || 0))}
          ${field('N° de cuotas', num('es-count', s.installmentsCount))}
          ${field('Valor de cada cuota', num('es-inst', s.installmentAmount || ''))}
          ${field('Fecha de la primera cuota', `<input id="es-start" type="date" value="${s.startDate || ''}" class="${inp}">`)}
          ${field('Días de pago del mes (ej: 15,30)', `<input id="es-days" type="text" value="${days}" class="${inp}">`)}
        </div>
        ${field('Notas', `<textarea id="es-notes" rows="2" class="${inp}">${s.notes || ''}</textarea>`)}
        <p class="text-[11px]" style="color: var(--text-muted);">El total abonado se recalcula con la suma de los abonos registrados; el saldo y el estado se actualizan solos.</p>
        <div class="flex justify-between gap-2">
          <button type="button" onclick="window.salesModule.deleteSale('${s.id}')" class="px-3 py-2 rounded-xl text-xs font-semibold" style="color: #ef4444; border: 1px solid #ef4444;">Eliminar venta</button>
          <div class="flex gap-2">
            <button type="button" onclick="document.getElementById('edit-sale-modal').remove()" class="btn-glass px-4 py-2 rounded-xl text-sm font-semibold">Cancelar</button>
            <button type="submit" class="btn-primary px-5 py-2 rounded-xl text-sm font-semibold">Guardar</button>
          </div>
        </div>
      </form>`;
    wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); window.salesModule.saveEditSale(saleId); });
    document.body.appendChild(wrap);
  },

  saveEditSale(saleId) {
    const s = db.getCollection('sales').find(x => x.id === saleId);
    if (!s) return;
    const v = (id) => document.getElementById(id)?.value ?? '';
    const n = (id) => parseFloat(v(id)) || 0;
    const client = db.getCollection('clients').find(c => c.id === v('es-client'));
    let payments = db.getCollection('payments').filter(p => p.saleId === saleId);
    const total = n('es-total');
    const newInitial = n('es-initial');

    // The down payment made at sale time is ALSO stored as its own payment record
    // (id ending in "-i", see saveSale; or tagged by notes for sales imported from
    // Excel) so it shows up in receipts/history like any other abono. Keep that record
    // in sync when "Cuota inicial" is edited here, otherwise the balance below would
    // silently ignore the new value.
    const initialPay = payments.find(p => p.id.endsWith('-i') || /^(Cuota inicial|Pago de contado) \(importado\)$/.test(p.notes || ''));
    if (initialPay && newInitial <= 0) {
      db.deleteItem('payments', initialPay.id);
      payments = payments.filter(p => p.id !== initialPay.id);
    } else if (initialPay && (parseFloat(initialPay.amount) || 0) !== newInitial) {
      db.updateItem('payments', initialPay.id, { amount: newInitial });
      initialPay.amount = newInitial;
    } else if (!initialPay && newInitial > 0) {
      const newPay = {
        id: 'pay-' + Date.now() + '-i',
        receiptNumber: 'REC-' + Math.floor(1000 + Math.random() * 9000),
        saleId, saleNumber: s.saleNumber,
        clientId: client?.id || s.clientId, clientName: client?.fullName || s.clientName,
        amount: newInitial,
        previousBalance: total,
        newBalance: Math.max(0, total - newInitial),
        paymentMethod: 'Efectivo',
        date: v('es-date') || s.date,
        notes: 'Cuota inicial',
        createdAt: new Date().toISOString()
      };
      db.addItem('payments', newPay);
      payments.push(newPay);
    }

    const totalPaid = payments.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const days = v('es-days').split(/[,\s]+/).map(Number).filter(d => d >= 1 && d <= 31);
    const balance = Math.max(0, total - totalPaid);
    const patch = {
      clientId: client?.id || s.clientId,
      clientName: client?.fullName || s.clientName,
      sellerName: v('es-seller').trim() || null,
      sellerUsername: v('es-seller-user').trim().toLowerCase() || null,
      date: v('es-date') || s.date,
      type: v('es-type'),
      frequency: v('es-freq'),
      totalAmount: total,
      initialPayment: newInitial,
      installmentsCount: Math.max(1, Math.round(n('es-count')) || 1),
      installmentAmount: n('es-inst'),
      startDate: v('es-start') || null,
      paymentDays: days.length ? days : null,
      notes: v('es-notes').trim(),
      totalPaid,
      outstandingBalance: balance
    };
    patch.status = effectiveStatus({ ...s, ...patch });
    db.updateItem('sales', saleId, patch);
    if (client && client.id !== s.clientId) {
      payments.forEach(p => db.updateItem('payments', p.id, { clientId: client.id, clientName: client.fullName }));
    }
    payments.forEach(p => { if (p.saleNumber !== s.saleNumber) db.updateItem('payments', p.id, { saleNumber: s.saleNumber }); });
    closeEditModal();
    showToast('Venta actualizada', 'success');
    renderSales(document.getElementById('main-content'));
    window.collectionsModule?.refresh?.();
  },

  deleteSale(saleId) {
    const s = db.getCollection('sales').find(x => x.id === saleId);
    if (!s || !confirm(`¿Eliminar la venta ${s.saleNumber} y todos sus abonos? No se puede deshacer.`)) return;
    db.getCollection('payments').filter(p => p.saleId === saleId).forEach(p => db.deleteItem('payments', p.id));
    db.deleteItem('sales', saleId);
    closeEditModal();
    showToast('Venta eliminada', 'success');
    renderSales(document.getElementById('main-content'));
  },

  openEditPayment(paymentId) {
    const p = db.getCollection('payments').find(x => x.id === paymentId);
    if (!p) return;
    const inp = 'input-field w-full px-3 py-2 text-sm';
    const lbl = 'block text-xs font-semibold mb-1';
    const methods = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia Bancaria'];
    if (p.paymentMethod && !methods.includes(p.paymentMethod)) methods.push(p.paymentMethod);
    closeEditModal();
    const wrap = document.createElement('div');
    wrap.id = 'edit-sale-modal';
    wrap.className = 'modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60';
    wrap.innerHTML = `
      <form class="rounded-2xl w-full max-w-md p-5 space-y-3" style="background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main);">
        <h3 class="text-lg font-bold">Editar abono ${p.receiptNumber || ''}</h3>
        <div><label class="${lbl}" style="color: var(--text-muted);">Valor</label><input id="ep-amount" type="number" min="0" step="any" value="${p.amount}" class="${inp}"></div>
        <div><label class="${lbl}" style="color: var(--text-muted);">Fecha de pago</label><input id="ep-date" type="date" value="${(p.date || p.createdAt || '').slice(0, 10)}" class="${inp}"></div>
        <div><label class="${lbl}" style="color: var(--text-muted);">Método</label><select id="ep-method" class="${inp}">${methods.map(m => `<option ${m === (p.paymentMethod || 'Efectivo') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div><label class="${lbl}" style="color: var(--text-muted);">Notas</label><input id="ep-notes" type="text" value="${(p.notes || '').replace(/"/g, '&quot;')}" class="${inp}"></div>
        <div class="flex justify-between gap-2 pt-1">
          <button type="button" onclick="window.salesModule.deletePayment('${p.id}')" class="px-3 py-2 rounded-xl text-xs font-semibold" style="color: #ef4444; border: 1px solid #ef4444;">Eliminar</button>
          <div class="flex gap-2">
            <button type="button" onclick="document.getElementById('edit-sale-modal').remove()" class="btn-glass px-4 py-2 rounded-xl text-sm font-semibold">Cancelar</button>
            <button type="submit" class="btn-primary px-5 py-2 rounded-xl text-sm font-semibold">Guardar</button>
          </div>
        </div>
      </form>`;
    wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); window.salesModule.saveEditPayment(paymentId); });
    document.body.appendChild(wrap);
  },

  saveEditPayment(paymentId) {
    const p = db.getCollection('payments').find(x => x.id === paymentId);
    if (!p) return;
    const amount = parseFloat(document.getElementById('ep-amount').value) || 0;
    if (amount <= 0) return showToast('Ingresa un valor válido', 'warning');
    db.updateItem('payments', paymentId, {
      amount,
      date: document.getElementById('ep-date').value || p.date,
      paymentMethod: document.getElementById('ep-method').value,
      notes: document.getElementById('ep-notes').value.trim()
    });
    afterPaymentChange(p.saleId);
    showToast('Abono actualizado', 'success');
  },

  deletePayment(paymentId) {
    const p = db.getCollection('payments').find(x => x.id === paymentId);
    if (!p || !confirm('¿Eliminar este abono?')) return;
    db.deleteItem('payments', paymentId);
    afterPaymentChange(p.saleId);
    showToast('Abono eliminado', 'success');
  }
};

function closeEditModal() {
  document.getElementById('edit-sale-modal')?.remove();
}

function afterPaymentChange(saleId) {
  const s = db.getCollection('sales').find(x => x.id === saleId);
  if (s) {
    const totalPaid = db.getCollection('payments').filter(p => p.saleId === saleId).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const patch = { totalPaid, outstandingBalance: Math.max(0, (parseFloat(s.totalAmount) || 0) - totalPaid) };
    patch.status = effectiveStatus({ ...s, ...patch });
    db.updateItem('sales', saleId, patch);
  }
  closeEditModal();
  renderSales(document.getElementById('main-content'));
  window.salesModule.openPaymentHistoryModal(saleId);
  window.collectionsModule?.refresh?.();
}

