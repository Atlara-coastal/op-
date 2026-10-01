/**
 * POST /api/promo   Body: { action, ... }
 * Header: Authorization: Bearer <access token of any signed-in user>
 * Server side of the "Publicidad y ficha técnica" studio (js/promo.js). One function,
 * four actions, so the API keys never reach the browser:
 *   spec   { name, category, notes }  -> AI-written technical sheet (Google Gemini)
 *   search { q }                      -> product photos from Google Images (Custom Search)
 *   image  { url }                    -> downloads a remote picture as a data URL (the browser
 *                                        cannot read other sites' images into a canvas)
 *   upload { productId, dataUrl }     -> stores the product photo in Supabase Storage
 * Environment variables (Vercel, never committed):
 *   GEMINI_API_KEY [, GEMINI_MODEL]   -> action "spec", and "search" (Gemini + Google Search)
 *   GOOGLE_CSE_KEY, GOOGLE_CSE_CX     -> optional: "search" straight from Google Images
 */
import dns from 'dns/promises';
import net from 'net';
import { getSupabaseAdmin, getCaller } from './_supabaseAdmin.js';

// The AI search (Gemini + reading the pages it finds) can take longer than the default limit.
export const config = { maxDuration: 60 };

const BUCKET = 'product-images';
const MAX_REMOTE_IMAGE = 3 * 1024 * 1024;
const MAX_UPLOAD = 700 * 1024;

class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---- spec: technical sheet written by Gemini -------------------------------------------
const SPEC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tagline: { type: 'STRING' },
    features: { type: 'ARRAY', items: { type: 'STRING' } },
    specs: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, value: { type: 'STRING' } }, required: ['label', 'value'] }
    }
  },
  required: ['tagline', 'features', 'specs']
};

const SPEC_SYSTEM = `Eres un redactor de fichas técnicas y publicidad para una tienda en Colombia que vende productos a crédito.
Recibes el nombre de un producto, su categoría y comentarios del vendedor. Responde en español neutro, claro y vendedor, sin exagerar.
Reglas:
- Los comentarios del vendedor son la fuente principal y mandan sobre cualquier otra cosa: úsalos tal cual (medidas, material, marca, color, garantía).
- Si el nombre identifica un modelo comercial concreto que conoces bien (por ejemplo un celular o electrodoméstico con marca y referencia), usa sus especificaciones reales.
- Si el producto es genérico o no estás seguro de un dato, NO inventes cifras exactas: omite ese dato o escribe "Según referencia".
- "tagline": una frase publicitaria corta (máximo 9 palabras), sin comillas ni emojis.
- "features": de 3 a 5 beneficios cortos (máximo 8 palabras cada uno).
- "specs": de 4 a 9 filas de ficha técnica, cada una con "label" (1 a 3 palabras) y "value" (corto).
- No menciones precios, cuotas ni intereses.`;

// Calls Gemini with the fast model first; when that one is saturated, out of quota, retired
// or too slow, the next one is tried. Returns the last response.
const GEMINI_MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest'].filter(Boolean);
async function gemini(key, body) {
  let last = { r: { ok: false, status: 504 }, data: { error: { message: 'sin respuesta' } } };
  for (const model of GEMINI_MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000)
      });
      last = { r, data: await r.json().catch(() => ({})) };
      if (r.ok) return last;
      if (![404, 429, 500, 503].includes(r.status)) return last;
    } catch (e) {
      last = { r: { ok: false, status: 504 }, data: { error: { message: 'la IA tardó demasiado' } } };
    }
  }
  return last;
}

