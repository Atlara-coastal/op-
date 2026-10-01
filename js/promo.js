/**
 * Publicidad y ficha técnica: for a product (alone or from a quote) builds
 *   - an advertising image: the product cut out of its photo over a gradient, big
 *     lettering, price and installments. The AI is the art director (headline, ribbon,
 *     colors, lettering) and receives the whole credit plan; the amounts are always
 *     printed from the real numbers, never written by the AI;
 *   - a technical sheet written by AI from the product name + the seller's comments.
 * Both are shareable as PNG. window.promoModule.open({ productId, quoteId }).
 * The photo can be uploaded or taken from a link (a picture or a product page); photo,
 * comments, sheet and ad design are saved on the product so they are prepared only once.
 * The AI texts and the photo storage run on the server (api/promo.js) to keep the keys
 * private; the background removal runs in the browser (js/cutout.js).
 */
import { db } from './db.js';
import { supabase } from './supabase-client.js';
import { canEdit } from './permissions.js';
import { paper, esc, fitPaper, exportImage, brand, brandLogo, BRAND_NAME } from './pdf-doc.js';
import { formatCurrency, formatDate, financePlan, paymentsPerMonth, termMonths, DEFAULT_INTEREST_RATE, showToast } from './utils.js';
import { removeBackground } from './cutout.js';

const CONTACT_KEY = 'promo_contact';
const CUTOUT_KEY = 'promo_cutout';
const FONT = "'Outfit','Inter',Arial,sans-serif";

// Lettering the AI (or the user) can pick for the ad.
const FONTS = {
  impacto: { label: 'Impacto', css: "'Anton','Outfit',Arial,sans-serif", weight: 400, upper: true, load: "400 60px 'Anton'" },
  redonda: { label: 'Redonda', css: "'Baloo 2','Outfit',Arial,sans-serif", weight: 800, upper: false, load: "800 60px 'Baloo 2'" },
  elegante: { label: 'Elegante', css: "'Playfair Display',Georgia,serif", weight: 900, upper: false, load: "900 60px 'Playfair Display'" }
};
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Anton&family=Baloo+2:wght@800&family=Playfair+Display:wght@900&display=swap';

let st = null;
let lastCut = { src: null, result: null };

const $ = (id) => document.getElementById(id);
const lines = (text) => String(text || '').split('\n').map((l) => l.replace(/^[\s•✓*-]+/, '').trim()).filter(Boolean);
const specRows = (text) => lines(text).map((l) => {
  const i = l.indexOf(':');
  return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['', l];
}).filter((r) => r[1]);
const cssUrl = (u) => `url('${String(u).replace(/'/g, '%27')}')`;
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

// Relative luminance → readable text color on top of a background color.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkOn = (...colors) => (colors.reduce((a, c) => a + luminance(c), 0) / colors.length > 0.4 ? '#0b1220' : '#ffffff');

async function ensureFonts() {
  if (!document.getElementById('promo-fonts')) {
    const link = document.createElement('link');
    link.id = 'promo-fonts';
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    document.head.appendChild(link);
    await new Promise((ok) => { link.onload = ok; link.onerror = ok; });
  }
  await Promise.all(Object.values(FONTS).map((f) => document.fonts.load(f.load).catch(() => {})));
}

async function api(action, payload = {}) {
  if (!supabase) throw new Error('Esta función necesita conexión con la nube.');
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/promo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify({ action, ...payload })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error || (res.status === 404 ? 'Esta función solo está disponible en la versión publicada de la app.' : 'Error ' + res.status));
  return json;
}

// ---- photo helpers ---------------------------------------------------------------------
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  r.readAsDataURL(blob);
});

// Shrinks any picture to a light JPEG on a white background (max 900 px).
const compress = (dataUrl, max = 900) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => {
    const k = Math.min(1, max / Math.max(im.width, im.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.width * k));
    c.height = Math.max(1, Math.round(im.height * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    resolve(c.toDataURL('image/jpeg', 0.82));
  };
  im.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  im.src = dataUrl;
});

