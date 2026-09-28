/**
 * JocoAdmin - Portfolio Control & Payment Reminders Component
 * Track who pays vs. who doesn't, filter by Client Quality (Tipo 1, 2, 3), and send WhatsApp reminders.
 */

import { db } from '../db.js';
import { formatCurrency, formatDate, getClientTypeBadgeHtml, generateWhatsAppReminder } from '../utils.js';
import { renderCollections } from './collections.js';
import { effectiveStatus, installmentValue, nextDue } from '../due.js';

export function renderPortfolio(container) {
  const sales = db.getCollection('sales');
  const clients = db.getCollection('clients');

  // Filter Active Credits (with debt > 0)
  const activeCredits = sales.filter(s => s.outstandingBalance > 0);
  const paidCredits = sales.filter(s => effectiveStatus(s) === 'pagado');

  // Overdue vs On Time Breakdown
  const moraCredits = activeCredits.filter(s => effectiveStatus(s) === 'mora');
  const alDiaCredits = activeCredits.filter(s => effectiveStatus(s) === 'al_dia');

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">

      <div class="inline-flex items-center gap-1 p-1 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
        <button id="pview-cartera" onclick="window.portfolioModule.setView('cartera')" class="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="wallet" class="w-3.5 h-3.5"></i> Cartera</button>
        <button id="pview-recaudos" onclick="window.portfolioModule.setView('recaudos')" class="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="trending-up" class="w-3.5 h-3.5"></i> Recaudos</button>
      </div>

      <div id="portfolio-cartera" class="space-y-6">
      <!-- Top Action Bar -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight" style="color: var(--text-main);">Control de Cartera & Recordatorios de Cobro</h1>
          <p class="text-sm" style="color: var(--text-muted);">Monitorea quiénes pagan a tiempo, identifica morosos y envía recordatorios directos por WhatsApp.</p>
        </div>

        <div class="flex items-center gap-2 p-1.5 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
          <button onclick="window.portfolioModule.setTab('mora')" id="tab-btn-mora" class="px-4 py-2 rounded-lg text-xs font-semibold transition-all" style="background: var(--danger); color: var(--text-on-primary);">
            <i data-lucide="alert-octagon" class="w-3.5 h-3.5 inline mr-1"></i> En Mora (${moraCredits.length})
          </button>
          <button onclick="window.portfolioModule.setTab('al_dia')" id="tab-btn-al_dia" class="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80" style="color: var(--text-muted);">
            <i data-lucide="check-circle" class="w-3.5 h-3.5 inline mr-1"></i> Al Día (${alDiaCredits.length})
          </button>
          <button onclick="window.portfolioModule.setTab('pagado')" id="tab-btn-pagado" class="px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80" style="color: var(--text-muted);">
            <i data-lucide="award" class="w-3.5 h-3.5 inline mr-1"></i> Liquidados (${paidCredits.length})
          </button>
        </div>
      </div>

      <!-- Portfolio Metric Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div class="glass-panel p-5 space-y-2 border-l-4" style="border-left-color: var(--danger);">
          <span class="text-xs font-semibold uppercase" style="color: var(--text-muted);">Total Cartera Morosa</span>
          <h3 class="text-2xl font-bold" style="color: var(--danger);">
            ${formatCurrency(moraCredits.reduce((acc, s) => acc + s.outstandingBalance, 0))}
          </h3>
          <p class="text-xs font-medium" style="color: var(--text-muted);">${moraCredits.length} clientes con atrasos</p>
        </div>

        <div class="glass-panel p-5 space-y-2 border-l-4" style="border-left-color: var(--warning);">
          <span class="text-xs font-semibold uppercase" style="color: var(--text-muted);">Total Cartera Al Día</span>
          <h3 class="text-2xl font-bold" style="color: var(--warning);">
            ${formatCurrency(alDiaCredits.reduce((acc, s) => acc + s.outstandingBalance, 0))}
          </h3>
          <p class="text-xs font-medium" style="color: var(--text-muted);">${alDiaCredits.length} créditos al corriente</p>
        </div>

        <div class="glass-panel p-5 space-y-2 border-l-4" style="border-left-color: var(--success);">
          <span class="text-xs font-semibold uppercase" style="color: var(--text-muted);">Total Créditos Pagados</span>
          <h3 class="text-2xl font-bold" style="color: var(--success);">
            ${formatCurrency(paidCredits.reduce((acc, s) => acc + s.totalAmount, 0))}
          </h3>
          <p class="text-xs font-medium" style="color: var(--text-muted);">${paidCredits.length} créditos finalizados al 100%</p>
        </div>

      </div>

      <!-- Portfolio Table -->
      <div class="glass-panel overflow-hidden">
        <div class="p-4 flex items-center justify-between gap-4" style="border-bottom: 1px solid var(--border-color);">
          <h3 id="portfolio-table-title" class="text-base font-bold" style="color: var(--text-main);">Créditos en Estado de Mora / Cobro Urgente</h3>
          <div class="flex items-center gap-2">
            <select id="portfolio-filter-type" onchange="window.portfolioModule.renderTable()" class="input-field rounded-xl px-3 py-1.5 text-xs">
              <option value="all">Todas las Calidades</option>
              <option value="tipo-1">Tipo 1 (Excelente)</option>
              <option value="tipo-2">Tipo 2 (Regular)</option>
              <option value="tipo-3">Tipo 3 (Riesgoso)</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm" style="color: var(--text-muted);">
            <thead class="text-xs font-semibold uppercase" style="background: var(--bg-card-hover); color: var(--text-muted); border-bottom: 1px solid var(--border-color);">
              <tr>
                <th class="px-5 py-3.5">Cliente & Calidad</th>
                <th class="px-5 py-3.5">N° Venta</th>
                <th class="px-5 py-3.5">Vendedor</th>
                <th class="px-5 py-3.5 text-right">Monto Total</th>
                <th class="px-5 py-3.5 text-right" style="color: var(--success);">Total Abonado</th>
                <th class="px-5 py-3.5 text-right font-bold" style="color: var(--warning);">Deuda Restante</th>
                <th class="px-5 py-3.5">Próximo pago</th>
                <th class="px-5 py-3.5 text-center">Acción de Cobro</th>
              </tr>
            </thead>
            <tbody id="portfolio-tbody" class="divide-y divide-[var(--border-color)]">
              <!-- Dynamically Populated -->
            </tbody>
          </table>
        </div>
      </div>

      </div>
      <div id="portfolio-recaudos" class="hidden"></div>

    </div>
  `;

  window.portfolioModule.setView(activeView);
  window.portfolioModule.renderTable();
  if (window.lucide) window.lucide.createIcons();
}

let activePortfolioTab = 'mora';
let activeView = 'cartera';

window.portfolioModule = {
  setView(view) {
    activeView = view;
    const on = 'px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md';
    const off = 'px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:opacity-80';
    [['cartera', 'pview-cartera'], ['recaudos', 'pview-recaudos']].forEach(([v, id]) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.className = v === view ? on : off;
      b.style.background = v === view ? 'var(--primary-gradient)' : '';
      b.style.color = v === view ? 'var(--text-on-primary)' : 'var(--text-muted)';
    });
    document.getElementById('portfolio-cartera')?.classList.toggle('hidden', view !== 'cartera');
    const rec = document.getElementById('portfolio-recaudos');
    if (rec) {
      rec.classList.toggle('hidden', view !== 'recaudos');
      if (view === 'recaudos') { renderCollections(rec); if (window.lucide) window.lucide.createIcons(); }
    }
  },

  setTab(tab) {
    activePortfolioTab = tab;
    
    // Update button styles
    ['mora', 'al_dia', 'pagado'].forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      if (btn) {
        if (t === tab) {
          btn.className = 'px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md';
          btn.style.background = 'var(--primary-gradient)';
          btn.style.color = 'var(--text-on-primary)';
        } else {
          btn.className = 'px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80';
          btn.style.background = '';
          btn.style.color = 'var(--text-muted)';
        }
      }
    });

    const titleMap = {
      'mora': 'Créditos en Estado de Mora / Cobro Urgente',
      'al_dia': 'Créditos Vigentes al Día',
      'pagado': 'Historial de Créditos Liquidados y Cancelados'
    };
    document.getElementById('portfolio-table-title').innerText = titleMap[tab] || 'Control de Cartera';

    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('portfolio-tbody');
    if (!tbody) return;

    const sales = db.getCollection('sales');
    const clients = db.getCollection('clients');
    const typeFilter = document.getElementById('portfolio-filter-type')?.value || 'all';

    let filteredSales = sales.filter(s => {
      if (activePortfolioTab === 'mora') return effectiveStatus(s) === 'mora';
      if (activePortfolioTab === 'al_dia') return effectiveStatus(s) === 'al_dia';
      if (activePortfolioTab === 'pagado') return effectiveStatus(s) === 'pagado';
      return true;
    });

    if (typeFilter !== 'all') {
      filteredSales = filteredSales.filter(s => {
        const c = clients.find(cl => cl.id === s.clientId);
        return c && c.type === typeFilter;
      });
    }

    if (filteredSales.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8" style="color: var(--text-muted);">No hay créditos registrados en esta sección.</td></tr>`;
      return;
    }

    filteredSales.sort((a, b) => (nextDue(b)?.daysOverdue || 0) - (nextDue(a)?.daysOverdue || 0));

    tbody.innerHTML = filteredSales.map(s => {
      const client = clients.find(c => c.id === s.clientId) || {};
      const cuota = installmentValue(s);
      const nd = nextDue(s);
      const waUrl = generateWhatsAppReminder(
        s.clientName,
        client.phone || '',
        s.saleNumber,
        cuota,
        nd?.date || s.startDate
      );

      return `
        <tr class="transition-colors hover:bg-[var(--bg-card-hover)]">
          <td class="px-5 py-4">
            <div class="font-bold" style="color: var(--text-main);">${s.clientName}</div>
            <div class="mt-1">${getClientTypeBadgeHtml(client.type || 'tipo-1')}</div>
            ${client.promisedAmount ? `<div class="text-[11px] mt-1" style="color: var(--text-muted);">Abono acordado: <strong style="color: var(--text-main);">${formatCurrency(client.promisedAmount)}</strong></div>` : ''}
            ${client.sheetNote ? `<div class="text-[11px] mt-1 font-semibold" style="color: var(--warning);">${client.sheetNote}</div>` : ''}
          </td>
          <td class="px-5 py-4 font-mono font-bold text-xs" style="color: var(--primary);">${s.saleNumber}</td>
          <td class="px-5 py-4 text-xs" style="color: var(--text-muted);">${s.sellerName || s.sellerUsername || '—'}</td>
          <td class="px-5 py-4 text-right font-mono" style="color: var(--text-main);">${formatCurrency(s.totalAmount)}</td>
          <td class="px-5 py-4 text-right font-mono font-semibold" style="color: var(--success);">${formatCurrency(s.totalPaid)}</td>
          <td class="px-5 py-4 text-right font-mono font-extrabold text-base" style="color: var(--warning);">
            ${formatCurrency(s.outstandingBalance)}
          </td>
          <td class="px-5 py-4 text-xs" style="color: var(--text-muted);">
            ${nd ? `
              <div class="font-semibold" style="color: var(--text-main);">${formatDate(nd.date)}</div>
              <div>Cuota ${nd.number} de ${s.installmentsCount} &bull; ${formatCurrency(cuota)}</div>
              <div class="font-bold" style="color: ${nd.daysOverdue > 0 ? 'var(--danger)' : 'var(--success)'};">${nd.daysOverdue > 0 ? nd.daysOverdue + ' días de atraso' : 'Al día'}</div>
            ` : '—'}
            ${client.nextPaymentDate ? `<div class="mt-1" style="color: var(--primary);">Pago acordado: ${formatDate(client.nextPaymentDate)}</div>` : ''}
            <div class="opacity-70">${s.installmentsCount} cuotas ${s.frequency}</div>
          </td>
          <td class="px-5 py-4 text-center">
            ${s.outstandingBalance > 0 ? `
              <button onclick="window.reminderModule.open('${s.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mx-auto w-fit" style="background: var(--success); color: var(--text-on-primary);">
                <i data-lucide="message-square" class="w-3.5 h-3.5"></i> Enviar Recordatorio
              </button>
            ` : `
              <span class="text-xs font-bold flex items-center justify-center gap-1" style="color: var(--success);">
                <i data-lucide="check-circle-2" class="w-4 h-4"></i> Paz y Salvo
              </span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }
};
