/**
 * JocoAdmin - Themed dropdowns.
 * Native <select> pop-ups are drawn by the OS and ignore the app theme (white
 * lists on a dark UI). This upgrades every <select> into a themed button +
 * floating list, while keeping the real <select> in the DOM (hidden) so all
 * existing code (.value, onchange, form validation) keeps working unchanged.
 */

const enhanced = new WeakSet();
const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
let openState = null;
let menuIdSeq = 0;

function closeMenu() {
  if (!openState) return;
  openState.menu.remove();
  openState.btn.setAttribute('aria-expanded', 'false');
  openState.btn.removeAttribute('aria-activedescendant');
  openState = null;
}

// Keyboard support for the floating listbox: the button keeps DOM focus and
// drives a highlighted option via aria-activedescendant (standard combobox
// pattern), so arrow keys work without moving focus into the menu itself.
function setHighlight(idx) {
  if (!openState) return;
  openState.items.forEach((it, i) => it.el.classList.toggle('highlighted', i === idx));
  openState.highlighted = idx;
  if (idx >= 0) {
    const el = openState.items[idx].el;
    el.scrollIntoView({ block: 'nearest' });
    openState.btn.setAttribute('aria-activedescendant', el.id);
  } else {
    openState.btn.removeAttribute('aria-activedescendant');
  }
}

function moveHighlight(delta) {
  if (!openState) return;
  const items = openState.items;
  const enabled = items.map((_, i) => i).filter((i) => !items[i].disabled);
  if (!enabled.length) return;
  const pos = enabled.indexOf(openState.highlighted);
  const next = pos === -1 ? (delta > 0 ? 0 : enabled.length - 1) : (pos + delta + enabled.length) % enabled.length;
  setHighlight(enabled[next]);
}

function highlightEdge(dir) {
  if (!openState) return;
  const items = openState.items;
  const enabled = items.map((_, i) => i).filter((i) => !items[i].disabled);
  if (!enabled.length) return;
  setHighlight(dir === 'first' ? enabled[0] : enabled[enabled.length - 1]);
}

function selectHighlighted() {
  if (!openState || openState.highlighted < 0) return;
  const it = openState.items[openState.highlighted];
  if (!it.disabled) it.selectFn();
}

function openMenu(select, btn, sync) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'cs-menu';
  menu.setAttribute('role', 'listbox');
  const menuId = 'cs-menu-' + (++menuIdSeq);
  menu.id = menuId;

  const items = [];
  Array.from(select.options).forEach((opt) => {
    if (opt.hidden) return;
    const idx = items.length;
    const item = document.createElement('div');
    item.className = 'cs-opt' + (opt.selected ? ' selected' : '') + (opt.disabled ? ' disabled' : '');
    item.id = menuId + '-opt-' + idx;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(!!opt.selected));
    item.textContent = opt.textContent;
    const selectFn = () => {
      valueDesc.set.call(select, opt.value);
      sync();
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu();
      btn.focus();
    };
    if (!opt.disabled) {
      item.addEventListener('click', selectFn);
      item.addEventListener('mouseenter', () => setHighlight(idx));
    }
    menu.appendChild(item);
    items.push({ el: item, disabled: opt.disabled, selected: opt.selected, selectFn });
  });

  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom;
  const menuH = Math.min(menu.scrollHeight, 280);
  const openUp = spaceBelow < menuH + 12 && r.top > spaceBelow;
  menu.style.width = `${r.width}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))}px`;
  menu.style.maxHeight = `${Math.max(120, Math.min(280, (openUp ? r.top : spaceBelow) - 12))}px`;
  if (openUp) menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
  else menu.style.top = `${r.bottom + 6}px`;

  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-controls', menuId);
  openState = { menu, btn, items, highlighted: -1 };

  const selIdx = items.findIndex((it) => it.selected);
  setHighlight(selIdx >= 0 ? selIdx : items.findIndex((it) => !it.disabled));
}

function enhance(select) {
  if (enhanced.has(select) || select.multiple || select.dataset.native !== undefined) return;
  enhanced.add(select);

  const wrap = document.createElement('div');
  wrap.className = 'cs-wrap ' + (select.className.match(/(?:\S+:)?(?:w-\S+|flex-1|min-w-\S+|max-w-\S+|shrink-0)/g) || []).join(' ');
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('cs-native');
  select.tabIndex = -1;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = select.className.replace('cs-native', '') + ' cs-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  label.className = 'cs-label';
  btn.appendChild(label);
  wrap.appendChild(btn);

  const sync = () => {
    const opt = select.options[select.selectedIndex];
    label.textContent = opt ? opt.textContent : '';
    label.classList.toggle('cs-placeholder', !select.value);
    btn.disabled = select.disabled;
  };

  // Keep the label in sync when code assigns .value directly.
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); sync(); }
  });

  select.addEventListener('change', sync);
  select.form?.addEventListener('reset', () => setTimeout(sync, 0));
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openState?.btn === btn) closeMenu();
    else openMenu(select, btn, sync);
  });
  btn.addEventListener('keydown', (e) => {
    const isOpen = openState?.btn === btn;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) openMenu(select, btn, sync); else moveHighlight(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) openMenu(select, btn, sync); else moveHighlight(-1);
        break;
      case 'Home':
        if (isOpen) { e.preventDefault(); highlightEdge('first'); }
        break;
      case 'End':
        if (isOpen) { e.preventDefault(); highlightEdge('last'); }
        break;
      case 'Enter':
      case ' ':
        if (isOpen) { e.preventDefault(); selectHighlighted(); }
        break;
      case 'Escape':
        if (isOpen) { e.preventDefault(); closeMenu(); }
        break;
      case 'Tab':
        if (isOpen) closeMenu();
        break;
    }
  });

  sync();
}

export function initSelects() {
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches('select')) enhance(root);
    root.querySelectorAll('select').forEach(enhance);
  };
  scan(document.body);
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (e) => {
    if (openState && !openState.menu.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', (e) => {
    if (openState && !openState.menu.contains(e.target)) closeMenu();
  }, true);
}
