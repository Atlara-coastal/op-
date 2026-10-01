/**
 * Credit calculator: fixed monthly installment with interest on the outstanding
 * balance (same amortization() used to price sales and quotes, see js/utils.js).
 * window.creditCalc.open({ amount, rate, months, note }) shows the installment,
 * totals and the full amortization table; every input recalculates live.
 */
import { amortization, financePlan, formatCurrency, DEFAULT_INTEREST_RATE } from './utils.js';

const num = (id) => parseFloat(document.getElementById(id)?.value) || 0;

function close() { document.getElementById('credit-calc-modal')?.remove(); }

function renderResult() {
  const out = document.getElementById('cc-result');
  if (!out) return;
  const amount = num('cc-amount');
  const months = Math.max(1, Math.round(num('cc-months')) || 1);
  const rateRaw = document.getElementById('cc-rate')?.value;
  if (amount <= 0) {
    out.innerHTML = `<p class="text-sm text-center py-6" style="color: var(--text-muted);">Escribe el monto del crédito para ver la cuota y la tabla.</p>`;
    return;
  }
  const a = amortization(amount, rateRaw === '' ? 0 : rateRaw, months);
  const stat = (label, value, color) => `
    <div class="p-3 rounded-xl text-center" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
      <div class="text-[10px] font-bold uppercase tracking-wider" style="color: var(--text-muted);">${label}</div>
      <div class="text-lg font-extrabold font-mono mt-0.5" style="color: ${color};">${value}</div>
    </div>`;
  // What is actually charged: the MONTHLY installment rounded to the nearest $10.000; a
  // fortnightly/weekly payment is that monthly installment split in 2 / 4.
  const modal = document.getElementById('credit-calc-modal');
  const frequency = modal?.dataset.frequency || 'mensual';
  const plan = financePlan(amount, rateRaw === '' ? 0 : rateRaw, months * (parseInt(modal?.dataset.perMonth) || 1), frequency);
  const rounded = plan.interest > 0 ? `
    <div class="p-3 rounded-xl flex flex-wrap items-center justify-between gap-x-4 gap-y-1" style="background: var(--success-bg); border: 1px solid var(--success);">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider" style="color: var(--success);">Cuota a cobrar (redondeada)</div>
        <div class="text-2xl font-extrabold font-mono" style="color: var(--text-main);">${formatCurrency(plan.installment)} <span class="text-xs font-semibold" style="color: var(--text-muted);">${frequency}</span></div>
      </div>
      <div class="text-xs text-right" style="color: var(--text-muted);">
        ${frequency !== 'mensual' ? `Cuota mensual <b style="color: var(--text-main);">${formatCurrency(plan.monthly)}</b> ÷ ${modal?.dataset.perMonth}<br>` : ''}
        ${plan.installments} ${plan.installments === 1 ? 'pago' : 'pagos'} · Total <b style="color: var(--text-main);">${formatCurrency(plan.financed)}</b><br>
        Intereses <b style="color: var(--warning);">${formatCurrency(plan.interest)}</b>
      </div>
    </div>` : '';
  out.innerHTML = `
    ${rounded}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      ${stat('Cuota mensual exacta', formatCurrency(a.installment), 'var(--primary)')}
      ${stat('Total pagado', formatCurrency(a.totalPaid), 'var(--text-main)')}
      ${stat('Total de intereses', formatCurrency(a.totalInterest), 'var(--warning)')}
    </div>
    <div data-no-stack class="overflow-x-auto rounded-xl" style="border: 1px solid var(--border-color);">
      <table class="w-full text-xs text-right" style="color: var(--text-muted);">
        <thead style="background: var(--bg-card-hover);">
          <tr>
            <th class="p-2.5 text-center">Cuota</th>
            <th class="p-2.5">Saldo inicial</th>
            <th class="p-2.5">Interés del mes</th>
            <th class="p-2.5">Cuota fija</th>
            <th class="p-2.5">Abono a capital</th>
            <th class="p-2.5">Saldo final</th>
          </tr>
        </thead>
        <tbody class="divide-y" style="border-color: var(--border-color);">
          ${a.rows.map((r) => `
            <tr>
              <td class="p-2.5 text-center font-bold" style="color: var(--text-main);">${r.n}</td>
              <td class="p-2.5 font-mono whitespace-nowrap">${formatCurrency(r.opening)}</td>
              <td class="p-2.5 font-mono whitespace-nowrap" style="color: var(--warning);">${formatCurrency(r.interest)}</td>
              <td class="p-2.5 font-mono font-bold whitespace-nowrap" style="color: var(--primary);">${formatCurrency(r.payment)}</td>
              <td class="p-2.5 font-mono whitespace-nowrap" style="color: var(--success);">${formatCurrency(r.principal)}</td>
              <td class="p-2.5 font-mono whitespace-nowrap" style="color: var(--text-main);">${formatCurrency(r.closing)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="text-[11px]" style="color: var(--text-muted);">El interés de cada mes se calcula sobre el saldo pendiente del mes anterior. La última cuota se ajusta por redondeo para que el saldo quede en $ 0. La tabla muestra el cálculo exacto; la cuota que se cobra se redondea a los $ 10.000 más cercanos.</p>`;
}

window.creditCalc = {
  open({ amount = '', rate = DEFAULT_INTEREST_RATE, months = 6, note = '', perMonth = 1, frequency = 'mensual' } = {}) {
    close();
    const field = 'block text-xs font-semibold mb-1';
    const input = 'input-field w-full px-3 py-2 text-sm font-mono';
    const wrap = document.createElement('div');
    wrap.id = 'credit-calc-modal';
    wrap.dataset.perMonth = perMonth;
    wrap.dataset.frequency = frequency;
    wrap.className = 'fixed inset-0 z-[80] modal-overlay flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="glass-panel w-full max-w-3xl p-5 space-y-4 animate-fade-in shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between gap-2 pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-base font-bold flex items-center gap-2" style="color: var(--text-main);"><i data-lucide="calculator" class="w-5 h-5" style="color: var(--primary);"></i> Calculadora de crédito</h3>
          <button type="button" id="cc-close" class="p-1" style="color: var(--text-muted);"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label class="${field}" style="color: var(--text-muted);">Monto del crédito ($)</label>
            <input id="cc-amount" type="number" min="0" step="any" value="${amount}" placeholder="2030000" class="${input}"></div>
          <div><label class="${field}" style="color: var(--text-muted);">Interés mensual (%)</label>
            <input id="cc-rate" type="number" min="0" step="any" value="${rate}" class="${input}"></div>
          <div><label class="${field}" style="color: var(--text-muted);">Número de meses</label>
            <input id="cc-months" type="number" min="1" max="120" step="1" value="${months}" class="${input}"></div>
        </div>
        ${note ? `<p class="text-xs px-3 py-2 rounded-lg" style="background: var(--bg-card-hover); border: 1px solid var(--border-color); color: var(--text-muted);">${note}</p>` : ''}
        <div id="cc-result" class="space-y-3"></div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('#cc-close').addEventListener('click', close);
    ['cc-amount', 'cc-rate', 'cc-months'].forEach((id) => wrap.querySelector('#' + id).addEventListener('input', renderResult));
    renderResult();
    if (window.lucide) window.lucide.createIcons();
  }
};