// A saved photo is drawn from a data URL so the exported PNG never depends on another site.
async function loadSavedImage(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    return await blobToDataUrl(await r.blob());
  } catch {
    try { return (await api('image', { url })).dataUrl; } catch { return null; }
  }
}

// ---- the two documents -----------------------------------------------------------------
function photoBox(s, height, radius) {
  return s.imageData
    ? `<div style="height:${height}px;border-radius:${radius}px;background-color:#ffffff;background-image:${cssUrl(s.imageData)};background-size:contain;background-position:center;background-repeat:no-repeat;"></div>`
    : `<div style="height:${height}px;border-radius:${radius}px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;font-weight:600;">Agrega una foto del producto</div>`;
}

function adHtml(s) {
  const from = isHex(s.colorFrom) ? s.colorFrom : '#0b1020';
  const to = isHex(s.colorTo) ? s.colorTo : brand().accent;
  const accent = isHex(s.accent) ? s.accent : '#facc15';
  const f = FONTS[s.font] || FONTS.impacto;
  const ink = inkOn(from, to);
  const light = ink === '#ffffff';
  const soft = light ? 'rgba(255,255,255,.8)' : 'rgba(11,18,32,.72)';
  const chip = light ? 'rgba(255,255,255,.16)' : 'rgba(11,18,32,.08)';
  const onAccent = inkOn(accent);
  // the accent only marks the ticks when it stands out from the background
  const check = Math.abs(luminance(accent) - (luminance(from) + luminance(to)) / 2) > 0.3 ? accent : ink;
  const headline = (s.headline || s.title || '').trim();
  const size = headline.length <= 12 ? 68 : headline.length <= 20 ? 56 : headline.length <= 30 ? 46 : 38;
  const display = `font-family:${f.css};font-weight:${f.weight};${f.upper ? 'text-transform:uppercase;letter-spacing:.01em;' : 'letter-spacing:-.01em;'}`;
  const bullets = (lines(s.bullets).length ? lines(s.bullets) : lines(s.features)).slice(0, 3);
  const cut = s.useCutout && s.cutout;

  const product = cut
    ? `<div style="position:relative;height:370px;margin:10px 28px 0;">
        <div style="position:absolute;left:50%;top:50%;width:520px;height:520px;margin:-260px 0 0 -260px;background:radial-gradient(circle closest-side, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 100%);"></div>
        <div style="position:absolute;left:0;right:0;top:0;bottom:6px;background-image:${cssUrl(s.cutout.dataUrl)};background-size:contain;background-position:center bottom;background-repeat:no-repeat;"></div>
      </div>`
    : `<div style="margin:16px 28px 0;">${photoBox(s, 320, 22)}</div>`;

  return `<div style="position:relative;width:640px;box-sizing:border-box;overflow:hidden;background:linear-gradient(150deg, ${from} 0%, ${to} 100%);color:${ink};font-family:${FONT};">
    <div style="position:absolute;right:-160px;top:-160px;width:460px;height:460px;background:radial-gradient(circle closest-side, ${accent}66 0%, ${accent}00 100%);"></div>
    <div style="position:absolute;left:-180px;bottom:100px;width:460px;height:460px;background:radial-gradient(circle closest-side, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 100%);"></div>

    <div style="position:relative;padding:22px 28px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${brandLogo()}" width="38" height="38" style="border-radius:10px;display:block;" alt="">
        <div style="font-size:19px;font-weight:800;letter-spacing:-.02em;">${BRAND_NAME}</div>
      </div>
      ${s.badge ? `<div style="${display}font-size:17px;color:${onAccent};background:${accent};padding:7px 16px 10px;border-radius:10px;transform:rotate(-3deg);">${esc(s.badge)}</div>` : ''}
    </div>

    <div style="position:relative;padding:18px 28px 0;">
      <div style="${display}font-size:${size}px;line-height:1.08;${light ? 'text-shadow:0 4px 0 rgba(0,0,0,.22);' : ''}">${esc(headline)}</div>
      ${s.tagline ? `<div style="font-size:17px;font-weight:600;color:${soft};margin-top:10px;">${esc(s.tagline)}</div>` : ''}
    </div>

    <div style="position:relative;">${product}</div>

    ${bullets.length ? `<div style="position:relative;padding:14px 28px 0;display:flex;flex-wrap:wrap;gap:8px;">${bullets.map((b) => `<div style="font-size:13px;font-weight:700;background:${chip};border-radius:999px;padding:6px 14px 10px;"><span style="color:${check};">✓</span> ${esc(b)}</div>`).join('')}</div>` : ''}

    <div style="position:relative;margin:16px 28px 0;border-radius:22px;padding:16px 22px 20px;background:${accent};color:${onAccent};">
      ${s.price ? `<div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.8;">Precio a crédito</div>
      <div style="${display}font-size:58px;line-height:1.2;margin-top:-6px;">${esc(s.price)}</div>` : ''}
      ${s.plan ? `<div style="margin-top:${s.price ? 26 : 0}px;"><div style="display:inline-block;font-size:15px;font-weight:800;background:${onAccent};color:${accent};border-radius:999px;padding:7px 18px 11px;">${esc(s.plan)}</div></div>` : ''}
    </div>

    <div style="position:relative;padding:16px 28px 22px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;font-size:11px;color:${soft};">
      <div style="font-size:14px;font-weight:800;color:${ink};">${esc(s.contact)}</div>
      <div style="text-align:right;">Sujeto a aprobación de crédito</div>
    </div>
  </div>`;
}

