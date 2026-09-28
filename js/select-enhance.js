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

function closeMenu() {
  if (!openState) return;
  openState.menu.remove();
  openState.btn.setAttribute('aria-expanded', 'false');
  openState = null;
}

function openMenu(select, btn, sync) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'cs-menu';
  menu.setAttribute('role', 'listbox');

  Array.from(select.options).forEach((opt) => {
    if (opt.hidden) return;
    const item = document.createElement('div');
    item.className = 'cs-opt' + (opt.selected ? ' selected' : '') + (opt.disabled ? ' disabled' : '');
    item.setAttribute('role', 'option');
    item.textContent = opt.textContent;
    if (!opt.disabled) {
      item.addEventListener('click', () => {
        valueDesc.set.call(select, opt.value);
        sync();
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closeMenu();
        btn.focus();
      });
    }
    menu.appendChild(item);
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
  menu.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });

  btn.setAttribute('aria-expanded', 'true');
  openState = { menu, btn };
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
    if (e.key === 'Escape') closeMenu();
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
