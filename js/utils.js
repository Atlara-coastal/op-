/**
 * JocoAdmin - Utility Functions
 * Formatting, Calculations, Toast Notifications, WhatsApp Generator
 */

// Format Currency COP ($ 1.500.000)
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$ 0';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Get Interest Rate by Client Type
export function getInterestRateByClientType(type) {
  const rates = {
    'tipo-1': 10,
    'tipo-2': 15,
    'tipo-3': 20
  };
  return rates[type] || 10;
}

// Total interest factor for n installments. Interest accrues on the outstanding DEBT each
// period: the debt is split into n equal shares, so the balance is n/n, (n-1)/n, … 1/n of it,
// and the total interest over the term is  debt × rate × (n+1)/2.
// Example (rate 10%, 5 installments): 10% × (5+4+3+2+1)/5 = 30% of the debt.
export const interestFactor = (installments) => (Math.max(1, Math.round(installments) || 1) + 1) / 2;

// Price of ONE product financed in n installments. The debt is the product's total cost
// (cost + extra expenses); the interest is added to it and the total is split into equal
// installments. ratePct overrides the client-type default (e.g. a manually edited rate).
export function calculateProductPricing(cost, extraExpensesPercent, clientType = 'tipo-1', installments = 1, ratePct = null) {
  const n = Math.max(1, Math.round(installments) || 1);
  const baseCost = parseFloat(cost) || 0;
  const extPct = parseFloat(extraExpensesPercent) || 0;
  const intPct = ratePct !== null && ratePct !== undefined && ratePct !== '' ? parseFloat(ratePct) || 0 : getInterestRateByClientType(clientType);

  const extraExpensesAmount = baseCost * (extPct / 100);
  const debt = baseCost + extraExpensesAmount;
  const interestAmount = debt * (intPct / 100) * interestFactor(n);
  const finalPrice = Math.round(debt + interestAmount);

  return {
    baseCost,
    installments: n,
    debt,
    interestPercent: intPct,
    interestTotalPercent: intPct * interestFactor(n),
    interestAmount,
    extraExpensesPercent: extPct,
    extraExpensesAmount,
    finalPrice,
    installmentValue: finalPrice / n
  };
}

// Prices a whole sale: the debt is what the client still owes after the down payment
// (total cost − initial), the interest is charged on that debt and spread across the
// items in proportion to their cost, so the item totals add up to exactly the sale total.
export function repriceItems(items, clientType, installments = 1, initial = 0) {
  if (!items.length) return items;
  const rate = getInterestRateByClientType(clientType) / 100;
  const base = items.map((i) => (parseFloat(i.cost) || 0) * (1 + (parseFloat(i.extraExpensesPercent) || 0) / 100) * i.quantity);
  const baseSum = base.reduce((a, b) => a + b, 0);
  const debt = baseSum - Math.min(baseSum, Math.max(0, initial));
  const interest = debt * rate * interestFactor(installments);
  const grand = Math.round(baseSum + interest);
  let allocated = 0;
  return items.map((item, idx) => {
    const total = idx === items.length - 1
      ? grand - allocated
      : Math.round(base[idx] + (baseSum ? interest * (base[idx] / baseSum) : 0));
    allocated += total;
    return { ...item, total, finalUnitPrice: total / (item.quantity || 1) };
  });
}
// Toast Notification Toast Generator
export function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const typeStyles = {
    success: 'bg-emerald-600/90 text-white border-emerald-400',
    error: 'bg-rose-600/90 text-white border-rose-400',
    warning: 'bg-amber-600/90 text-white border-amber-400',
    info: 'bg-slate-700/90 text-white border-slate-500'
  };

  const icons = {
    success: '<i data-lucide="check-circle-2" class="w-5 h-5"></i>',
    error: '<i data-lucide="alert-triangle" class="w-5 h-5"></i>',
    warning: '<i data-lucide="bell" class="w-5 h-5"></i>',
    info: '<i data-lucide="info" class="w-5 h-5"></i>'
  };

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-auto ${typeStyles[type] || typeStyles.info}`;
  toast.innerHTML = `
    <span>${icons[type] || icons.info}</span>
    <p class="text-sm font-medium flex-1">${message}</p>
    <button class="text-white/70 hover:text-white ml-2" onclick="this.parentElement.remove()">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  toastContainer.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-4');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// WhatsApp Reminder Generator
