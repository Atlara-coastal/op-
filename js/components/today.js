/**
 * JocoAdmin - "Cobros de hoy": the list of people who must pay today.
 * Admins see every seller's collections, sellers only their own sales.
 * This is where the daily push notification takes you.
 */
import { db } from '../db.js';
import { getDueToday, installmentValue, bogotaToday } from '../due.js';
import { isAdmin, getMyUsername } from '../permissions.js';
import { formatCurrency, getClientTypeBadgeHtml } from '../utils.js';

let searchTerm = '';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function longDate(iso) {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function collectEntries() {
  const sales = db.getCollection('sales');
  const clients = db.getCollection('clients');
  const me = getMyUsername();
  const visible = isAdmin() || !me ? sales : sales.filter((s) => s.sellerUsername === me);
  return { clients, entries: getDueToday(visible, clients, bogotaToday()) };
}

function cardHtml({ sale: s, installment, reason, daysOverdue }, client) {
  const cuota = installmentValue(s);
  const phone = (client.phone || '').replace(/\D/g, '');
  const label = reason === 'promised' ? 'Fecha de pago acordada' : `Cuota ${installment} de ${s.installmentsCount || 1}`;
  return `
    <div class="glass-panel p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-base" style="color: var(--text-main);">${esc(s.clientName)}</span>
            ${getClientTypeBadgeHtml(client.type || 'tipo-1')}
            ${reason === 'overdue' ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold" style="background: var(--danger-bg); color: var(--danger);">También en mora</span>' : ''}
          </div>
          <p class="text-xs mt-1" style="color: var(--text-muted);">
            Venta <strong style="color: var(--text-main);">${esc(s.saleNumber)}</strong> &bull; ${label}
            ${isAdmin() ? `&bull; Vendedor: <strong style="color: var(--text-main);">${esc(s.sellerName || s.sellerUsername || 'Sin vendedor')}</strong>` : ''}
          </p>
          ${reason === 'overdue' ? `<p class="text-[11px] font-semibold mt-0.5" style="color: var(--danger);">Además tiene ${daysOverdue} días de atraso en cuotas anteriores</p>` : ''}
        </div>
        <div class="text-right shrink-0">
          <span class="block text-[10px] uppercase font-semibold" style="color: var(--text-muted);">A cobrar</span>
          <span class="text-lg font-extrabold font-mono" style="color: var(--warning);">${formatCurrency(cuota)}</span>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2 pt-3" style="border-top: 1px solid var(--border-color);">
        <span class="text-xs" style="color: var(--text-muted);">Saldo pendiente: <strong class="font-mono" style="color: var(--text-main);">${formatCurrency(s.outstandingBalance)}</strong></span>
        <div class="flex items-center gap-1.5">
          ${phone ? `<a href="tel:+57${phone}" title="Llamar" class="btn-glass p-2 rounded-lg"><i data-lucide="phone" class="w-4 h-4"></i></a>` : ''}
          <button onclick="window.reminderModule.open('${s.id}')" class="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5" style="background: var(--success); color: var(--text-on-primary);">
            <i data-lucide="message-square" class="w-3.5 h-3.5"></i> Recordar
          </button>
        </div>
      </div>
    </div>`;
}

export function renderToday(container) {
  const { clients, entries } = collectEntries();
  const q = searchTerm.trim().toLowerCase();
  const list = entries
    .filter((e) => !q || (e.sale.clientName || '').toLowerCase().includes(q) || (e.sale.saleNumber || '').toLowerCase().includes(q))
    .sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0) || installmentValue(b.sale) - installmentValue(a.sale));

  const total = entries.reduce((acc, e) => acc + installmentValue(e.sale), 0);
  const inMora = entries.filter((e) => e.reason === 'overdue').length;

  // Admins: group by seller.
  const groups = new Map();
  list.forEach((e) => {
    const key = isAdmin() ? (e.sale.sellerName || e.sale.sellerUsername || 'Sin vendedor') : 'all';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  const body = list.length === 0
    ? `<div class="glass-panel p-10 text-center" style="color: var(--text-muted);">
         <i data-lucide="check-circle-2" class="w-10 h-10 mx-auto mb-3" style="color: var(--success);"></i>
         <p class="font-semibold" style="color: var(--text-main);">${entries.length === 0 ? 'Nadie tiene su día de pago hoy' : 'Sin resultados para tu búsqueda'}</p>
       </div>`
    : [...groups.entries()].map(([seller, items]) => `
        ${seller !== 'all' ? `<div class="flex items-center gap-2 pt-2">
          <h3 class="text-xs font-bold uppercase tracking-wide" style="color: var(--primary);">${esc(seller)}</h3>
          <span class="text-[11px]" style="color: var(--text-muted);">(${items.length} &bull; ${formatCurrency(items.reduce((a, e) => a + installmentValue(e.sale), 0))})</span>
          <div class="flex-1 h-px" style="background: var(--border-color);"></div>
        </div>` : ''}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${items.map((e) => cardHtml(e, clients.find((c) => c.id === e.sale.clientId) || {})).join('')}
        </div>`).join('');

  container.innerHTML = `
    <div class="space-y-6 animate-fade-in">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight" style="color: var(--text-main);">Cobros de hoy</h1>
        <p class="text-sm" style="color: var(--text-muted);">${longDate(bogotaToday())}${isAdmin() ? ' &bull; todos los vendedores' : ''}</p>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="glass-panel p-4 border-l-4" style="border-left-color: var(--primary);">
          <span class="text-[11px] font-semibold uppercase" style="color: var(--text-muted);">Personas</span>
          <div class="text-2xl font-extrabold" style="color: var(--text-main);">${entries.length}</div>
        </div>
        <div class="glass-panel p-4 border-l-4" style="border-left-color: var(--warning);">
          <span class="text-[11px] font-semibold uppercase" style="color: var(--text-muted);">A cobrar</span>
          <div class="text-lg sm:text-2xl font-extrabold font-mono" style="color: var(--warning);">${formatCurrency(total)}</div>
        </div>
        <div class="glass-panel p-4 border-l-4" style="border-left-color: var(--danger);">
          <span class="text-[11px] font-semibold uppercase" style="color: var(--text-muted);">También en mora</span>
          <div class="text-2xl font-extrabold" style="color: var(--danger);">${inMora}</div>
        </div>
      </div>

      <div class="relative max-w-sm">
        <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3" style="color: var(--text-muted);"></i>
        <input id="today-search" type="text" value="${esc(searchTerm)}" placeholder="Buscar cliente o venta..." class="input-field w-full pl-9 pr-4 py-2 text-sm">
      </div>

      <div class="space-y-4" id="today-list">${body}</div>
    </div>`;

  const input = document.getElementById('today-search');
  input?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    const pos = e.target.selectionStart;
    renderToday(container);
    const again = document.getElementById('today-search');
    again?.focus();
    again?.setSelectionRange(pos, pos);
  });
  if (window.lucide) window.lucide.createIcons();
}
