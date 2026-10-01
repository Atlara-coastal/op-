/**
 * Background removal for product photos. The AI model runs on the server (api/promo.js,
 * action "cutout") and answers with a small transparency mask; here the photo is only
 * painted through that mask and trimmed to the product — no model runs on the device.
 * removeBackground(dataUrl, getMask) resolves to { dataUrl, width, height } (transparent
 * PNG) or null when there is no clear product to cut out.
 */
const loadImage = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  im.src = src;
});

// getMask(dataUrl) -> { size, mask } where mask is base64 of size×size alpha bytes (or null).
export async function removeBackground(dataUrl, getMask, maxSide = 760) {
  const [{ size, mask: encoded }, im] = await Promise.all([getMask(dataUrl), loadImage(dataUrl)]);
  if (!encoded) return null;

  const bytes = atob(encoded);
  const mask = document.createElement('canvas');
  mask.width = size; mask.height = size;
  const mctx = mask.getContext('2d');
  const md = mctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) md.data[i * 4 + 3] = bytes.charCodeAt(i);
  mctx.putImageData(md, 0, 0);

  // paint the photo through the mask at the working size…
  const k = Math.min(1, maxSide / Math.max(im.width, im.height));
  const w = Math.max(1, Math.round(im.width * k));
  const h = Math.max(1, Math.round(im.height * k));
  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  const ctx = full.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mask, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(im, 0, 0, w, h);

  // …and trim it to the product
  const alpha = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(full, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL('image/png'), width: out.width, height: out.height };
}
