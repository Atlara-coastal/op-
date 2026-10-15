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

// Monthly interest rate proposed on a new sale/quote. It is always editable there; the
// client type is only a classification and no longer decides the rate.
export const DEFAULT_INTEREST_RATE = 10;

const parseRate = (ratePct) => (ratePct !== null && ratePct !== undefined && ratePct !== '' ? Math.max(0, parseFloat(ratePct) || 0) : DEFAULT_INTEREST_RATE);

// Interest is always worked out per MONTH, whatever the payment frequency: the term in
// months is  payments × months-per-payment  (6 fortnightly payments = 3 months), so a
// fortnightly plan costs the same as the monthly one and each payment is just half the
// monthly installment.
const PERIOD_MONTHS = { mensual: 1, quincenal: 0.5, semanal: 0.25 };
export const paymentsPerMonth = (frequency) => ({ quincenal: 2, semanal: 4 }[frequency] || 1);
export const termMonths = (installments, frequency = 'mensual') =>
  Math.max(1, (Math.max(1, Math.round(installments) || 1)) * (PERIOD_MONTHS[frequency] || 1));

// Fixed-installment amortization, interest charged each month on the OUTSTANDING balance
// (never on the original amount):
//     C = P × i(1+i)^n / ((1+i)^n − 1)
// Example: P = 2.030.000, i = 20%, n = 6  →  C ≈ 610.433.
// Returns the monthly installment, totals and (for whole months) the full schedule; the
// last payment absorbs the rounding so the balance ends at exactly 0.
export function amortization(principal, ratePct, months) {
  const P = Math.max(0, parseFloat(principal) || 0);
  const i = parseRate(ratePct) / 100;
  const m = Math.max(1, parseFloat(months) || 1);
  const raw = i > 0 ? (P * (i * Math.pow(1 + i, m))) / (Math.pow(1 + i, m) - 1) : P / m;
  const installment = Math.round(raw);
  const rows = [];
  if (Number.isInteger(m)) {
    let balance = P;
    for (let k = 1; k <= m; k++) {
      const interest = Math.round(balance * i);
      const principalPaid = k === m ? balance : Math.min(balance, Math.max(0, installment - interest));
      rows.push({ n: k, opening: balance, interest, payment: principalPaid + interest, principal: principalPaid, closing: balance - principalPaid });
      balance -= principalPaid;
    }
  }
  const totalPaid = rows.length ? rows.reduce((a, r) => a + r.payment, 0) : Math.round(raw * m);
  return { principal: P, ratePct: i * 100, months: m, installment, totalPaid, totalInterest: totalPaid - P, rows };
}

// Installments are charged in round figures: the exact MONTHLY installment goes to the
// NEXT $10.000 up, never down (183.686 → 190.000; 180.000 stays 180.000) and the total of the
// plan follows it (monthly installment × months). A plan without interest is left exact.
export const INSTALLMENT_STEP = 10000;
export function roundInstallment(exact) {
  // the small epsilon keeps float noise (e.g. 180000.0000001) from jumping a whole step
  return Math.ceil(exact / INSTALLMENT_STEP - 1e-9) * INSTALLMENT_STEP;
}

// Financing of a debt in n payments: monthly interest on the outstanding balance, then the
// installment rounded as above. `interest` is what the plan really charges after rounding.
export function financePlan(debt, ratePct, installments = 1, frequency = 'mensual') {
  const n = Math.max(1, Math.round(installments) || 1);
  const exactInterest = amortization(debt, ratePct, termMonths(n, frequency)).totalInterest;
  if (!(debt > 0) || !(exactInterest > 0)) return { installments: n, installment: debt > 0 ? debt / n : 0, monthly: 0, financed: Math.max(0, debt), interest: 0 };
  // Always priced as the MONTHLY plan: the monthly installment is the one that gets rounded,
  // and a fortnightly/weekly payment is just that monthly installment split in 2 / 4, so
  // 12 fortnights cost exactly the same as 6 months.
  const months = termMonths(n, frequency);
  const monthly = roundInstallment((debt + exactInterest) / months);
  const financed = Math.round(monthly * months);
  return { installments: n, installment: financed / n, monthly, financed, interest: financed - debt };
}

// Price of ONE product financed in n payments. The debt is the product's total cost
// (cost + extra expenses); the interest is added to it and the total is split into equal
// installments.
export function calculateProductPricing(cost, extraExpensesPercent, ratePct = null, installments = 1, frequency = 'mensual') {
  const n = Math.max(1, Math.round(installments) || 1);
  const baseCost = parseFloat(cost) || 0;
  const extPct = parseFloat(extraExpensesPercent) || 0;
  const intPct = parseRate(ratePct);

  const extraExpensesAmount = baseCost * (extPct / 100);
  const debt = baseCost + extraExpensesAmount;
  const interestAmount = financePlan(debt, intPct, n, frequency).interest;
  const finalPrice = Math.round(debt + interestAmount);

  return {
    baseCost,
    installments: n,
    debt,
    interestPercent: intPct,
    interestTotalPercent: debt ? (interestAmount / debt) * 100 : 0,
    interestAmount,
    extraExpensesPercent: extPct,
    extraExpensesAmount,
    finalPrice,
    installmentValue: finalPrice / n
  };
}

// Prices a whole sale/quote: the debt is what the client still owes after the down payment
// (total cost − initial), the interest (ratePct per month) is charged on that debt and spread
// across the items in proportion to their cost, so the item totals add up to exactly the total.
export function repriceItems(items, ratePct, installments = 1, initial = 0, frequency = 'mensual') {
  if (!items.length) return items;
  const base = items.map((i) => (parseFloat(i.cost) || 0) * (1 + (parseFloat(i.extraExpensesPercent) || 0) / 100) * i.quantity);
  const baseSum = base.reduce((a, b) => a + b, 0);
  const debt = baseSum - Math.min(baseSum, Math.max(0, initial));
  const interest = financePlan(debt, ratePct, installments, frequency).interest;
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

// What to show in the credit calculator for a sale/quote being built: the amount
// financed (cost − down payment), the rate and the term in whole months.
export function amortizationPrefill(items, ratePct, installments = 1, initial = 0, frequency = 'mensual') {
  const baseSum = items.reduce((a, i) => a + (parseFloat(i.cost) || 0) * (1 + (parseFloat(i.extraExpensesPercent) || 0) / 100) * i.quantity, 0);
  const debt = Math.round(baseSum - Math.min(baseSum, Math.max(0, initial)));
  const months = termMonths(installments, frequency);
  const perMonth = { quincenal: 2, semanal: 4 }[frequency];
  return {
    amount: debt || '',
    rate: parseRate(ratePct),
    months: Math.max(1, Math.round(months)),
    perMonth: perMonth || 1,
    frequency,
    note: perMonth
      ? `Plan de ${installments} pagos ${frequency}es = ${months} ${months === 1 ? 'mes' : 'meses'}. El interés se calcula por mes; cada pago ${frequency} es la cuota mensual dividida entre ${perMonth}.`
      : ''
  };
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
