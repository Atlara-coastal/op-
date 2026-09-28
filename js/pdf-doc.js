/**
 * OP - Branded printable documents (receipts, quotes) and PDF export.
 * The paper is always light with inline colors, so it prints and exports
 * identically in light and dark themes.
 */

const C = { ink: '#0b1220', muted: '#5b6b7f', line: '#e2e8f0', soft: '#f1f5f9', accent: '#16a34a', accentSoft: '#ecfdf5', accentLine: '#bbf7d0', ok: '#059669', okSoft: '#ecfdf5', warn: '#d97706', black: '#000000' };

const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>' +
  '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="70" y1="180" x2="442" y2="332"><stop offset="0" stop-color="#86efac"/><stop offset=".55" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient></defs>' +
  '<rect width="512" height="512" rx="120" fill="#000000"/>' +
  '<text x="256" y="330" font-family="Arial,sans-serif" font-weight="800" font-size="220" text-anchor="middle" fill="url(#g)">OP</text></svg>'
);

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Pieces for building document bodies.
export const docBox = (label, inner, tone = 'soft') => {
  const t = { soft: [C.soft, C.line, C.muted], ok: [C.okSoft, '#a7f3d0', C.ok], cyan: [C.accentSoft, C.accentLine, C.accent] }[tone];
  return `<div style="background:${t[0]};border:1px solid ${t[1]};border-radius:12px;padding:12px 14px;">
    <div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${t[2]};margin-bottom:4px;">${label}</div>${inner}</div>`;
};

export function paper({ title, number, date, body, footer = '' }) {
  return `<div style="width:640px;box-sizing:border-box;background:#fff;color:${C.ink};font-family:'Outfit','Inter',Arial,sans-serif;">
    <div style="background:${C.black};padding:22px 28px;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="${LOGO}" width="46" height="46" style="border-radius:11px;display:block;" alt="">
        <div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:#fff;">OP</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:1px;">${esc(title)}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:#4ade80;">${esc(number)}</div>
        <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">${esc(date)}</div>
      </div>
    </div>
    <div style="height:4px;background:linear-gradient(90deg,#16a34a,#4ade80);"></div>
    <div style="padding:24px 28px;display:flex;flex-direction:column;gap:16px;font-size:12px;">${body}</div>
    <div style="padding:14px 28px 20px;border-top:1px solid ${C.line};display:flex;justify-content:space-between;align-items:flex-end;font-size:10px;color:${C.muted};">
      <div>${footer}</div>
      <div style="text-align:right;"><b style="color:${C.ink};">OP</b><br>Documento generado electrónicamente</div>
    </div>
  </div>`;
}

const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)?.dataset.loaded) return resolve();
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => { s.dataset.loaded = '1'; resolve(); };
  s.onerror = () => reject(new Error('No se pudo cargar ' + src));
  document.head.appendChild(s);
});

// Renders the element as an A4 PDF and shares it (mobile) or downloads it.
export function fitPaper(container) {
  const el = container.firstElementChild;
  if (!el) return;
  el.style.zoom = '';
  const w = container.clientWidth;
  if (w && w < 640) el.style.zoom = String(w / 640);
}

export async function exportPdf(el, filename) {
  const prevZoom = el.style.zoom;
  el.style.zoom = '1';
  await Promise.all([
    window.html2canvas || loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'),
    window.jspdf || loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js')
  ]);
  let canvas;
  try { canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }); } finally { el.style.zoom = prevZoom; }
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  const img = canvas.toDataURL('image/jpeg', 0.95);
  let y = 0;
  pdf.addImage(img, 'JPEG', 0, y, pageW, imgH);
  while (imgH + y > pageH + 0.5) {
    y -= pageH;
    pdf.addPage();
    pdf.addImage(img, 'JPEG', 0, y, pageW, imgH);
  }

  const blob = pdf.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Desktop browsers (not the native app, not phones/tablets) use the print dialog.
export const isDesktopWeb = () =>
  !window.Capacitor?.isNativePlatform?.() && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

export async function exportPdfById(id, filename, btn) {
  if (isDesktopWeb()) { window.print(); return; }
  const el = document.getElementById(id)?.firstElementChild;
  if (!el) return;
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    await exportPdf(el, filename);
  } catch (e) {
    console.error(e);
    alert('No se pudo generar el PDF. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label; if (window.lucide) window.lucide.createIcons(); }
  }
}

// Renders the element as a PNG and shares it (mobile) or downloads it. Returns true if shared/downloaded.
export async function exportImage(el, filename, text = '') {
  const prevZoom = el.style.zoom;
  el.style.zoom = '1';
  await Promise.all([window.html2canvas || loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js')]);
  let canvas;
  try { canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }); } finally { el.style.zoom = prevZoom; }
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text, title: filename }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}