function sheetHtml(s) {
  const b = brand();
  const feats = lines(s.features);
  const specs = specRows(s.specs);
  return paper({
    title: 'Ficha técnica',
    number: s.category || 'Producto',
    date: formatDate(new Date().toISOString()),
    footer: `${s.contact ? esc(s.contact) + '<br>' : ''}Las características pueden variar según la referencia.`,
    body: `
      <div style="display:grid;grid-template-columns:230px 1fr;gap:18px;align-items:center;">
        <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">${photoBox(s, 230, 0)}</div>
        <div>
          <div style="font-size:22px;font-weight:800;line-height:1.15;">${esc(s.title)}</div>
          ${s.tagline ? `<div style="color:#5b6b7f;margin-top:6px;font-size:13px;">${esc(s.tagline)}</div>` : ''}
          ${s.price ? `<div style="margin-top:12px;font-size:22px;font-weight:800;color:${b.accent};">${esc(s.price)}</div>` : ''}
          ${s.plan ? `<div style="color:#5b6b7f;margin-top:2px;">${esc(s.plan)}</div>` : ''}
        </div>
      </div>
      ${feats.length ? `<div>
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${b.accent};margin-bottom:6px;">Características</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;">${feats.map((f) => `<div><span style="color:${b.accent};font-weight:800;">✓</span> ${esc(f)}</div>`).join('')}</div>
      </div>` : ''}
      ${specs.length ? `<div>
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${b.accent};margin-bottom:6px;">Especificaciones</div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">${specs.map(([label, value], i) => `
          <div style="display:grid;grid-template-columns:38% 1fr;gap:10px;padding:8px 12px;background:${i % 2 ? '#ffffff' : '#f8fafc'};">
            <div style="font-weight:700;color:#5b6b7f;">${esc(label || '—')}</div><div>${esc(value)}</div>
          </div>`).join('')}</div>
      </div>` : `<div style="color:#5b6b7f;text-align:center;padding:14px;border:1px dashed #cbd5e1;border-radius:12px;">Genera la ficha con IA o escribe las especificaciones.</div>`}`
  });
}

