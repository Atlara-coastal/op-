/**
 * Publicidad y ficha técnica: for a product (alone or from a quote) builds
 *   - an advertising image (photo, price, installments, brand colors), and
 *   - a technical sheet written by AI from the product name + the seller's comments,
 * both shareable as PNG. window.promoModule.open({ productId, quoteId }).
 * The photo can be uploaded, pasted as a link or searched on Google; photo, comments and
 * sheet are saved on the product so they are only prepared once. The AI, the image
 * search and the photo storage run on the server (api/promo.js) to keep the keys private.
 */
import { db } from './db.js';
import { supabase } from './supabase-client.js';
import { canEdit } from './permissions.js';
import { paper, esc, fitPaper, exportImage, brand, brandLogo, BRAND_NAME } from './pdf-doc.js';
import { formatCurrency, formatDate, calculateProductPricing, showToast } from './utils.js';

const CONTACT_KEY = 'promo_contact';
const FONT = "'Outfit','Inter',Arial,sans-serif";

let st = null;

const $ = (id) => document.getElementById(id);
const lines = (text) => String(text || '').split('\n').map((l) => l.replace(/^[\s•✓*-]+/, '').trim()).filter(Boolean);
const specRows = (text) => lines(text).map((l) => {
  const i = l.indexOf(':');
  return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['', l];
}).filter((r) => r[1]);
const cssUrl = (u) => `url('${String(u).replace(/'/g, '%27')}')`;

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
  const b = brand();
  const feats = lines(s.features).slice(0, 4);
  return `<div style="width:640px;box-sizing:border-box;background:#050708;color:#ffffff;font-family:${FONT};">
    <div style="padding:22px 28px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${brandLogo()}" width="40" height="40" style="border-radius:10px;display:block;" alt="">
        <div style="font-size:20px;font-weight:800;letter-spacing:-.02em;">${BRAND_NAME}</div>
      </div>
      <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#050708;background:${b.bright};padding:6px 14px 10px;border-radius:999px;">Llévalo a crédito</div>
    </div>
    <div style="padding:0 28px;">${photoBox(s, 360, 22)}</div>
    <div style="padding:22px 28px 8px;">
      <div style="font-size:30px;font-weight:800;line-height:1.12;letter-spacing:-.02em;">${esc(s.title)}</div>
      ${s.tagline ? `<div style="font-size:15px;color:#cbd5e1;margin-top:6px;">${esc(s.tagline)}</div>` : ''}
      ${feats.length ? `<div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">${feats.map((f) => `<div style="font-size:12px;font-weight:600;color:#e2e8f0;border:1px solid #334155;border-radius:999px;padding:5px 12px 9px;"><span style="color:${b.bright};font-weight:800;">✓</span> ${esc(f)}</div>`).join('')}</div>` : ''}
    </div>
    <div style="margin:14px 28px 0;border-radius:20px;padding:18px 22px;background:linear-gradient(135deg,${b.accent},${b.bright});color:#050708;">
      ${s.price ? `<div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;opacity:.75;">Precio a crédito</div>
      <div style="font-size:40px;font-weight:800;letter-spacing:-.02em;margin-top:-4px;">${esc(s.price)}</div>` : ''}
      ${s.plan ? `<div style="margin-top:${s.price ? 20 : 0}px;"><div style="display:inline-block;font-size:14px;font-weight:700;background:#050708;color:#ffffff;border-radius:999px;padding:6px 16px 10px;">${esc(s.plan)}</div></div>` : ''}
    </div>
    <div style="padding:16px 28px 22px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;font-size:11px;color:#94a3b8;">
      <div style="font-size:13px;font-weight:700;color:#ffffff;">${esc(s.contact)}</div>
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

// ---- state -----------------------------------------------------------------------------
function planDefaults(product, quote) {
  const fc = formatCurrency;
  if (quote && (quote.items || []).some((i) => i.productId === product.id)) {
    const n = quote.installmentsCount || 1;
    const names = quote.items.map((i) => (i.quantity > 1 ? `${i.quantity} ${i.productName}` : i.productName));
    return {
      title: names.length > 1 ? names.join(' + ') : product.name,
      price: fc(quote.totalAmount),
      plan: `${quote.initialPayment > 0 ? `Inicial ${fc(quote.initialPayment)} · ` : ''}${n} ${n === 1 ? 'cuota' : 'cuotas'} ${quote.frequency || 'mensual'}${n === 1 ? '' : 'es'} de ${fc(quote.installmentValue)}`
    };
  }
  const p = calculateProductPricing(product.cost, product.extraExpensesPercent, null, 6, 'mensual');
  return { title: product.name, price: fc(p.finalPrice), plan: `6 cuotas mensuales de ${fc(p.installmentValue)}` };
}

