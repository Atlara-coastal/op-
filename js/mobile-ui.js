/**
 * JocoAdmin - Mobile app-feel helpers.
 *  - Labels every table cell (data-label) so CSS can turn tables into cards on phones.
 */
const SKIP = '#printable-quote, #printable-receipt, [data-no-stack]';
const ACTION_HEADER = /^(acci|comprobante)/i;

function enhanceTable(table) {
  if (table.closest(SKIP)) return;
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim().replace(/\s+/g, ' '));
  if (!heads.length) return;
  table.classList.add('stack-table');
  const lastIsActions = ACTION_HEADER.test(heads[heads.length - 1]);
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const cells = [...tr.children];
    cells.forEach((td, i) => {
      if (td.tagName !== 'TD' || td.colSpan > 1) return;
      const label = heads[i] || '';
      td.setAttribute('data-label', label);
      if (!label) td.setAttribute('data-nolabel', '');
      const isActions = lastIsActions && i === cells.length - 1;
      if (isActions) td.setAttribute('data-actions', '');
      // Several blocks in one cell would sit side by side next to the label: keep them stacked.
      if (i > 0 && !isActions && label && !td.firstElementChild?.classList.contains('cell-val')) {
        const wrap = document.createElement('div');
        wrap.className = 'cell-val';
        while (td.firstChild) wrap.appendChild(td.firstChild);
        td.appendChild(wrap);
      }
    });
  });
}

export function initMobileUI() {
  let scheduled = false;
  const run = () => {
    scheduled = false;
    document.querySelectorAll('table').forEach(enhanceTable);
  };
  run();
  new MutationObserver(() => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(run); }
  }).observe(document.body, { childList: true, subtree: true });
}
