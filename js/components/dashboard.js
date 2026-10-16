/**
 * JocoAdmin - Dashboard Component
 * Render KPIs, Financial Charts, Recent Sales, Overdue Alerts & Reminders
 */

import { db } from '../db.js';
import { getDueToday, effectiveStatus, installmentValue, nextDue } from '../due.js';
import { isAdmin, getMyUsername } from '../permissions.js';
import { formatCurrency, formatDate, getClientTypeBadgeHtml, generateWhatsAppReminder } from '../utils.js';

let chartInstanceSales = null;
let chartInstanceClients = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function renderDashboard(container) {
  const sales = db.getCollection('sales');
  const payments = db.getCollection('payments');
  const clients = db.getCollection('clients');

  // Compute Metrics
  const totalSalesCount = sales.length;
  const totalSalesAmount = sales.reduce((acc, s) => acc + (parseFloat(s.totalAmount) || 0), 0);
  const totalPaidAmount = sales.reduce((acc, s) => acc + (parseFloat(s.totalPaid) || 0), 0);
  const totalOutstandingDebt = sales.reduce((acc, s) => acc + (parseFloat(s.outstandingBalance) || 0), 0);

  // Clients breakdown by type
  const tipo1Count = clients.filter(c => c.type === 'tipo-1').length;
  const tipo2Count = clients.filter(c => c.type === 'tipo-2').length;
  const tipo3Count = clients.filter(c => c.type === 'tipo-3').length;

  // Overdue sales
  const overdueSales = sales
    .filter(s => effectiveStatus(s) === 'mora')
    .sort((a, b) => (nextDue(b)?.daysOverdue || 0) - (nextDue(a)?.daysOverdue || 0));

  // "Cobros de hoy": admins see every seller's collections, sellers only their own sales.
  const me = getMyUsername();
  const visibleSales = isAdmin() || !me ? sales : sales.filter((s) => s.sellerUsername === me);
  const dueToday = getDueToday(visibleSales, clients);
  const dueTotal = dueToday.reduce((acc, x) => acc + installmentValue(x.sale), 0);
  const dueHtml = `
      <div class="glass-panel p-6 space-y-4">
        <div class="flex items-center justify-between gap-3 pb-3" style="border-bottom: 1px solid var(--border-color);">
          <div class="flex items-center gap-2 min-w-0">
            <div class="p-2 rounded-lg" style="background: var(--warning-bg); color: var(--warning);">
              <i data-lucide="calendar-clock" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0">
              <h3 class="text-base font-bold" style="color: var(--text-main);">Cobros de hoy</h3>
              <p class="text-xs" style="color: var(--text-muted);">${dueToday.length === 0 ? 'Nadie debe pagar hoy' : `${dueToday.length} ${dueToday.length === 1 ? 'cliente debe' : 'clientes deben'} pagar hoy &bull; ${formatCurrency(dueTotal)}`}${isAdmin() ? ' &bull; todos los vendedores' : ''}</p>
            </div>
          </div>
        </div>
        ${dueToday.length > 0 ? `<button onclick="window.app.switchTab('today')" class="text-xs font-semibold hover:underline" style="color: var(--primary);">Ver lista completa &rarr;</button>` : ''}
        ${dueToday.length === 0 ? `
          <div class="text-center py-6 text-sm" style="color: var(--text-muted);">
            <i data-lucide="check-circle-2" class="w-7 h-7 mx-auto mb-2" style="color: var(--success);"></i>
            No hay cuotas que venzan hoy.
          </div>
        ` : `
          <div class="space-y-3 max-h-80 overflow-y-auto pr-1">
            ${dueToday.map(({ sale: s, installment, reason, daysOverdue }) => {
              const client = clients.find((c) => c.id === s.clientId) || {};
              const cuota = installmentValue(s);
              const waUrl = generateWhatsAppReminder(s.clientName, client.phone || '', s.saleNumber, cuota, formatDate(new Date().toISOString()));
              const reasonLabel = reason === 'promised' ? 'Fecha de pago acordada' : 'Cuota ' + installment + ' de ' + (s.installmentsCount || 1);
              return `
                <div class="p-3.5 rounded-xl flex items-center justify-between gap-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
                  <div class="space-y-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-sm" style="color: var(--text-main);">${s.clientName}</span>
                      ${getClientTypeBadgeHtml(client.type || 'tipo-1')}
                      ${reason === 'overdue' ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold" style="background: var(--danger-bg); color: var(--danger);">También en mora</span>` : ''}
                    </div>
                    <p class="text-xs" style="color: var(--text-muted);">
                      Venta <strong style="color: var(--text-main);">${s.saleNumber}</strong> &bull; ${reasonLabel}
                      &bull; Vendedor: <strong style="color: var(--text-main);">${s.sellerName || s.sellerUsername || 'Sin vendedor'}</strong>
                    </p>
                    ${reason === 'overdue' ? `<p class="text-[11px] font-semibold" style="color: var(--danger);">Además tiene ${daysOverdue} días de atraso en cuotas anteriores</p>` : ''}
                    <p class="text-sm font-extrabold" style="color: var(--warning);">${formatCurrency(cuota)}</p>
                  </div>
                  <button onclick="window.reminderModule.open('${s.id}')" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5" style="background: var(--success); color: var(--text-on-primary);">
                    <i data-lucide="message-square" class="w-3.5 h-3.5"></i> Recordar
                  </button>
                </div>`;
            }).join('')}
          </div>
        `}
      </div>`;
  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">

      <!-- Top Banner / Hero -->
      <div class="glass-panel p-6 sm:p-8 relative overflow-hidden flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
        <div class="relative z-10 space-y-2 max-w-2xl min-w-0">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold" style="background: var(--primary-container); color: var(--primary); border: 1px solid var(--border-color);">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Gestión de Ventas & Cartera en Tiempo Real
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight" style="color: var(--text-main);">Panel Principal de Control</h1>
          <p class="text-sm sm:text-base" style="color: var(--text-muted);">
            Bienvenido a <strong>OP</strong>. Monitorea el estado de tus créditos, pagos recibidos, cartera pendiente y comportamiento de tus clientes.
          </p>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 w-full xl:w-auto flex-shrink-0">
          <button onclick="window.app.switchTab('sales', 'new-sale')" class="btn-primary sm:flex-1 xl:flex-none whitespace-nowrap px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2">
            <i data-lucide="plus-circle" class="w-4 h-4"></i> Nueva Venta / Crédito
          </button>
          <button onclick="window.app.switchTab('sales', 'new-payment')" class="btn-glass sm:flex-1 xl:flex-none whitespace-nowrap px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2">
            <i data-lucide="dollar-sign" class="w-4 h-4"></i> Registrar Abono
          </button>
        </div>
      </div>

      ${dueHtml}

      <!-- Metric Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <!-- Total Ventas -->
        <div class="glass-panel p-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Total Ventas</span>
            <div class="p-2.5 rounded-xl" style="background: var(--primary-container); color: var(--primary);">
              <i data-lucide="shopping-bag" class="w-5 h-5"></i>
            </div>
          </div>
          <div>
            <h3 class="text-2xl font-bold" style="color: var(--text-main);">${formatCurrency(totalSalesAmount)}</h3>
            <p class="text-xs mt-1" style="color: var(--text-muted);">${totalSalesCount} operaciones registradas</p>
          </div>
        </div>

        <!-- Total Recaudado -->
        <div class="glass-panel p-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Total Recaudado</span>
            <div class="p-2.5 rounded-xl" style="background: var(--success-bg); color: var(--success);">
              <i data-lucide="check-check" class="w-5 h-5"></i>
            </div>
          </div>
          <div>
            <h3 class="text-2xl font-bold" style="color: var(--success);">${formatCurrency(totalPaidAmount)}</h3>
            <p class="text-xs mt-1" style="color: var(--text-muted);">Ingresos efectivos cobrados</p>
          </div>
        </div>

        <!-- Cartera Pendiente (Por cobrar) -->
        <div class="glass-panel p-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Cartera Pendiente</span>
            <div class="p-2.5 rounded-xl" style="background: var(--warning-bg); color: var(--warning);">
              <i data-lucide="clock" class="w-5 h-5"></i>
            </div>
          </div>
          <div>
            <h3 class="text-2xl font-bold" style="color: var(--warning);">${formatCurrency(totalOutstandingDebt)}</h3>
            <p class="text-xs mt-1" style="color: var(--text-muted);">Saldo en cuotas por cobrar</p>
          </div>
        </div>

        <!-- Alertas de Mora -->
        <div class="glass-panel p-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Créditos en Mora</span>
            <div class="p-2.5 rounded-xl" style="background: var(--danger-bg); color: var(--danger);">
              <i data-lucide="alert-octagon" class="w-5 h-5"></i>
            </div>
          </div>
          <div>
            <h3 class="text-2xl font-bold" style="color: var(--danger);">${overdueSales.length} Clientes</h3>
            <p class="text-xs mt-1" style="color: var(--text-muted);">Requieren cobro inmediato</p>
          </div>
        </div>

      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Financial Overview Chart -->
        <div class="glass-panel p-6 lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold" style="color: var(--text-main);">Resumen de Cartera y Cobros</h3>
              <p class="text-xs" style="color: var(--text-muted);">Comparativa entre ventas totales, recaudado y saldo por cobrar</p>
            </div>
            <div class="p-2 rounded-lg" style="background: var(--bg-card-hover); color: var(--text-muted);">
              <i data-lucide="bar-chart-3" class="w-5 h-5"></i>
            </div>
          </div>
          <div class="h-64 relative">
            <canvas id="chart-financial-overview"></canvas>
          </div>
        </div>

        <!-- Client Type Distribution Donut -->
        <div class="glass-panel p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold" style="color: var(--text-main);">Calidad de Clientes</h3>
              <p class="text-xs" style="color: var(--text-muted);">Distribución por Tipo (1, 2 y 3)</p>
            </div>
            <div class="p-2 rounded-lg" style="background: var(--bg-card-hover); color: var(--text-muted);">
              <i data-lucide="pie-chart" class="w-5 h-5"></i>
            </div>
          </div>
          <div class="h-64 relative flex items-center justify-center">
            <canvas id="chart-clients-distribution"></canvas>
          </div>
        </div>

      </div>

      <!-- Overdue & Reminders Section -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Urgent Reminders Widget -->
        <div class="glass-panel p-6 space-y-4">
          <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
            <div class="flex items-center gap-2">
              <div class="p-2 rounded-lg" style="background: var(--danger-bg); color: var(--danger);">
                <i data-lucide="bell-ring" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-bold" style="color: var(--text-main);">Recordatorios de Cobro (Mora)</h3>
                <p class="text-xs" style="color: var(--text-muted);">Clientes atrasados con saldos pendientes</p>
              </div>
            </div>
            <button onclick="window.app.switchTab('portfolio')" class="text-xs font-semibold hover:underline" style="color: var(--primary);">
              Ver Todos &rarr;
            </button>
          </div>

          <div class="space-y-3 max-h-72 overflow-y-auto pr-1">
            ${overdueSales.length === 0 ? `
              <div class="text-center py-8 text-sm" style="color: var(--text-muted);">
                <i data-lucide="smile" class="w-8 h-8 mx-auto mb-2" style="color: var(--success);"></i>
                ¡Excelente! No tienes clientes con cobros en mora actualmente.
              </div>
            ` : overdueSales.map(s => {
              const client = clients.find(c => c.id === s.clientId) || {};
              const cuota = installmentValue(s);
              const waUrl = generateWhatsAppReminder(
                s.clientName,
                client.phone || '',
                s.saleNumber,
                cuota,
                nextDue(s)?.date || s.startDate
              );
              return `
                <div class="p-3.5 rounded-xl flex items-center justify-between gap-3" style="background: var(--bg-card-hover); border: 1px solid var(--danger);">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-sm" style="color: var(--text-main);">${s.clientName}</span>
                      ${getClientTypeBadgeHtml(client.type || 'tipo-1')}
                    </div>
                    <p class="text-xs" style="color: var(--text-muted);">
                      Venta: <strong style="color: var(--text-main);">${s.saleNumber}</strong> &bull; Deuda: <strong style="color: var(--danger);">${formatCurrency(s.outstandingBalance)}</strong> &bull; ${nextDue(s)?.daysOverdue || 0} días de atraso
                    </p>
                  </div>
                  <button onclick="window.reminderModule.open('${s.id}')" class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5" style="background: var(--success); color: var(--text-on-primary);">
                    <i data-lucide="message-square" class="w-3.5 h-3.5"></i> Recordar WA
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Recent Payments Received -->
        <div class="glass-panel p-6 space-y-4">
          <div class="flex items-center justify-between pb-3" style="border-bottom: 1px solid var(--border-color);">
            <div class="flex items-center gap-2">
              <div class="p-2 rounded-lg" style="background: var(--success-bg); color: var(--success);">
                <i data-lucide="history" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-bold" style="color: var(--text-main);">Últimos Abonos Recibidos</h3>
                <p class="text-xs" style="color: var(--text-muted);">Historial reciente de recaudo</p>
              </div>
            </div>
            <button onclick="window.app.switchTab('sales')" class="text-xs font-semibold hover:underline" style="color: var(--primary);">
              Ver Historial &rarr;
            </button>
          </div>

          <div class="space-y-3 max-h-72 overflow-y-auto pr-1">
            ${payments.slice(0, 5).map(p => `
              <div class="p-3.5 rounded-xl flex items-center justify-between gap-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-sm" style="color: var(--text-main);">${p.clientName}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-medium" style="background: var(--primary-container); color: var(--primary);">${p.paymentMethod}</span>
                  </div>
                  <p class="text-xs" style="color: var(--text-muted);">
                    Venta: <strong style="color: var(--text-main);">${p.saleNumber}</strong> &bull; ${formatDate(p.date)}
                  </p>
                </div>
                <div class="text-right">
                  <span class="text-sm font-extrabold" style="color: var(--success);">+ ${formatCurrency(p.amount)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Render Chart.js visual graphics
  renderCharts(totalSalesAmount, totalPaidAmount, totalOutstandingDebt, tipo1Count, tipo2Count, tipo3Count);
}

let lastChartArgs = null;
window.addEventListener('themechange', () => {
  if (lastChartArgs && document.getElementById('chart-financial-overview')) renderCharts(...lastChartArgs);
});

function renderCharts(salesTotal, paidTotal, debtTotal, t1, t2, t3) {
  lastChartArgs = [salesTotal, paidTotal, debtTotal, t1, t2, t3];
  if (!window.Chart) return;

  const tickColor = cssVar('--text-muted') || '#94a3b8';
  const gridColor = cssVar('--border-color') || 'rgba(148, 163, 184, 0.15)';
  const legendColor = cssVar('--text-main') || '#f8fafc';
  const cardBg = cssVar('--bg-card-solid') || '#1e293b';

  const ctxOverview = document.getElementById('chart-financial-overview')?.getContext('2d');
  if (ctxOverview) {
    if (chartInstanceSales) chartInstanceSales.destroy();
    chartInstanceSales = new window.Chart(ctxOverview, {
      type: 'bar',
      data: {
        labels: ['Ventas Totales', 'Recaudado Efectivo', 'Cartera por Cobrar'],
        datasets: [{
          label: 'Monto COP ($)',
          data: [salesTotal, paidTotal, debtTotal],
          backgroundColor: [
            `rgba(${cssVar('--primary-rgb') || '34, 197, 94'}, 0.85)`,
            'rgba(5, 150, 105, 0.85)',
            'rgba(217, 119, 6, 0.85)'
          ],
          borderRadius: 8,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: tickColor }, grid: { display: false } },
          y: {
            ticks: {
              color: tickColor,
              callback: (val) => '$ ' + (val / 1000000).toFixed(1) + 'M'
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  }

  const ctxClients = document.getElementById('chart-clients-distribution')?.getContext('2d');
  if (ctxClients) {
    if (chartInstanceClients) chartInstanceClients.destroy();
    chartInstanceClients = new window.Chart(ctxClients, {
      type: 'doughnut',
      data: {
        labels: ['Tipo 1 (Excelente)', 'Tipo 2 (Regular)', 'Tipo 3 (Riesgoso)'],
        datasets: [{
          data: [t1, t2, t3],
          backgroundColor: [
            'rgba(5, 150, 105, 0.85)',
            'rgba(217, 119, 6, 0.85)',
            'rgba(225, 29, 72, 0.85)'
          ],
          borderWidth: 2,
          borderColor: cardBg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: legendColor, font: { family: "'Inter', system-ui, sans-serif", size: 11 } }
          }
        }
      }
    });
  }
}