export function generateWhatsAppReminder(clientName, clientPhone, saleNumber, amountDue, dueDate) {
  const cleanPhone = clientPhone.replace(/\D/g, '');
  const message = `Hola *${clientName}*, ¡esperamos te encuentres muy bien! 👋🏼\n\nTe recordamos que tienes una cuota pendiente del crédito *#${saleNumber}* por un valor de *${formatCurrency(amountDue)}* con fecha de vencimiento *${dueDate}*.\n\nAgradecemos tu puntualidad. Si ya realizaste tu pago, por favor haznos llegar el comprobante. ¡Muchas gracias! 🙏🏼`;
  
  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/57${cleanPhone}?text=${encodedMsg}`;
}

// Client Type Badge Generator
export function getClientTypeBadgeHtml(type) {
  const types = {
    'tipo-1': {
      label: 'Frecuente / Excelente',
      class: 'badge-tipo-1',
      icon: 'star'
    },
    'tipo-2': {
      label: 'Primera Vez / Regular',
      class: 'badge-tipo-2',
      icon: 'user'
    },
    'tipo-3': {
      label: 'Riesgoso / Mora',
      class: 'badge-tipo-3',
      icon: 'shield-alert'
    }
  };

  const t = types[type] || types['tipo-1'];
  return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${t.class}">
    <i data-lucide="${t.icon}" class="w-3.5 h-3.5"></i> ${t.label}
  </span>`;
}

// Format Date nicely
export function formatDate(dateString) {
  if (!dateString) return '-';
  // A plain "YYYY-MM-DD" string (from a <input type="date">, e.g.) is parsed by
  // the Date constructor as UTC midnight, which then displays as the day before
  // in any timezone behind UTC (like Colombia). Force it to local midnight instead.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? new Date(dateString + 'T00:00:00') : new Date(dateString);
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

// WhatsApp Payment Receipt Generator
export function generateWhatsAppPaymentReceipt(clientName, clientPhone, receiptNumber, saleNumber, amountPaid, previousBalance, newBalance, paymentMethod, date) {
  const cleanPhone = (clientPhone || '').replace(/\D/g, '');
  const statusLine = newBalance === 0 
    ? '🎉 *¡FELICITACIONES! CRÉDITO PAGADO EN SU TOTALIDAD (100%)* 🎉' 
    : `📉 *Nuevo Saldo Pendiente:* ${formatCurrency(newBalance)}`;

  const message = `🧾 *COMPROBANTE DE PAGO / ABONO*\n` +
    `*OP*\n` +
    `--------------------------------------\n` +
    `📄 *Recibo N°:* ${receiptNumber}\n` +
    `📦 *Crédito / Venta:* #${saleNumber}\n` +
    `👤 *Cliente:* ${clientName}\n` +
    `📅 *Fecha:* ${formatDate(date)}\n` +
    `💳 *Medio de Pago:* ${paymentMethod}\n` +
    `--------------------------------------\n` +
    `💰 *Saldo Anterior:* ${formatCurrency(previousBalance)}\n` +
    `✅ *VALOR ABONADO:* ${formatCurrency(amountPaid)}\n` +
    `${statusLine}\n` +
    `--------------------------------------\n` +
    `¡Gracias por tu pago puntual y por tu confianza! 🙏🏼✨`;

  const encodedMsg = encodeURIComponent(message);
  return cleanPhone ? `https://wa.me/57${cleanPhone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;
}
