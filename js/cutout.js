/**
 * Background removal for product photos, done by an AI model that runs in the browser
 * (U²-Net "p", Apache-2.0, ~4 MB, downloaded once and cached) — no server and no cost.
 * removeBackground(dataUrl) resolves to { dataUrl, width, height } — a transparent PNG
 * trimmed to the product — or null when the model finds nothing clear to cut out.
 */
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
const MODEL = 'BritishWerewolf/U-2-Netp';
const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let ready = null;
function load() {
  if (!ready) {
    ready = (async () => {
      const T = await import(LIB);
      const model = await T.AutoModel.from_pretrained(MODEL, { dtype: 'fp32' });
      return { T, model, input: model.sessions.model.inputNames[0] };
    })();
    ready.catch(() => { ready = null; }); // let a later attempt retry (e.g. it was offline)
  }
  return ready;
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  im.src = src;
});

export async function removeBackground(dataUrl, maxSide = 900) {
  const [{ T, model, input }, im] = await Promise.all([load(), loadImage(dataUrl)]);

  // photo -> 320×320 normalized tensor
  const small = document.createElement('canvas');
  small.width = SIZE; small.height = SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(im, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;
  const data = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let ch = 0; ch < 3; ch++) data[ch * SIZE * SIZE + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
  }
  const output = await model({ [input]: new T.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
  const m = output[Object.keys(output)[0]].data;

  // saliency map -> alpha. The steep curve removes the pale halo the soft mask leaves.
  let lo = Infinity, hi = -Infinity;
  for (const v of m) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const mask = document.createElement('canvas');
  mask.width = SIZE; mask.height = SIZE;
  const mctx = mask.getContext('2d');
  const md = mctx.createImageData(SIZE, SIZE);
  let covered = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const t = Math.min(1, Math.max(0, ((m[i] - lo) / (hi - lo || 1) - 0.4) / 0.35));
    const a = t * t * (3 - 2 * t);
    md.data[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.5) covered++;
  }
  const share = covered / (SIZE * SIZE);
  if (share < 0.03 || share > 0.93) return null; // nothing, or everything: no real cut-out
  mctx.putImageData(md, 0, 0);

  // apply the mask at the working size and trim to the product
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
