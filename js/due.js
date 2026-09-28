/**
 * JocoAdmin - Payment schedule logic shared by the app and the server cron
 * (api/send-due-notifications.js). Pure functions, no DOM.
 *
 * A credit sale has:
 *   startDate        first installment due date
 *   installmentsCount, installmentAmount (per installment)
 *   frequency        'semanal' | 'quincenal' | 'mensual'
 *   paymentDays      optional fixed days of month, e.g. [15, 30]
 *   initialPayment   down payment (already included in totalPaid)
 */

export function bogotaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

const parts = (s) => s.split('-').map(Number);
const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(iso, n) {
  const [y, m, d] = parts(iso);
  return toISO(utc(y, m, d + n));
}

export function addMonths(iso, k) {
  const [y, m, d] = parts(iso);
  const total = m - 1 + k;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  return toISO(utc(ny, nm, Math.min(d, daysInMonth(ny, nm))));
}

export function daysBetween(fromISO, toISOStr) {
  const [fy, fm, fd] = parts(fromISO);
  const [ty, tm, td] = parts(toISOStr);
  return Math.round((utc(ty, tm, td) - utc(fy, fm, fd)) / 86400000);
}

export function installmentValue(sale) {
  if (sale.installmentAmount > 0) return sale.installmentAmount;
  const financed = (sale.totalAmount || 0) - (sale.initialPayment || 0);
  return financed / (sale.installmentsCount || 1);
}

// Due dates of every installment (ISO strings).
export function scheduleDates(sale) {
  const n = sale.installmentsCount || 1;
  const start = sale.startDate;
  if (!start) return [];
  const dates = [];

  if (Array.isArray(sale.paymentDays) && sale.paymentDays.length) {
    const days = [...new Set(sale.paymentDays.map(Number))].filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
    const [sy, sm] = parts(start);
    for (let off = 0; dates.length < n && off < n * 2 + 36; off++) {
      const total = sm - 1 + off;
      const y = sy + Math.floor(total / 12);
      const m = (total % 12) + 1;
      for (const d of days) {
        const date = toISO(utc(y, m, Math.min(d, daysInMonth(y, m))));
        if (date >= start && dates.length < n) dates.push(date);
      }
    }
    return dates;
  }

  for (let k = 0; k < n; k++) {
    if (sale.frequency === 'mensual') dates.push(addMonths(start, k));
    else dates.push(addDays(start, (sale.frequency === 'semanal' ? 7 : 15) * k));
  }
  return dates;
}

const isCredit = (sale) => sale.type !== 'contado' && (sale.outstandingBalance || 0) > 0 && !!sale.startDate;

// Installment number (1..n) scheduled for today, or 0.
export function installmentDueToday(sale, today = bogotaToday()) {
  if (!isCredit(sale)) return 0;
  return scheduleDates(sale).indexOf(today) + 1;
}

// Does the client's recurring pay day (day-of-month for paymentDays, or the
// weekly/biweekly/monthly cadence from startDate) fall on `today`? Unlike
// scheduleDates (capped at installmentsCount, so it runs out for accounts deep
// in arrears), this keeps recurring indefinitely while the balance is open, so
// a client's regular pay day still gets flagged even after their nominal
// schedule is exhausted.
export function isPayDayToday(sale, today = bogotaToday()) {
  if (!isCredit(sale)) return false;
  if (today < sale.startDate) return false;
  const [ty, tm, td] = parts(today);
  const lastDay = daysInMonth(ty, tm);

  if (Array.isArray(sale.paymentDays) && sale.paymentDays.length) {
    return sale.paymentDays.map(Number).some((d) => Math.min(d, lastDay) === td);
  }
  if (sale.frequency === 'semanal') return daysBetween(sale.startDate, today) % 7 === 0;
  if (sale.frequency === 'quincenal') return daysBetween(sale.startDate, today) % 15 === 0;
  const [, , sd] = parts(sale.startDate);
  return Math.min(sd, lastDay) === td;
}

// Next unpaid installment: { date, number, daysOverdue } or null when settled / no schedule.
export function nextDue(sale, today = bogotaToday()) {
  if (!isCredit(sale)) return null;
  const dates = scheduleDates(sale);
  if (!dates.length) return null;
  const cuota = installmentValue(sale) || 1;
  const paidOnInstallments = Math.max(0, (sale.totalPaid || 0) - (sale.initialPayment || 0));
  const paidCount = Math.min(dates.length - 1, Math.floor(paidOnInstallments / cuota + 0.001));
  const date = dates[paidCount];
  return { date, number: paidCount + 1, daysOverdue: Math.max(0, daysBetween(date, today)) };
}

// 'pagado' | 'mora' | 'al_dia', always current (does not depend on the stored value).
export function effectiveStatus(sale, today = bogotaToday()) {
  if (!((sale.outstandingBalance || 0) > 0)) return 'pagado';
  const nd = nextDue(sale, today);
  if (!nd) return sale.status === 'mora' ? 'mora' : 'al_dia';
  return nd.daysOverdue > 0 ? 'mora' : 'al_dia';
}

// Who to remind today: sales whose recurring pay day falls on today (whether
// or not they're also behind on earlier installments), plus clients whose
// promised payment date (clients.nextPaymentDate) is today.
export function getDueToday(sales, clients = [], today = bogotaToday()) {
  const list = [];
  const seen = new Set();
  for (const sale of sales) {
    if (!isPayDayToday(sale, today)) continue;
    const nd = nextDue(sale, today);
    list.push({
      sale,
      installment: nd?.number || 1,
      today,
      dueDate: today,
      daysOverdue: nd?.daysOverdue > 0 && nd.date < today ? nd.daysOverdue : 0,
      reason: nd?.daysOverdue > 0 && nd.date < today ? 'overdue' : 'schedule'
    });
    seen.add(sale.id);
  }
  for (const client of clients) {
    if (client.nextPaymentDate !== today) continue;
    const open = sales.filter((s) => s.clientId === client.id && (s.outstandingBalance || 0) > 0 && !seen.has(s.id));
    if (!open.length || sales.some((s) => s.clientId === client.id && seen.has(s.id))) continue;
    const sale = open.sort((a, b) => b.outstandingBalance - a.outstandingBalance)[0];
    const nd = nextDue(sale, today);
    list.push({ sale, installment: nd?.number || 1, today, dueDate: client.nextPaymentDate, daysOverdue: 0, reason: 'promised' });
  }
  return list;
}