// ---- credit plan -----------------------------------------------------------------------
// What is being financed: the quote's items when the product belongs to it, else the product.
function planItems(product, quote) {
  return quote && (quote.items || []).some((i) => i.productId === product.id)
    ? quote.items
    : [{ productName: product.name, cost: product.cost, extraExpensesPercent: product.extraExpensesPercent, quantity: 1 }];
}

// Same pricing as a sale: interest on what is left after the down payment, term in months,
// the frequency only splits the monthly installment.
function computePlan(s) {
  const base = s.items.reduce((a, i) => a + (parseFloat(i.cost) || 0) * (1 + (parseFloat(i.extraExpensesPercent) || 0) / 100) * (i.quantity || 1), 0);
  const initial = Math.min(base, Math.max(0, parseFloat(s.initial) || 0));
  const months = Math.max(1, parseInt(s.months) || 1);
  const count = months * paymentsPerMonth(s.frequency);
  const fp = financePlan(base - initial, s.rate, count, s.frequency);
  return { base, initial, months, count, rate: parseFloat(s.rate) || 0, frequency: s.frequency, installment: fp.installment, total: Math.round(base + fp.interest) };
}

function applyPlan() {
  const p = computePlan(st);
  st.price = formatCurrency(p.total);
  st.plan = `${p.initial > 0 ? `Inicial ${formatCurrency(p.initial)} · ` : ''}${p.count} ${p.count === 1 ? 'cuota' : 'cuotas'} ${p.frequency}${p.count === 1 ? '' : 'es'} de ${formatCurrency(p.installment)}`;
  ['price', 'plan'].forEach((k) => { const el = $('promo-' + k); if (el) el.value = st[k]; });
  const hint = $('promo-plan-hint');
  if (hint) hint.textContent = `Costo ${formatCurrency(p.base)} · Total a crédito ${formatCurrency(p.total)} · ${p.count} ${p.count === 1 ? 'pago' : 'pagos'} de ${formatCurrency(p.installment)}`;
  return p;
}

// ---- state -----------------------------------------------------------------------------
function stateFor(product, quote) {
  const spec = product.spec || {};
  const ad = product.adDesign || {};
  const items = planItems(product, quote);
  const fromQuote = items === quote?.items;
  const names = items.map((i) => ((i.quantity || 1) > 1 ? `${i.quantity} ${i.productName}` : i.productName));
  const frequency = (fromQuote && quote.frequency) || 'mensual';
  const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  return {
    productId: product.id,
    quote,
    items,
    category: product.category || '',
    title: fromQuote && names.length > 1 ? names.join(' + ') : product.name,
    imageUrl: product.imageUrl || '',
    imageData: null,
    cutout: null,
    useCutout: read(CUTOUT_KEY, '1') === '1',
    notes: product.promoNotes || '',
    tagline: spec.tagline || '',
    features: (spec.features || []).join('\n'),
    specs: (spec.specs || []).map(([l, v]) => (l ? `${l}: ${v}` : v)).join('\n'),
    contact: read(CONTACT_KEY, ''),
    tab: st?.tab || 'ad',
    // credit plan (prefilled from the quote)
    initial: fromQuote ? quote.initialPayment || 0 : 0,
    rate: fromQuote ? quote.interestRate ?? DEFAULT_INTEREST_RATE : DEFAULT_INTEREST_RATE,
    months: fromQuote ? Math.max(1, Math.round(termMonths(quote.installmentsCount || 1, frequency))) : 6,
    frequency,
    price: '',
    plan: '',
    // ad design (AI or manual)
    headline: ad.headline || (fromQuote && names.length > 1 ? names.join(' + ') : product.name),
    badge: ad.badge ?? 'Llévalo a crédito',
    bullets: (ad.bullets || []).join('\n'),
    colorFrom: isHex(ad.colorFrom) ? ad.colorFrom : '#0b1020',
    colorTo: isHex(ad.colorTo) ? ad.colorTo : brand().accent,
    accent: isHex(ad.accent) ? ad.accent : '#facc15',
    font: FONTS[ad.font] ? ad.font : 'impacto'
  };
}