async function actionSpec(body) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ApiError(503, 'La IA todavía no está configurada: falta la clave GEMINI_API_KEY en Vercel.', 'not_configured');
  const name = text(body.name, 200);
  if (!name) throw new ApiError(400, 'Falta el nombre del producto.');
  const prompt = `Producto: ${name}\nCategoría: ${text(body.category, 80) || 'Sin categoría'}\nComentarios del vendedor: ${text(body.notes, 2000) || 'Ninguno'}`;
  const { r, data } = await gemini(key, {
    systemInstruction: { parts: [{ text: SPEC_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: SPEC_SCHEMA }
  });
  if (r.status === 429) throw new ApiError(429, 'Se alcanzó el límite gratuito de la IA por ahora. Inténtalo de nuevo en un minuto.', 'rate_limited');
  if (!r.ok) {
    console.error('[promo:spec]', r.status, data?.error?.message);
    throw new ApiError(502, 'La IA no respondió (' + (data?.error?.message || r.status) + ').');
  }
  const raw = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  let out;
  try { out = JSON.parse(raw); } catch { throw new ApiError(502, 'La IA devolvió una respuesta que no se pudo leer. Inténtalo de nuevo.'); }
  return {
    tagline: text(out.tagline, 120),
    features: (Array.isArray(out.features) ? out.features : []).map((f) => text(f, 90)).filter(Boolean).slice(0, 6),
    specs: (Array.isArray(out.specs) ? out.specs : []).map((s) => [text(s?.label, 40), text(s?.value, 120)]).filter((s) => s[0] && s[1]).slice(0, 12)
  };
}

// ---- search: product photos from the web ------------------------------------------------
// With GOOGLE_CSE_KEY + GOOGLE_CSE_CX it asks Google Images directly. Otherwise Gemini does
// the search itself (Google Search tool) and the main picture of each page it finds is used,
// so the Gemini key alone is enough.
async function actionSearch(body) {
  const q = text(body.q, 120);
  if (!q) throw new ApiError(400, 'Escribe qué buscar.');
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) return cseSearch(q, process.env.GOOGLE_CSE_KEY, process.env.GOOGLE_CSE_CX);
  if (process.env.GEMINI_API_KEY) return geminiSearch(q, process.env.GEMINI_API_KEY);
  throw new ApiError(503, 'La búsqueda de imágenes todavía no está configurada: falta la clave GEMINI_API_KEY en Vercel.', 'not_configured');
}

// The picture a page announces for itself when it is shared (Open Graph / Twitter card).
function pageImage(html, base) {
  const metas = html.match(/<meta[^>]+>/gi) || [];
  for (const prop of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    const tag = metas.find((m) => new RegExp(`(?:property|name)=["']${prop}["']`, 'i').test(m));
    const content = tag && /content=["']([^"']+)["']/i.exec(tag);
    if (!content) continue;
    try {
      const u = new URL(content[1].replace(/&amp;/g, '&'), base);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch { /* malformed: try the next tag */ }
  }
  return null;
}

async function geminiSearch(q, key) {
  const { r, data } = await gemini(key, {
    contents: [{ role: 'user', parts: [{ text: `Busca en Google páginas de tiendas en línea o del fabricante donde se venda este producto y se vea su foto: "${q}". Prefiere tiendas de Colombia. Responde solo con una lista corta de las páginas encontradas.` }] }],
    tools: [{ google_search: {} }]
  });
  // Google does not include its search tool in Gemini's free plan (quota 0 → 429).
  if (r.status === 429) throw new ApiError(429, 'La búsqueda automática no está incluida en el plan gratuito de la IA. Sube la foto o pega el enlace de la imagen.', 'rate_limited');
  if (!r.ok) {
    console.error('[promo:search]', r.status, data?.error?.message);
    throw new ApiError(502, 'La IA no pudo buscar (' + (data?.error?.message || r.status) + ').');
  }
  const pages = [];
  for (const c of data.candidates?.[0]?.groundingMetadata?.groundingChunks || []) {
    if (c.web?.uri && !pages.some((p) => p.uri === c.web.uri)) pages.push(c.web);
  }
  const found = await Promise.all(pages.slice(0, 10).map(async (p) => {
    try {
      const { r: page, url } = await fetchPublic(p.uri, 'text/html,application/xhtml+xml', 7000);
      if (!page.ok || !/html/i.test(page.headers.get('content-type') || '')) return null;
      const image = pageImage((await page.text()).slice(0, 600000), url);
      return image ? { url: image, thumb: image, title: text(p.title, 120), source: url.hostname.replace(/^www\./, '') } : null;
    } catch { return null; }
  }));
  const results = [];
  for (const f of found) if (f && !results.some((x) => x.url === f.url)) results.push(f);
  return { results: results.slice(0, 8) };
}

async function cseSearch(q, key, cx) {
  const url ='https://www.googleapis.com/customsearch/v1?' + new URLSearchParams({ key, cx, q, searchType: 'image', num: '8', safe: 'active', gl: 'co', hl: 'es' });
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (r.status === 429) throw new ApiError(429, 'Se acabaron las búsquedas gratuitas de Google por hoy (100 al día).', 'rate_limited');
  if (!r.ok) {
    console.error('[promo:search]', r.status, data?.error?.message);
    throw new ApiError(502, 'Google no respondió (' + (data?.error?.message || r.status) + ').');
  }
  return {
    results: (data.items || []).filter((i) => /^https?:\/\//.test(i.link || '')).map((i) => ({
      url: i.link,
      thumb: i.image?.thumbnailLink || i.link,
      title: text(i.title, 120),
      source: text(i.displayLink, 80)
    }))
  };
}

