/**
 * JocoAdmin - Payment reminder card (image) to send to a client.
 * window.reminderModule.open(saleId) shows a branded card with balance, amount
 * to deliver and due date, and shares it as a PNG (WhatsApp on mobile).
 */
import { db } from './db.js';
import { paper, docBox, esc, fitPaper, exportImage } from './pdf-doc.js';
import { scheduleDates, installmentValue, nextDue, bogotaToday } from './due.js';
import { formatCurrency, formatDate } from './utils.js';

function reminderData(sale) {
  const client = db.getCollection('clients').find((c) => c.id === sale.clientId) || {};
  const today = bogotaToday();
  const cuota = installmentValue(sale);
  const nd = nextDue(sale, today);
  const dates = scheduleDates(sale);
  const paidOnInst = Math.max(0, (sale.totalPaid || 0) - (sale.initialPayment || 0));
  const dueCount = dates.filter((d) => d <= today).length;
  const overdueAmount = Math.max(0, dueCount * cuota - paidOnInst);
  const balance = sale.outstandingBalance || 0;
  const toDeliver = Math.min(balance, nd && nd.daysOverdue > 0 ? Math.max(overdueAmount, cuota) : cuota);
  return { client, cuota, nd, balance, toDeliver, overdue: nd?.daysOverdue || 0 };
}

function messageText(sale, d) {
  return `Hola ${sale.clientName}, te recordamos tu crédito #${sale.saleNumber}. Saldo pendiente: ${formatCurrency(d.balance)}. Valor a entregar: ${formatCurrency(d.toDeliver)}${d.nd ? ` (fecha: ${formatDate(d.nd.date)})` : ''}. Si ya pagaste, envíanos el comprobante. ¡Gracias!`;
}

function cardHtml(sale, d) {
  const late = d.overdue > 0;
  const tone = late ? ['#fef2f2', '#fecaca', '#dc2626'] : ['#ecfdf5', '#bbf7d0', '#16a34a'];
  const promised = d.client.nextPaymentDate
    ? docBox('Pago acordado', `<div style="font-weight:700;">${formatDate(d.client.nextPaymentDate)}${d.client.promisedAmount ? ` · ${formatCurrency(d.client.promisedAmount)}` : ''}</div>`, 'cyan')
    : '';
  return paper({
    title: 'Recordatorio de pago',
    number: '#' + sale.saleNumber,
    date: formatDate(new Date().toISOString()),
    footer: 'Si ya realizaste tu pago, envíanos el comprobante.<br>¡Gracias por tu puntualidad!',
    body: `
      <div>
        <div style="font-size:11px;color:#5b6b7f;">Hola,</div>
        <div style="font-size:20px;font-weight:800;line-height:1.2;">${esc(sale.clientName)}</div>
        <div style="color:#5b6b7f;margin-top:4px;">Este es un recordatorio amable de tu crédito.</div>
      </div>
      <div style="border-radius:14px;padding:18px;text-align:center;background:${tone[0]};border:1px solid ${tone[1]};">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${tone[2]};">Valor a entregar</div>
        <div style="font-size:34px;font-weight:800;font-family:'Courier New',monospace;color:${tone[2]};margin:4px 0;">${formatCurrency(d.toDeliver)}</div>
        ${d.nd ? `<div style="font-weight:600;color:#0b1220;">${late ? `Vencido desde el ${formatDate(d.nd.date)} · ${d.overdue} ${d.overdue === 1 ? 'día' : 'días'} de atraso` : `Fecha de pago: ${formatDate(d.nd.date)}`}</div>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${docBox('Saldo pendiente', `<div style="font-size:17px;font-weight:800;font-family:'Courier New',monospace;color:#d97706;">${formatCurrency(d.balance)}</div>`)}
        ${docBox('Valor de la cuota', `<div style="font-size:17px;font-weight:800;font-family:'Courier New',monospace;">${formatCurrency(d.cuota)}</div>${d.nd ? `<div style="color:#5b6b7f;font-size:10px;">Cuota ${d.nd.number} de ${sale.installmentsCount || 1}</div>` : ''}`)}
        ${docBox('Total abonado', `<div style="font-size:15px;font-weight:700;font-family:'Courier New',monospace;color:#059669;">${formatCurrency(sale.totalPaid)}</div>`, 'ok')}
        ${docBox('Valor de la venta', `<div style="font-size:15px;font-weight:700;font-family:'Courier New',monospace;">${formatCurrency(sale.totalAmount)}</div>`)}
      </div>
      ${promised}`
  });
}

function close() { document.getElementById('reminder-modal')?.remove(); }

window.reminderModule = {
  open(saleId) {
    const sale = db.getCollection('sales').find((s) => s.id === saleId);
    if (!sale) return;
    const d = reminderData(sale);
    close();
    const phone = (d.client.phone || '').replace(/\D/g, '');
    const wa = `https://wa.me/${phone ? '57' + phone : ''}?text=${encodeURIComponent(messageText(sale, d))}`;
    const wrap = document.createElement('div');
    wrap.id = 'reminder-modal';
    wrap.className = 'fixed inset-0 z-[70] modal-overlay flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="glass-panel w-full max-w-2xl p-5 space-y-4 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between gap-2 pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-base font-bold" style="color: var(--text-main);">Recordatorio de pago</h3>
          <button onclick="document.getElementById('reminder-modal').remove()" class="p-1" style="color: var(--text-muted);"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div id="reminder-card" class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-color);">${cardHtml(sale, d)}</div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <a href="${wa}" target="_blank" rel="noopener noreferrer" class="btn-glass px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"><i data-lucide="message-circle" class="w-4 h-4"></i> Solo texto</a>
          <button id="reminder-send" class="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"><i data-lucide="image" class="w-4 h-4"></i> Enviar imagen</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    const card = wrap.querySelector('#reminder-card');
    fitPaper(card);
    if (window.lucide) window.lucide.createIcons();
    const btn = wrap.querySelector('#reminder-send');
    btn.addEventListener('click', async () => {
      const label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Generando…';
      try {
        const shared = await exportImage(card.firstElementChild, `Recordatorio-${sale.saleNumber}.png`, messageText(sale, d));
        // Desktop fallback: the image was downloaded, open WhatsApp so it can be attached.
        if (shared && !navigator.canShare) window.open(wa, '_blank');
      } catch (e) {
        console.error(e);
        alert('No se pudo generar la imagen. Revisa tu conexión e inténtalo de nuevo.');
      } finally {
        btn.disabled = false; btn.innerHTML = label;
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }
};