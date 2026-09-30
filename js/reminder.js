/**
 * JocoAdmin - Payment reminder card (image) to send to a client.
 * window.reminderModule.open(saleId) shows a branded card with balance, amount
 * to deliver and due date, and shares it as a PNG (WhatsApp on mobile).
 */
import { db } from './db.js';
import { paper, docBox, esc, fitPaper, exportImage, brand } from './pdf-doc.js';
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
  const b = brand();
  const tone = late ? ['#fef2f2', '#fecaca', '#dc2626'] : [b.accentSoft, b.accentLine, b.accent];
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

// ---- Account statement: every sale of a client that still has a balance, in one card.
function statementRows(clientId) {
  return db.getCollection('sales')
    .filter((s) => s.clientId === clientId && (parseFloat(s.outstandingBalance) || 0) > 0)
    .sort((a, b) => String(a.startDate || a.date || '').localeCompare(String(b.startDate || b.date || '')))
    .map((sale) => ({ sale, d: reminderData(sale) }));
}

function statementText(client, rows, totals) {
  const lines = rows.map(({ sale, d }) => `• Crédito #${sale.saleNumber}: saldo ${formatCurrency(d.balance)}${d.nd ? ` — cuota ${formatCurrency(d.toDeliver)} ${d.overdue > 0 ? `vencida desde el ${formatDate(d.nd.date)}` : `para el ${formatDate(d.nd.date)}`}` : ''}`);
  return `Hola ${client.fullName}, este es el estado de tus cuentas activas:\n${lines.join('\n')}\n\nSaldo total pendiente: ${formatCurrency(totals.balance)}\nValor a entregar: ${formatCurrency(totals.toDeliver)}\n\nSi ya pagaste, envíanos el comprobante. ¡Gracias!`;
}

function statementCardHtml(client, rows, totals) {
  const b = brand();
  const late = totals.overdue > 0;
  const tone = late ? ['#fef2f2', '#fecaca', '#dc2626'] : [b.accentSoft, b.accentLine, b.accent];
  const cell = (label, value, color = '#0b1220') => `<div><div style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#5b6b7f;">${label}</div><div style="font-family:'Courier New',monospace;font-weight:700;font-size:13px;color:${color};">${value}</div></div>`;
  const saleBlock = ({ sale, d }) => {
    const products = (sale.items || []).map((i) => esc(i.productName || 'Producto') + ((i.quantity || 1) > 1 ? ` ×${i.quantity}` : '')).join(', ');
    const due = d.nd
      ? (d.overdue > 0
        ? `<span style="color:#dc2626;font-weight:700;">Vencida desde el ${formatDate(d.nd.date)} · ${d.overdue} ${d.overdue === 1 ? 'día' : 'días'}</span>`
        : `<span style="color:#5b6b7f;">Próximo pago: <b style="color:#0b1220;">${formatDate(d.nd.date)}</b></span>`)
      : '';
    return `
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;">
          <div style="font-family:'Courier New',monospace;font-weight:700;color:${b.accent};">#${esc(sale.saleNumber)}</div>
          <div style="font-size:10px;">${due}</div>
        </div>
        ${products ? `<div style="color:#5b6b7f;margin-top:2px;">${products}</div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;">
          ${cell('Valor venta', formatCurrency(sale.totalAmount))}
          ${cell('Abonado', formatCurrency(sale.totalPaid), '#059669')}
          ${cell('Cuota', formatCurrency(d.cuota))}
          ${cell('Saldo', formatCurrency(d.balance), '#d97706')}
        </div>
      </div>`;
  };
  return paper({
    title: 'Estado de cuenta',
    number: `${rows.length} ${rows.length === 1 ? 'cuenta activa' : 'cuentas activas'}`,
    date: formatDate(new Date().toISOString()),
    footer: 'Si ya realizaste tu pago, envíanos el comprobante.<br>¡Gracias por tu puntualidad!',
    body: `
      <div>
        <div style="font-size:11px;color:#5b6b7f;">Hola,</div>
        <div style="font-size:20px;font-weight:800;line-height:1.2;">${esc(client.fullName)}</div>
        <div style="color:#5b6b7f;margin-top:4px;">Este es el resumen de tus cuentas activas.</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="border-radius:14px;padding:14px;text-align:center;background:#fffbeb;border:1px solid #fde68a;">
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#d97706;">Saldo total pendiente</div>
          <div style="font-size:26px;font-weight:800;font-family:'Courier New',monospace;color:#d97706;margin-top:4px;">${formatCurrency(totals.balance)}</div>
        </div>
        <div style="border-radius:14px;padding:14px;text-align:center;background:${tone[0]};border:1px solid ${tone[1]};">
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${tone[2]};">Valor a entregar</div>
          <div style="font-size:26px;font-weight:800;font-family:'Courier New',monospace;color:${tone[2]};margin-top:4px;">${formatCurrency(totals.toDeliver)}</div>
          ${late ? `<div style="font-size:10px;font-weight:600;color:#dc2626;">Incluye cuotas vencidas</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">${rows.map(saleBlock).join('')}</div>`
  });
}