// ---- image: fetch a remote picture, refusing anything that is not a public web image ---
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new ApiError(400, 'El enlace de la imagen no es válido.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ApiError(400, 'El enlace debe empezar por http:// o https://');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new ApiError(400, 'No se puede descargar una imagen de esa dirección.');
  return u;
}

// GET of a public web address; every redirect hop is checked again before following it.
async function fetchPublic(raw, accept, timeoutMs) {
  let url = await assertPublicUrl(raw);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; ; hop++) {
    const r = await fetch(url, {
      redirect: 'manual',
      signal,
      // Many shops only serve their pages and pictures to browser-looking clients.
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', Accept: accept, 'Accept-Language': 'es-CO,es;q=0.9' }
    });
    if (r.status < 300 || r.status >= 400) return { r, url };
    const next = r.headers.get('location');
    if (!next || hop >= 4) throw new ApiError(502, 'La dirección redirige demasiadas veces.');
    url = await assertPublicUrl(new URL(next, url).href);
  }
}

async function actionImage(body) {
  const { r } = await fetchPublic(String(body.url || '').trim(), 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 12000);
  if (!r.ok) throw new ApiError(502, 'Ese sitio no dejó descargar la imagen (' + r.status + '). Prueba con otra.');
  const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) throw new ApiError(415, 'El enlace no es una imagen (jpg, png o webp).');
  if (Number(r.headers.get('content-length') || 0) > MAX_REMOTE_IMAGE) throw new ApiError(413, 'La imagen es demasiado pesada (máximo 3 MB).');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_REMOTE_IMAGE) throw new ApiError(413, 'La imagen es demasiado pesada (máximo 3 MB).');
  return { dataUrl: `data:${type};base64,${buf.toString('base64')}` };
}

// ---- upload: keep the (already compressed) product photo in Supabase Storage ------------
async function actionUpload(admin, body) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
  if (!match) throw new ApiError(400, 'La foto debe enviarse como JPEG.');
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > MAX_UPLOAD) throw new ApiError(413, 'La foto es demasiado pesada.');
  const productId = String(body.productId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!productId) throw new ApiError(400, 'Falta el producto.');

  const { error: bucketError } = await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_UPLOAD, allowedMimeTypes: ['image/jpeg'] });
  if (bucketError && !/exist/i.test(bucketError.message || '')) throw bucketError;

  const path = `${productId}/${Date.now()}.jpg`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
  if (error) throw error;
  return { url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    const caller = await getCaller(admin, req);
    if (caller.error) {
      res.status(caller.status).json({ error: caller.error });
      return;
    }
    if (!caller.profile) {
      res.status(403).json({ error: 'Tu cuenta no tiene perfil.' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let out;
    if (body.action === 'spec') out = await actionSpec(body);
    else if (body.action === 'search') out = await actionSearch(body);
    else if (body.action === 'image') out = await actionImage(body);
    else if (body.action === 'upload') out = await actionUpload(admin, body);
    else throw new ApiError(400, 'Acción desconocida.');
    res.status(200).json(out);
  } catch (err) {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error('[promo]', err);
    res.status(500).json({ error: err?.name === 'TimeoutError' ? 'La imagen tardó demasiado en descargar.' : (err.message || 'Error interno.') });
  }
}