function stateFor(product, quote) {
  const spec = product.spec || {};
  return {
    productId: product.id,
    quote,
    category: product.category || '',
    imageUrl: product.imageUrl || '',
    imageData: null,
    notes: product.promoNotes || '',
    tagline: spec.tagline || '',
    features: (spec.features || []).join('\n'),
    specs: (spec.specs || []).map(([l, v]) => (l ? `${l}: ${v}` : v)).join('\n'),
    contact: (() => { try { return localStorage.getItem(CONTACT_KEY) || ''; } catch { return ''; } })(),
    tab: st?.tab || 'ad',
    ...planDefaults(product, quote)
  };
}

// Photo, comments and sheet live on the product (needs permission to edit the catalog).
function persist(silent = true) {
  if (!st) return;
  try { localStorage.setItem(CONTACT_KEY, st.contact || ''); } catch { /* private mode */ }
  if (!canEdit('products')) {
    if (!silent) showToast('No tienes permiso para guardar en el catálogo; puedes compartir la imagen igual.', 'warning');
    return;
  }
  db.updateItem('products', st.productId, {
    imageUrl: st.imageUrl || '',
    promoNotes: st.notes || '',
    spec: { tagline: st.tagline || '', features: lines(st.features), specs: specRows(st.specs) }
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

function fillForm() {
  ['title', 'tagline', 'notes', 'features', 'specs', 'price', 'plan', 'contact'].forEach((k) => { const el = $('promo-' + k); if (el) el.value = st[k] || ''; });
  const q = $('promo-q');
  if (q) q.value = db.getCollection('products').find((p) => p.id === st.productId)?.name || '';
  const results = $('promo-results');
  if (results) results.innerHTML = '';
}

async function selectProduct(productId, quote) {
  const product = db.getCollection('products').find((p) => p.id === productId);
  if (!product) return;
  st = stateFor(product, quote);
  fillForm();
  renderPreview();
  if (st.imageUrl) {
    const forId = st.productId;
    const data = await loadSavedImage(st.imageUrl);
    if (st && st.productId === forId && data) { st.imageData = data; renderPreview(); }
  }
}

// Takes any picture (data URL), shows it right away and stores it for the product.
async function usePhoto(dataUrl) {
  const jpeg = await compress(dataUrl);
  const forId = st.productId;
  st.imageData = jpeg;
  renderPreview();
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
              <label class="${label}" style="color: var(--text-muted);">Producto</label>
              <select id="promo-product" class="${input}">
                ${products.map((p) => `<option value="${esc(p.id)}" ${p.id === startId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select>
            </div>

            <div class="p-3 rounded-xl space-y-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
              <div class="text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">1. Foto del producto</div>
              <div class="flex flex-wrap items-center gap-2">
                <label class="btn-glass px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"><i data-lucide="upload" class="w-4 h-4"></i> Subir foto
                  <input id="promo-file" type="file" accept="image/*" class="hidden"></label>
                <div class="flex flex-1 min-w-[12rem] gap-2">
                  <input id="promo-link" type="url" placeholder="o pega el enlace de una imagen" class="${input}">
                  <button type="button" id="promo-link-btn" class="btn-glass px-3 py-2 rounded-xl text-xs font-semibold shrink-0">Usar</button>
                </div>
              </div>
              <div class="flex gap-2">
                <input id="promo-q" type="text" placeholder="Buscar en Google…" class="${input}">
                <button type="button" id="promo-search-btn" class="btn-glass px-3 py-2 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1.5"><i data-lucide="search" class="w-4 h-4"></i> Buscar en Google</button>
              </div>
              <div id="promo-results" class="grid grid-cols-4 gap-2"></div>
              <p class="text-[10px]" style="color: var(--text-muted);">Las fotos de internet pueden tener derechos de autor: para publicidad lo más seguro es una foto propia o del fabricante.</p>
            </div>

            <div class="p-3 rounded-xl space-y-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
              <div class="text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">2. Ficha técnica con IA</div>
              <div>
                <label class="${label}" style="color: var(--text-muted);">Comentarios para la IA (medidas, material, marca, color, garantía, lo que quieras destacar)</label>
                <textarea id="promo-notes" rows="3" placeholder="Ej: puerta metálica calibre 20, 2 m × 90 cm, incluye chapa y marco, garantía 1 año" class="${input}"></textarea>
              </div>
              <button type="button" id="promo-ai-btn" class="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"><i data-lucide="sparkles" class="w-4 h-4"></i> Generar ficha con IA</button>
              <div>
                <label class="${label}" style="color: var(--text-muted);">Frase publicitaria</label>
                <input id="promo-tagline" type="text" class="${input}">
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="${label}" style="color: var(--text-muted);">Características (una por línea)</label>
                  <textarea id="promo-features" rows="5" class="${input}"></textarea>
                </div>
                <div>
                  <label class="${label}" style="color: var(--text-muted);">Especificaciones (Dato: valor)</label>
                  <textarea id="promo-specs" rows="5" placeholder="Material: Acero&#10;Medidas: 2 m × 90 cm" class="${input}"></textarea>
                </div>
              </div>
              <p class="text-[10px]" style="color: var(--text-muted);">Revisa lo que escribe la IA antes de enviarlo: puedes corregir cualquier dato aquí mismo.</p>
            </div>

            <div class="p-3 rounded-xl space-y-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
              <div class="text-xs font-semibold uppercase tracking-wide" style="color: var(--primary);">3. Datos del anuncio</div>
              <div>
                <label class="${label}" style="color: var(--text-muted);">Título</label>
                <input id="promo-title" type="text" class="${input}">
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="${label}" style="color: var(--text-muted);">Precio</label>
                  <input id="promo-price" type="text" class="${input}">
                </div>
                <div>
                  <label class="${label}" style="color: var(--text-muted);">Contacto (WhatsApp, dirección)</label>
                  <input id="promo-contact" type="text" placeholder="Ej: WhatsApp 300 123 4567" class="${input}">
                </div>
              </div>
              <div>
                <label class="${label}" style="color: var(--text-muted);">Texto de las cuotas</label>
                <input id="promo-plan" type="text" class="${input}">
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

    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    $('promo-close').addEventListener('click', close);
    $('promo-product').addEventListener('change', (e) => selectProduct(e.target.value, quote));
    ['title', 'tagline', 'notes', 'features', 'specs', 'price', 'plan', 'contact'].forEach((k) => {
      $('promo-' + k).addEventListener('input', (e) => { st[k] = e.target.value; if (k !== 'notes') renderPreview(); });
    });
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
      if (!url) throw new Error('Pega primero el enlace de la imagen.');
      await usePhoto((await api('image', { url })).dataUrl);
      $('promo-link').value = '';
    }));

    const search = (btn) => busy(btn, 'Buscando…', async () => {
      const q = $('promo-q').value.trim();
      if (!q) throw new Error('Escribe qué buscar.');
      const { results } = await api('search', { q });
      const box = $('promo-results');
      box.innerHTML = results.length
        ? results.map((r, i) => `<button type="button" data-result="${i}" title="${esc(r.title)} — ${esc(r.source)}" class="rounded-lg overflow-hidden" style="border: 1px solid var(--border-color); background: #fff; aspect-ratio: 1;"><img src="${esc(r.thumb)}" alt="" referrerpolicy="no-referrer" loading="lazy" style="width:100%;height:100%;object-fit:contain;display:block;"></button>`).join('')
        : `<p class="col-span-4 text-xs" style="color: var(--text-muted);">Google no encontró imágenes para esa búsqueda.</p>`;
      box.querySelectorAll('[data-result]').forEach((b) => b.addEventListener('click', () => busy(b, '…', async () => {
        const r = results[Number(b.dataset.result)];
        let data;
        // Some sites refuse the download: fall back to Google's own (smaller) preview.
        try { data = (await api('image', { url: r.url })).dataUrl; } catch { data = (await api('image', { url: r.thumb })).dataUrl; }
        await usePhoto(data);
      })));
    });
    $('promo-search-btn').addEventListener('click', (e) => search(e.currentTarget));
    $('promo-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search($('promo-search-btn')); } });

    $('promo-ai-btn').addEventListener('click', (e) => busy(e.currentTarget, 'Generando ficha…', async () => {
      const product = db.getCollection('products').find((p) => p.id === st.productId);
      const forId = st.productId;
      const out = await api('spec', { name: product?.name || st.title, category: st.category, notes: st.notes });
      if (!st || st.productId !== forId) return;
      st.tagline = out.tagline;
      st.features = out.features.join('\n');
      st.specs = out.specs.map(([l, v]) => `${l}: ${v}`).join('\n');
      ['tagline', 'features', 'specs'].forEach((k) => { $('promo-' + k).value = st[k]; });
      st.tab = 'sheet';
      renderPreview();
      persist();
      showToast('Ficha generada. Revísala antes de enviarla.', 'success');
    }));

    $('promo-share-btn').addEventListener('click', (e) => busy(e.currentTarget, 'Generando…', async () => {
      const card = $('promo-preview').firstElementChild;
      const name = (st.title || 'producto').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
      const text = [st.title, st.price, st.plan].filter(Boolean).join(' · ');
      await exportImage(card, `${st.tab === 'ad' ? 'Publicidad' : 'Ficha'}-${name}.png`, text);
    }));

    selectProduct(startId, quote);
  }
};