// ---- Payments summary: every abono the client has made, across all their sales.
function paymentsOf(clientId) {
  return db.getCollection('payments')
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => String(a.date || a.createdAt || '').localeCompare(String(b.date || b.createdAt || '')));
}

function paymentsSummaryText(client, payments, totalPaid, pending) {
  const last = payments[payments.length - 1];
  return `Hola ${client.fullName}, este es el resumen de tus abonos:\n` +
    `• ${payments.length} ${payments.length === 1 ? 'abono' : 'abonos'} por un total de ${formatCurrency(totalPaid)}\n` +
    `• Último abono: ${formatCurrency(last.amount)} el ${formatDate(last.date || last.createdAt)}\n` +
    `• Saldo pendiente: ${formatCurrency(pending)}\n\n¡Gracias por tus pagos!`;
}

function paymentsSummaryCardHtml(client, payments, totalPaid, pending) {
  const accent = brand().accent;
  const th = 'text-align:left;padding:7px 8px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#5b6b7f;border-bottom:1px solid #e2e8f0;';
  const td = 'padding:7px 8px;border-bottom:1px solid #f1f5f9;';
  const rows = payments.map((p) => `
    <tr>
      <td style="${td}white-space:nowrap;">${formatDate(p.date || p.createdAt)}</td>
      <td style="${td}font-family:'Courier New',monospace;color:${accent};">${esc(p.receiptNumber || '—')}</td>
      <td style="${td}font-family:'Courier New',monospace;">#${esc(p.saleNumber || '')}</td>
      <td style="${td}color:#5b6b7f;">${esc(p.paymentMethod || 'Efectivo')}</td>
      <td style="${td}text-align:right;font-family:'Courier New',monospace;font-weight:700;color:#059669;white-space:nowrap;">${formatCurrency(p.amount)}</td>
    </tr>`).join('');
  return paper({
    title: 'Resumen de abonos',
    number: `${payments.length} ${payments.length === 1 ? 'abono' : 'abonos'}`,
    date: formatDate(new Date().toISOString()),
    footer: 'Gracias por mantener tus pagos al día.',
    body: `
      <div>
        <div style="font-size:11px;color:#5b6b7f;">Hola,</div>
        <div style="font-size:20px;font-weight:800;line-height:1.2;">${esc(client.fullName)}</div>
        <div style="color:#5b6b7f;margin-top:4px;">Este es el detalle de todos los abonos que has realizado.</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="border-radius:14px;padding:14px;text-align:center;background:#ecfdf5;border:1px solid #a7f3d0;">
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#059669;">Total abonado</div>
          <div style="font-size:26px;font-weight:800;font-family:'Courier New',monospace;color:#059669;margin-top:4px;">${formatCurrency(totalPaid)}</div>
        </div>
        <div style="border-radius:14px;padding:14px;text-align:center;background:#fffbeb;border:1px solid #fde68a;">
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#d97706;">Saldo pendiente</div>
          <div style="font-size:26px;font-weight:800;font-family:'Courier New',monospace;color:#d97706;margin-top:4px;">${formatCurrency(pending)}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr><th style="${th}">Fecha</th><th style="${th}">Recibo</th><th style="${th}">Crédito</th><th style="${th}">Método</th><th style="${th}text-align:right;">Valor</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
  });
}

function close() { document.getElementById('reminder-modal')?.remove(); }

// Shared modal: preview card + "text only" WhatsApp link + share-as-image button.
function openShareModal({ title, cardHtml: html, text, phone, filename }) {
  close();
  const digits = (phone || '').replace(/\D/g, '');
  const wa = `https://wa.me/${digits ? '57' + digits : ''}?text=${encodeURIComponent(text)}`;
  const wrap = document.createElement('div');
  wrap.id = 'reminder-modal';
  wrap.className = 'fixed inset-0 z-[70] modal-overlay flex items-center justify-center p-4';
  wrap.innerHTML = `
    <div class="glass-panel w-full max-w-2xl p-5 space-y-4 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between gap-2 pb-3" style="border-bottom: 1px solid var(--border-color);">
        <h3 class="text-base font-bold" style="color: var(--text-main);">${title}</h3>
        <button onclick="document.getElementById('reminder-modal').remove()" class="p-1" style="color: var(--text-muted);"><i data-lucide="x" class="w-5 h-5"></i></button>
      </div>
      <div id="reminder-card" class="rounded-xl overflow-hidden mx-auto w-fit max-w-full" style="border: 1px solid var(--border-color);">${html}</div>
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
      const shared = await exportImage(card.firstElementChild, filename, text);
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

window.reminderModule = {
  open(saleId) {
    const sale = db.getCollection('sales').find((s) => s.id === saleId);
    if (!sale) return;
    const d = reminderData(sale);
    openShareModal({
      title: 'Recordatorio de pago',
      cardHtml: cardHtml(sale, d),
      text: messageText(sale, d),
      phone: d.client.phone,
      filename: `Recordatorio-${sale.saleNumber}.png`
    });
  },

  // Every payment the client has made (all sales), as a shareable image.
  openPaymentsSummary(clientId) {
    const client = db.getCollection('clients').find((c) => c.id === clientId);
    if (!client) return;
    const payments = paymentsOf(clientId);
    if (!payments.length) {
      alert('Este cliente todavía no tiene abonos registrados.');
      return;
    }
    const totalPaid = payments.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const pending = db.getCollection('sales')
      .filter((s) => s.clientId === clientId)
      .reduce((a, s) => a + (parseFloat(s.outstandingBalance) || 0), 0);
    openShareModal({
      title: 'Resumen de abonos',
      cardHtml: paymentsSummaryCardHtml(client, payments, totalPaid, pending),
      text: paymentsSummaryText(client, payments, totalPaid, pending),
      phone: client.phone,
      filename: `Abonos-${(client.fullName || 'cliente').replace(/\s+/g, '_')}.png`
    });
  },

  // One statement with every sale of the client that still has a balance.
  openStatement(clientId) {
    const client = db.getCollection('clients').find((c) => c.id === clientId);
    if (!client) return;
    const rows = statementRows(clientId);
    if (!rows.length) {
      alert('Este cliente no tiene cuentas activas (todas sus ventas están pagadas).');
      return;
    }
    const totals = {
      balance: rows.reduce((a, r) => a + r.d.balance, 0),
      toDeliver: rows.reduce((a, r) => a + r.d.toDeliver, 0),
      overdue: rows.filter((r) => r.d.overdue > 0).length
    };
    openShareModal({
      title: 'Estado de cuenta',
      cardHtml: statementCardHtml(client, rows, totals),
      text: statementText(client, rows, totals),
      phone: client.phone,
      filename: `Estado-de-cuenta-${(client.fullName || 'cliente').replace(/\s+/g, '_')}.png`
    });
  }
};