// Photo, comments, sheet and ad design live on the product (needs permission to edit the catalog).
function persist(silent = true) {
  if (!st) return;
  try { localStorage.setItem(CONTACT_KEY, st.contact || ''); localStorage.setItem(CUTOUT_KEY, st.useCutout ? '1' : '0'); } catch { /* private mode */ }
  if (!canEdit('products')) {
    if (!silent) showToast('No tienes permiso para guardar en el catálogo; puedes compartir la imagen igual.', 'warning');
    return;
  }
  db.updateItem('products', st.productId, {
    imageUrl: st.imageUrl || '',
    promoNotes: st.notes || '',
    spec: { tagline: st.tagline || '', features: lines(st.features), specs: specRows(st.specs) },
    adDesign: { headline: st.headline || '', badge: st.badge || '', bullets: lines(st.bullets), colorFrom: st.colorFrom, colorTo: st.colorTo, accent: st.accent, font: st.font }
  });
  if (!silent) showToast('Guardado en el producto', 'success');
}

function renderPreview() {
  const box = $('promo-preview');
  if (!box || !st) return;
  box.innerHTML = st.tab === 'ad' ? adHtml(st) : sheetHtml(st);
  fitPaper(box);
  document.querySelectorAll('[data-promo-tab]').forEach((b) => {
    const on = b.dataset.promoTab === st.tab;
    b.classList.toggle('btn-primary', on);
    b.classList.toggle('btn-glass', !on);
  });
}

const FIELDS = ['headline', 'badge', 'tagline', 'bullets', 'notes', 'features', 'specs', 'price', 'plan', 'contact', 'initial', 'rate', 'months', 'frequency', 'colorFrom', 'colorTo', 'accent', 'font'];
const PLAN_FIELDS = ['initial', 'rate', 'months', 'frequency'];

function fillForm() {
  FIELDS.forEach((k) => { const el = $('promo-' + k); if (el) el.value = st[k] ?? ''; });
  const cut = $('promo-cutout');
  if (cut) cut.checked = st.useCutout;
}

function cutStatus(text) { const el = $('promo-cutout-status'); if (el) el.textContent = text; }

// Cuts the product out of the current photo (AI model in the browser, see js/cutout.js).
async function updateCutout() {
  if (!st || !st.imageData || !st.useCutout) { cutStatus(''); return; }
  const src = st.imageData;
  if (lastCut.src === src) { st.cutout = lastCut.result; cutStatus(st.cutout ? 'Fondo quitado.' : 'No se pudo recortar esta foto: se muestra completa.'); renderPreview(); return; }
  cutStatus('Quitando el fondo con IA… (la primera vez tarda un poco más)');
  let result = null;
  try { result = await removeBackground(src); } catch (e) { console.error(e); }
  lastCut = { src, result };
  if (!st || st.imageData !== src) return;
  st.cutout = result;
  cutStatus(result ? 'Fondo quitado.' : 'No se pudo recortar esta foto: se muestra completa.');
  renderPreview();
}

async function selectProduct(productId, quote) {
  const product = db.getCollection('products').find((p) => p.id === productId);
  if (!product) return;
  st = stateFor(product, quote);
  fillForm();
  applyPlan();
  renderPreview();
  if (st.imageUrl) {
    const forId = st.productId;
    const data = await loadSavedImage(st.imageUrl);
    if (st && st.productId === forId && data) { st.imageData = data; renderPreview(); updateCutout(); }
  }
}

// Takes any picture (data URL), shows it right away and stores it for the product.
async function usePhoto(dataUrl) {
  const jpeg = await compress(dataUrl);
  const forId = st.productId;
  st.imageData = jpeg;
  st.cutout = null;
  renderPreview();
  updateCutout();
  try {
    const { url } = await api('upload', { productId: forId, dataUrl: jpeg });
    if (st && st.productId === forId) { st.imageUrl = url; persist(); }
    showToast('Foto guardada en el producto', 'success');
  } catch (e) {
    showToast('La foto se usará ahora, pero no se pudo guardar: ' + e.message, 'warning');
  }
}

