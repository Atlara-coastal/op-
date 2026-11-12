/**
 * JocoAdmin - Searchable selects.
 * A <select> holding clients or products is two clicks plus a long scroll. This
 * turns any marked select into a searchable one: the input filters the real
 * <select> (hiding non-matching <option>s, so existing save handlers keep
 * working untouched) and shows the matches right away in a panel underneath.
 *
 * Usage: put selectSearchBox('<selectId>', 'placeholder') above the select.
 * Matching reads option[data-search] when present, otherwise the option text.
 */

let openPanel = null;

function hidePanel(panel) {
  if (!panel) return;
  panel.classList.add('hidden');
  panel.innerHTML = '';
  if (openPanel === panel) openPanel = null;
}

function closePanels(except) {
  document.querySelectorAll('[data-ss-results]').forEach((panel) => {
    if (panel !== except) hidePanel(panel);
  });
}

function selectFor(input) {
  const id = input.getAttribute('data-select-search');
  return id ? document.getElementById(id) : null;
}

function panelFor(input) {
  return input.parentElement?.querySelector('[data-ss-results]') || null;
}

function optionText(opt) {
  return (opt.dataset.search || opt.textContent || '').toLowerCase();
}

function showPanel(panel, html) {
  panel.innerHTML = html;
  panel.classList.remove('hidden');
  openPanel = panel;
}

function filter(input, forceOpen = false) {
  const select = selectFor(input);
  const panel = panelFor(input);
  if (!select || !panel) return;

  const q = input.value.trim().toLowerCase();
  const matches = [];

  Array.from(select.options).forEach((opt) => {
    if (!opt.value) return; // keep the placeholder
    opt.hidden = Boolean(q) && !optionText(opt).includes(q);
    if (!opt.hidden) matches.push(opt);
  });

  if (!q && !forceOpen) {
    hidePanel(panel);
    return;
  }

  const shown = matches.slice(0, 8);
  const rows = shown.map((opt) => `
    <div data-ss-pick="${opt.value}" class="px-3 py-2.5 text-sm cursor-pointer" style="border-bottom: 1px solid var(--border-color);" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='transparent'">${opt.textContent}</div>
  `).join('');

  const more = matches.length > shown.length
    ? `<div class="px-3 py-2 text-xs text-center" style="color: var(--text-muted);">+${matches.length - shown.length} más — sigue escribiendo para afinar</div>`
    : '';

  showPanel(panel, matches.length
    ? rows + more
    : `<div class="px-3 py-3 text-xs text-center" style="color: var(--text-muted);">Sin resultados para "${input.value.trim()}"</div>`);
}

function pick(input, value) {
  const select = selectFor(input);
  if (!select) return;

  select.value = value;
  // The chosen option may have been hidden by the filter; show the full list
  // again so opening the dropdown afterwards isn't limited to the last search.
  Array.from(select.options).forEach((opt) => { opt.hidden = false; });
  input.value = select.options[select.selectedIndex]?.textContent || '';
  hidePanel(panelFor(input));

  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Markup for the search box that filters `selectId`. */
export function selectSearchBox(selectId, placeholder, extraClass = '') {
  return `
    <div class="relative ${extraClass}">
      <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3" style="color: var(--text-muted);"></i>
      <input type="text" data-select-search="${selectId}" autocomplete="off" placeholder="${placeholder}" class="input-field w-full pl-9 pr-4 py-2 text-sm">
      <div data-ss-results class="hidden absolute left-0 right-0 top-full mt-1 rounded-xl overflow-y-auto z-30" style="background: var(--bg-card-solid); border: 1px solid var(--border-color); box-shadow: var(--shadow-glow), 0 14px 34px rgba(0,0,0,.35); max-height: 240px;"></div>
    </div>
  `;
}

/** Clears the box and restores every option of the select (call when a modal opens). */
export function resetSelectSearch(selectId) {
  const input = document.querySelector(`[data-select-search="${selectId}"]`);
  const select = document.getElementById(selectId);
  if (select) Array.from(select.options).forEach((opt) => { opt.hidden = false; });
  if (!input) return;
  input.value = '';
  hidePanel(panelFor(input));
}

export function initSelectSearch() {
  document.addEventListener('input', (e) => {
    const input = e.target.closest?.('[data-select-search]');
    if (input) filter(input);
  });

  document.addEventListener('focusin', (e) => {
    const input = e.target.closest?.('[data-select-search]');
    if (input) filter(input, true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closePanels(null);
  });

  document.addEventListener('click', (e) => {
    const pickRow = e.target.closest?.('[data-ss-pick]');
    if (pickRow) {
      e.preventDefault();
      const panel = pickRow.closest('[data-ss-results]');
      const input = panel?.parentElement.querySelector('[data-select-search]');
      if (input) pick(input, pickRow.getAttribute('data-ss-pick'));
      return;
    }
    if (!e.target.closest?.('[data-select-search], [data-ss-results]')) closePanels(null);
  });

  // Touching the filtered select directly restores the full list, so the
  // dropdown never shows only the leftovers of an old search.
  document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest?.('.cs-btn');
    if (!btn) return;
    const wrap = btn.parentElement;
    wrap?.querySelectorAll('select option').forEach((opt) => { opt.hidden = false; });
  });
}
