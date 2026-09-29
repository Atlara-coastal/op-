/**
 * JocoAdmin - Recaudos (collections): daily / weekly / monthly / yearly totals of payments received.
 * Rendered inside the Cartera tab.
 */
import { db } from '../db.js';
import { addDays, addMonths, bogotaToday } from '../due.js';
import { formatCurrency, formatDate } from '../utils.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// custom = the user picked the dates by hand; otherwise the range is recomputed on
// every render so it follows "today" (an app left open past midnight would otherwise
// keep yesterday as the end date and hide today's payments).
const state = { group: 'day', from: '', to: '', seller: 'all', custom: false };
let chart = null;

const dow = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
const weekStart = (iso) => addDays(iso, -dow(iso));
const monthStart = (iso) => iso.slice(0, 8) + '01';

function defaults(group, today) {
  state.to = today;
  state.from = group === 'day' ? addDays(today, -29)
    : group === 'week' ? addDays(weekStart(today), -7 * 11)
    : group === 'month' ? addMonths(monthStart(today), -11)
    : '2020-01-01';
}

function keyOf(date, group) {
  if (group === 'day') return date;
  if (group === 'week') return weekStart(date);
  if (group === 'month') return date.slice(0, 7);
  return date.slice(0, 4);
}

function labelOf(key, group) {
  if (group === 'day') return formatDate(key + 'T12:00:00');
  if (group === 'week') return `${formatDate(key + 'T12:00:00')} – ${formatDate(addDays(key, 6) + 'T12:00:00')}`;
  if (group === 'month') return `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
  return key;
}

function allPayments() {
  const sales = db.getCollection('sales');
  return db.getCollection('payments').map((p) => {
    const s = sales.find((x) => x.id === p.saleId) || {};
    return {
      id: p.id,
      date: String(p.date || p.createdAt || '').slice(0, 10),
      amount: parseFloat(p.amount) || 0,
      client: p.clientName || s.clientName || '',
      sale: p.saleNumber || s.saleNumber || '',
      seller: s.sellerUsername || s.sellerName || 'Sin vendedor',
      method: p.paymentMethod || 'Efectivo'
    };
  }).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));
}

const sum = (list) => list.reduce((a, p) => a + p.amount, 0);

export function renderCollections(container) {
  const today = bogotaToday();
  if (!state.custom) defaults(state.group, today);
  const payments = allPayments();
  const sellers = [...new Set(payments.map((p) => p.seller))].sort();
  const scoped = state.seller === 'all' ? payments : payments.filter((p) => p.seller === state.seller);

  const inRange = (from, to) => scoped.filter((p) => p.date >= from && p.date <= to);
  const kpis = [
    ['hoy', inRange(today, today)],
    ['esta semana', inRange(weekStart(today), today)],
    ['este mes', inRange(monthStart(today), today)],
    ['este año', inRange(today.slice(0, 4) + '-01-01', today)]
  ];

  const rangeList = inRange(state.from, state.to);
  const groups = new Map();
  rangeList.forEach((p) => {
    const k = keyOf(p.date, state.group);
    const g = groups.get(k) || { key: k, count: 0, total: 0 };
    g.count++; g.total += p.amount;
    groups.set(k, g);
  });
  const rows = [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  const byMethod = {};
  rangeList.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; });
  const detail = [...rangeList].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 300);
  const seg = (val, text) => `<button onclick="window.collectionsModule.setGroup('${val}')" class="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all" style="${state.group === val ? 'background: var(--primary-gradient); color: var(--text-on-primary);' : 'color: var(--text-muted);'}">${text}</button>`;
  const groupName = { day: 'día', week: 'semana', month: 'mes', year: 'año' }[state.group];

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${kpis.map(([label, list]) => `
          <div class="glass-panel p-4 space-y-1 border-l-4" style="border-left-color: var(--success);">
            <span class="text-xs font-semibold uppercase" style="color: var(--text-muted);">Recaudo ${label}</span>
            <h3 class="text-xl sm:text-2xl font-bold" style="color: var(--success);">${formatCurrency(sum(list))}</h3>
            <p class="text-xs" style="color: var(--text-muted);">${list.length} ${list.length === 1 ? 'pago' : 'pagos'}</p>
          </div>`).join('')}
      </div>

      <div class="glass-panel p-4 sm:p-5 space-y-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="flex items-center gap-1 p-1 rounded-xl" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
            ${seg('day', 'Diario')}${seg('week', 'Semanal')}${seg('month', 'Mensual')}${seg('year', 'Anual')}
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <div><label class="block text-[10px] font-semibold uppercase mb-1" style="color: var(--text-muted);">Desde</label>
              <input type="date" value="${state.from}" onchange="window.collectionsModule.setRange('from', this.value)" class="input-field px-2.5 py-1.5 text-xs"></div>
            <div><label class="block text-[10px] font-semibold uppercase mb-1" style="color: var(--text-muted);">Hasta</label>
              <input type="date" value="${state.to}" onchange="window.collectionsModule.setRange('to', this.value)" class="input-field px-2.5 py-1.5 text-xs"></div>
            <div><label class="block text-[10px] font-semibold uppercase mb-1" style="color: var(--text-muted);">Vendedor</label>
              <select onchange="window.collectionsModule.setSeller(this.value)" class="input-field px-2.5 py-1.5 text-xs">
                <option value="all">Todos</option>${sellers.map((s) => `<option value="${s}" ${s === state.seller ? 'selected' : ''}>${s}</option>`).join('')}
              </select></div>
          </div>
        </div>

        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div><span class="text-xs font-semibold uppercase" style="color: var(--text-muted);">Total del período seleccionado</span>
            <div class="text-2xl font-extrabold" style="color: var(--success);">${formatCurrency(sum(rangeList))} <span class="text-xs font-medium" style="color: var(--text-muted);">· ${rangeList.length} pagos</span></div></div>
          <div class="flex flex-wrap gap-1.5">${Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<span class="px-2.5 py-1 rounded-full text-[11px] font-semibold" style="background: var(--bg-card-hover); border: 1px solid var(--border-color); color: var(--text-main);">${m}: ${formatCurrency(v)}</span>`).join('')}</div>
        </div>

        <div style="height: 240px;"><canvas id="collections-chart"></canvas></div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="glass-panel overflow-hidden">
          <div class="p-4 text-sm font-bold" style="border-bottom: 1px solid var(--border-color); color: var(--text-main);">Recaudo por ${groupName}</div>
          <div class="overflow-auto max-h-96">
            <table class="w-full text-xs text-left" style="color: var(--text-muted);">
              <thead style="background: var(--bg-card-hover);"><tr><th class="p-3">Período</th><th class="p-3 text-center">Pagos</th><th class="p-3 text-right">Recaudado</th></tr></thead>
              <tbody class="divide-y" style="border-color: var(--border-color);">
                ${rows.length ? rows.map((g) => `<tr><td class="p-3 font-semibold" style="color: var(--text-main);">${labelOf(g.key, state.group)}</td><td class="p-3 text-center">${g.count}</td><td class="p-3 text-right font-mono font-bold" style="color: var(--success);">${formatCurrency(g.total)}</td></tr>`).join('') : '<tr><td colspan="3" class="p-6 text-center">Sin pagos en este período.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="glass-panel overflow-hidden">
          <div class="p-4 text-sm font-bold" style="border-bottom: 1px solid var(--border-color); color: var(--text-main);">Detalle de pagos ${rangeList.length > 300 ? '(últimos 300)' : ''} <span class="font-normal text-[10px]" style="color: var(--text-muted);">(clic en un pago para revisarlo/editarlo)</span></div>
          <div class="overflow-auto max-h-96">
            <table class="w-full text-xs text-left" style="color: var(--text-muted);">
              <thead style="background: var(--bg-card-hover);"><tr><th class="p-3">Fecha</th><th class="p-3">Cliente</th><th class="p-3">Vendedor</th><th class="p-3">Método</th><th class="p-3 text-right">Valor</th></tr></thead>
              <tbody class="divide-y" style="border-color: var(--border-color);">
                ${detail.length ? detail.map((p) => `<tr onclick="window.salesModule.openEditPayment('${p.id}')" class="cursor-pointer transition-colors" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'"><td class="p-3 whitespace-nowrap">${formatDate(p.date + 'T12:00:00')}</td><td class="p-3"><div class="font-semibold" style="color: var(--text-main);">${p.client}</div><div class="text-[10px]">${p.sale}</div></td><td class="p-3">${p.seller}</td><td class="p-3">${p.method}</td><td class="p-3 text-right font-mono font-bold" style="color: var(--success);">${formatCurrency(p.amount)}</td></tr>`).join('') : '<tr><td colspan="5" class="p-6 text-center">Sin pagos en este período.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  drawChart(rows.slice().reverse());
}

function drawChart(rows) {
  const canvas = document.getElementById('collections-chart');
  if (chart) { chart.destroy(); chart = null; }
  if (!canvas || !window.Chart) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  const tick = dark ? '#94a3b8' : '#475569';
  chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map((g) => labelOf(g.key, state.group)),
      datasets: [{ label: 'Recaudado', data: rows.map((g) => g.total), backgroundColor: 'rgba(34, 211, 238, 0.85)', borderRadius: 6, borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatCurrency(c.raw) } } },
      scales: {
        x: { ticks: { color: tick, maxRotation: 60, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: tick, callback: (v) => (v >= 1e6 ? '$ ' + (v / 1e6).toFixed(1) + 'M' : '$ ' + Math.round(v / 1000) + 'k') }, grid: { color: dark ? 'rgba(148,163,184,0.12)' : 'rgba(71,85,105,0.12)' } }
      }
    }
  });
}

const rerender = () => {
  const el = document.getElementById('portfolio-recaudos');
  if (el) renderCollections(el);
};

window.collectionsModule = {
  setGroup(g) { state.group = g; state.custom = false; defaults(g, bogotaToday()); rerender(); },
  setRange(which, v) { if (v) { state[which] = v; state.custom = true; rerender(); } },
  setSeller(s) { state.seller = s; rerender(); },
  refresh: rerender
};