async function busy(btn, label, fn) {
  const html = btn.innerHTML;
  btn.disabled = true; btn.textContent = label;
  try { await fn(); } catch (e) { console.error(e); showToast(e.message || 'Ocurrió un error', 'error'); } finally {
    btn.disabled = false; btn.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }
}

function close() { document.getElementById('promo-modal')?.remove(); st = null; }

window.promoModule = {
  open({ productId = null, quoteId = null } = {}) {
    const products = db.getCollection('products');
    if (!products.length) return showToast('Primero registra un producto en el catálogo', 'warning');
    const quote = quoteId ? db.getCollection('quotes').find((q) => q.id === quoteId) || null : null;
    const startId = productId || quote?.items?.find((i) => products.some((p) => p.id === i.productId))?.productId || products[0].id;

    document.getElementById('promo-modal')?.remove();
    const label = 'block text-xs font-semibold mb-1';
    const input = 'input-field w-full px-3 py-2 text-sm';
    const box = 'p-3 rounded-xl space-y-3';
    const boxStyle = 'background: var(--bg-card-hover); border: 1px solid var(--border-color);';
    const head = (t) => `<div class="text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">${t}</div>`;
    const lbl = (t) => `<label class="${label}" style="color: var(--text-muted);">${t}</label>`;
    const wrap = document.createElement('div');
    wrap.id = 'promo-modal';
    wrap.className = 'fixed inset-0 z-[70] modal-overlay flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="glass-panel w-full max-w-6xl p-5 space-y-4 animate-fade-in shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between gap-2 pb-3" style="border-bottom: 1px solid var(--border-color);">
          <h3 class="text-base font-bold flex items-center gap-2" style="color: var(--text-main);"><i data-lucide="megaphone" class="w-5 h-5" style="color: var(--primary);"></i> Publicidad y ficha técnica${quote ? ` <span class="font-mono text-xs" style="color: var(--text-muted);">${esc(quote.quoteNumber)}</span>` : ''}</h3>
          <button type="button" id="promo-close" class="p-1" style="color: var(--text-muted);"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="space-y-4">
            <div>
              ${lbl('Producto')}
              <select id="promo-product" class="${input}">
                ${products.map((p) => `<option value="${esc(p.id)}" ${p.id === startId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select>
            </div>

            <div class="${box}" style="${boxStyle}">
              ${head('1. Foto del producto')}
              <div class="flex flex-wrap items-center gap-2">
                <label class="btn-glass px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"><i data-lucide="upload" class="w-4 h-4"></i> Subir foto
                  <input id="promo-file" type="file" accept="image/*" class="hidden"></label>
                <div class="flex flex-1 min-w-[12rem] gap-2">
                  <input id="promo-link" type="url" placeholder="o pega el enlace de la foto o de la página del producto" class="${input}">
                  <button type="button" id="promo-link-btn" class="btn-glass px-3 py-2 rounded-xl text-xs font-semibold shrink-0">Usar</button>
                </div>
              </div>
              <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer" style="color: var(--text-main);">
                <input id="promo-cutout" type="checkbox"> Quitar el fondo de la foto con IA
                <span id="promo-cutout-status" class="font-normal" style="color: var(--text-muted);"></span>
              </label>
            </div>

            <div class="${box}" style="${boxStyle}">
              ${head('2. Plan de crédito')}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>${lbl('Cuota inicial ($)')}<input id="promo-initial" type="number" min="0" step="any" class="${input} font-mono"></div>
                <div>${lbl('% Interés mensual')}<input id="promo-rate" type="number" min="0" step="any" class="${input} font-mono"></div>
                <div>${lbl('Plazo (meses)')}<input id="promo-months" type="number" min="1" max="48" step="1" class="${input} font-mono"></div>
                <div>${lbl('Frecuencia')}
                  <select id="promo-frequency" class="${input}">
                    <option value="semanal">Semanal</option><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option>
                  </select></div>
              </div>
              <p id="promo-plan-hint" class="text-xs" style="color: var(--text-muted);"></p>
            </div>

            <div class="${box}" style="${boxStyle}">
              ${head('3. Inteligencia artificial')}
              <div>
                ${lbl('Comentarios para la IA (medidas, material, marca, color, garantía, lo que quieras destacar)')}
                <textarea id="promo-notes" rows="3" placeholder="Ej: puerta metálica calibre 20, 2 m × 90 cm, incluye chapa y marco, garantía 1 año" class="${input}"></textarea>
              </div>
              <div class="flex flex-wrap gap-2">
                <button type="button" id="promo-ad-btn" class="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"><i data-lucide="sparkles" class="w-4 h-4"></i> Crear publicidad con IA</button>
                <button type="button" id="promo-ai-btn" class="btn-glass px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"><i data-lucide="file-text" class="w-4 h-4"></i> Generar ficha con IA</button>
              </div>
              <p class="text-[10px]" style="color: var(--text-muted);">La IA recibe el producto, tus comentarios y el plan de crédito, y elige el titular, los colores y la letra. Los valores en pesos siempre salen de los números reales. Revisa los textos antes de enviar.</p>
            </div>

            <div class="${box}" style="${boxStyle}">
              ${head('4. Textos y diseño del anuncio')}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>${lbl('Titular')}<input id="promo-headline" type="text" class="${input}"></div>
                <div>${lbl('Etiqueta')}<input id="promo-badge" type="text" class="${input}"></div>
              </div>
              <div>${lbl('Frase')}<input id="promo-tagline" type="text" class="${input}"></div>
              <div>${lbl('Beneficios del anuncio (uno por línea, máximo 3)')}<textarea id="promo-bullets" rows="3" class="${input}"></textarea></div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>${lbl('Precio')}<input id="promo-price" type="text" class="${input}"></div>
                <div>${lbl('Contacto (WhatsApp, dirección)')}<input id="promo-contact" type="text" placeholder="Ej: WhatsApp 300 123 4567" class="${input}"></div>
              </div>
              <div>${lbl('Texto de las cuotas')}<input id="promo-plan" type="text" class="${input}"></div>
              <div class="grid grid-cols-4 gap-3 items-end">
                <div>${lbl('Fondo 1')}<input id="promo-colorFrom" type="color" class="w-full h-9 rounded-lg cursor-pointer" style="background: transparent; border: 1px solid var(--border-color);"></div>
                <div>${lbl('Fondo 2')}<input id="promo-colorTo" type="color" class="w-full h-9 rounded-lg cursor-pointer" style="background: transparent; border: 1px solid var(--border-color);"></div>
                <div>${lbl('Resalte')}<input id="promo-accent" type="color" class="w-full h-9 rounded-lg cursor-pointer" style="background: transparent; border: 1px solid var(--border-color);"></div>
                <div>${lbl('Letra')}
                  <select id="promo-font" class="${input}">${Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select></div>
              </div>
            </div>

            <div class="${box}" style="${boxStyle}">
              ${head('5. Ficha técnica')}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>${lbl('Características (una por línea)')}<textarea id="promo-features" rows="5" class="${input}"></textarea></div>
                <div>${lbl('Especificaciones (Dato: valor)')}<textarea id="promo-specs" rows="5" placeholder="Material: Acero&#10;Medidas: 2 m × 90 cm" class="${input}"></textarea></div>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex gap-2">
                <button type="button" data-promo-tab="ad" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="image" class="w-3.5 h-3.5"></i> Imagen publicitaria</button>
                <button type="button" data-promo-tab="sheet" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> Ficha técnica</button>
              </div>
              <div class="flex gap-2">
                <button type="button" id="promo-save-btn" class="btn-glass px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"><i data-lucide="save" class="w-4 h-4"></i> Guardar</button>
                <button type="button" id="promo-share-btn" class="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"><i data-lucide="share-2" class="w-4 h-4"></i> Enviar imagen</button>
              </div>
            </div>
            <div id="promo-preview" data-no-stack class="rounded-xl overflow-hidden mx-auto w-full" style="border: 1px solid var(--border-color);"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    if (window.lucide) window.lucide.createIcons();
    ensureFonts().then(renderPreview);

    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    $('promo-close').addEventListener('click', close);
    $('promo-product').addEventListener('change', (e) => selectProduct(e.target.value, quote));
    FIELDS.forEach((k) => {
      const el = $('promo-' + k);
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
        st[k] = e.target.value;
        if (PLAN_FIELDS.includes(k)) applyPlan();
        if (k !== 'notes') renderPreview();
      });
    });
    $('promo-cutout').addEventListener('change', (e) => { st.useCutout = e.target.checked; renderPreview(); updateCutout(); });
    wrap.querySelectorAll('[data-promo-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.promoTab; renderPreview(); }));
    $('promo-save-btn').addEventListener('click', () => persist(false));

    $('promo-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try { await usePhoto(await blobToDataUrl(file)); } catch (err) { showToast(err.message, 'error'); }
    });
    $('promo-link-btn').addEventListener('click', (e) => busy(e.currentTarget, 'Descargando…', async () => {
      const url = $('promo-link').value.trim();
      if (!url) throw new Error('Pega primero el enlace de la foto o de la página del producto.');
      await usePhoto((await api('image', { url })).dataUrl);
      $('promo-link').value = '';
    }));

    $('promo-ad-btn').addEventListener('click', (e) => busy(e.currentTarget, 'Diseñando…', async () => {
      const product = db.getCollection('products').find((p) => p.id === st.productId);
      const forId = st.productId;
      const p = computePlan(st);
      const out = await api('ad', {
        name: st.title || product?.name, category: st.category, notes: st.notes, features: lines(st.features).join('; '),
        total: p.total, initial: p.initial, installment: p.installment, count: p.count, frequency: p.frequency, months: p.months, rate: p.rate,
        brandColor: brand().accent
      });
      if (!st || st.productId !== forId) return;
      Object.assign(st, { headline: out.headline, badge: out.badge, tagline: out.subheadline, bullets: out.bullets.join('\n'), colorFrom: out.colorFrom, colorTo: out.colorTo, accent: out.accent, font: out.font, tab: 'ad' });
      fillForm();
      renderPreview();
      persist();
      showToast('Publicidad creada. Puedes ajustar textos y colores.', 'success');
    }));

    $('promo-ai-btn').addEventListener('click', (e) => busy(e.currentTarget, 'Generando ficha…', async () => {
      const product = db.getCollection('products').find((p) => p.id === st.productId);
      const forId = st.productId;
      const out = await api('spec', { name: product?.name || st.title, category: st.category, notes: st.notes });
      if (!st || st.productId !== forId) return;
      if (!st.tagline) st.tagline = out.tagline;
      st.features = out.features.join('\n');
      st.specs = out.specs.map(([l, v]) => `${l}: ${v}`).join('\n');
      st.tab = 'sheet';
      fillForm();
      renderPreview();
      persist();
      showToast('Ficha generada. Revísala antes de enviarla.', 'success');
    }));

    $('promo-share-btn').addEventListener('click', (e) => busy(e.currentTarget, 'Generando…', async () => {
      await ensureFonts();
      const card = $('promo-preview').firstElementChild;
      const name = (st.title || 'producto').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
      const text = [st.title, st.price, st.plan].filter(Boolean).join(' · ');
      await exportImage(card, `${st.tab === 'ad' ? 'Publicidad' : 'Ficha'}-${name}.png`, text);
    }));

    selectProduct(startId, quote);
  }
};
