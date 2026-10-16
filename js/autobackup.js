/**
 * OP - Daily automatic backup on THIS device (admins only).
 *
 * An admin turns it on per device. From then on, the first time the app is open each
 * day (after the cloud data has been pulled) a full JSON backup is saved:
 *  - into a folder the admin picked, when the browser supports it (Chrome/Edge on a
 *    computer), silently and without filling the Downloads folder;
 *  - otherwise as a normal download (it lands in Descargas / Downloads).
 * The setting and the last backup date live in this device's localStorage, so each
 * phone or computer decides for itself.
 */
import { db } from './db.js';
import { isAdmin } from './permissions.js';
import { showToast } from './utils.js';

const FILE_PREFIX = 'OP_Backup';
const KEY = 'crediventas_autobackup';
const HANDLE_DB = 'crediventas-autobackup';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const readState = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const writeState = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } };
const folderSupported = () => typeof window.showDirectoryPicker === 'function';

// --- folder handle persisted in IndexedDB (handles can't go in localStorage) ---
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(HANDLE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('h');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('h', mode);
      const req = fn(tx.objectStore('h'));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const getFolder = () => idb('readonly', (s) => s.get('dir')).catch(() => null);
const setFolder = (h) => idb('readwrite', (s) => (h ? s.put(h, 'dir') : s.delete('dir')));

async function folderWritable(handle, ask) {
  if (!handle) return false;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return ask ? (await handle.requestPermission(opts)) === 'granted' : false;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Saves one backup now. `fromClick` lets the browser show a folder-permission prompt.
async function saveBackup(fromClick = false) {
  const name = `${FILE_PREFIX}_${today()}.json`;
  const text = db.exportDatabaseJSON();
  const handle = folderSupported() ? await getFolder() : null;
  let where = 'Descargas';
  if (handle && await folderWritable(handle, fromClick)) {
    const file = await handle.getFileHandle(name, { create: true });
    const w = await file.createWritable(); await w.write(text); await w.close();
    where = `la carpeta "${handle.name}"`;
  } else {
    download(name, text);
  }
  writeState({ ...readState(), last: today() });
  return where;
}

let running = false;
async function runIfDue() {
  if (running || !isAdmin()) return;
  const st = readState();
  if (!st.on || st.last === today()) return;
  running = true;
  try {
    const where = await saveBackup(false);
    showToast(`Copia automática del día guardada en ${where}`, 'success');
  } catch (e) {
    console.error('[OP] Copia automática:', e);
  } finally { running = false; }
}

// --- settings modal (built on demand) ---
function openSettings() {
  if (!isAdmin()) return;
  document.getElementById('autobackup-modal')?.remove();
  const st = readState();
  const wrap = document.createElement('div');
  wrap.id = 'autobackup-modal';
  wrap.className = 'fixed inset-0 z-[95] flex items-center justify-center px-4 modal-overlay';
  wrap.innerHTML = `
    <div class="w-full mx-auto glass-panel p-6 space-y-5 max-h-[85vh] overflow-y-auto" style="width: min(100%, 28rem);">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-wider" style="color: var(--primary);">Solo administradores</p>
          <h2 class="text-lg font-bold" style="color: var(--text-main);">Copia automática diaria</h2>
        </div>
        <button data-ab="close" class="btn-glass p-1.5 rounded-lg" title="Cerrar"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <p class="text-sm" style="color: var(--text-muted);">Cada día, la primera vez que se abra la app en <b style="color: var(--text-main);">este dispositivo</b>, se guarda una copia completa (clientes, ventas, abonos, productos y cotizaciones) en un archivo JSON.</p>
      <div class="p-3 rounded-xl flex items-center justify-between gap-3" style="background: var(--bg-card-hover); border: 1px solid var(--border-color);">
        <div class="min-w-0">
          <p class="text-[11px] font-bold uppercase tracking-wider" style="color: var(--text-muted);">Estado en este dispositivo</p>
          <p class="text-sm font-bold" style="color: ${st.on ? 'var(--success)' : 'var(--text-main)'};">${st.on ? 'Activada' : 'Desactivada'}</p>
          <p class="text-xs mt-0.5" style="color: var(--text-muted);">Última copia: ${st.last || 'ninguna todavía'}</p>
        </div>
        <button data-ab="toggle" class="${st.on ? 'btn-glass' : 'btn-primary'} px-4 py-2.5 rounded-xl text-xs font-bold">${st.on ? 'Desactivar' : 'Activar'}</button>
      </div>
      ${folderSupported() ? `
      <div class="space-y-2">
        <p class="text-[11px] font-bold uppercase tracking-wider" style="color: var(--text-muted);">Dónde se guarda</p>
        <p id="ab-folder" class="text-xs" style="color: var(--text-muted);">Cargando…</p>
        <div class="grid grid-cols-2 gap-2">
          <button data-ab="folder" class="btn-glass py-2.5 rounded-xl text-xs font-bold">Elegir carpeta</button>
          <button data-ab="nofolder" class="btn-glass py-2.5 rounded-xl text-xs font-bold">Usar Descargas</button>
        </div>
      </div>` : `
      <p class="text-xs" style="color: var(--text-muted);">En este navegador la copia se guarda en <b style="color: var(--text-main);">Descargas</b> como <code>${FILE_PREFIX}_AAAA-MM-DD.json</code>.</p>`}
      <button data-ab="now" class="btn-glass w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4" style="color: var(--primary);"></i> Hacer una copia ahora</button>
      <p class="text-[11px]" style="color: var(--text-muted);">Para restaurar, usa el botón de restaurar copia y elige el archivo del día que quieras.</p>
    </div>`;
  document.body.appendChild(wrap);
  if (window.lucide) window.lucide.createIcons();

  const showFolder = async () => {
    const el = wrap.querySelector('#ab-folder'); if (!el) return;
    const h = await getFolder();
    el.innerHTML = h ? `Carpeta: <b style="color: var(--text-main);">${h.name}</b>` : 'Descargas (carpeta de descargas del navegador)';
  };
  showFolder();

  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap) return wrap.remove();
    const act = e.target.closest('[data-ab]')?.dataset.ab;
    if (!act) return;
    try {
      if (act === 'close') wrap.remove();
      if (act === 'toggle') {
        const s = readState();
        writeState({ ...s, on: !s.on });
        showToast(!s.on ? 'Copia automática activada en este dispositivo' : 'Copia automática desactivada en este dispositivo', 'success');
        if (!s.on) await runIfDue();
        openSettings();
      }
      if (act === 'folder') {
        const h = await window.showDirectoryPicker({ id: 'autobackup', mode: 'readwrite' });
        await setFolder(h); await showFolder();
        showToast(`Las copias se guardarán en "${h.name}"`, 'success');
      }
      if (act === 'nofolder') { await setFolder(null); await showFolder(); showToast('Las copias irán a Descargas', 'success'); }
      if (act === 'now') {
        const where = await saveBackup(true);
        showToast(`Copia guardada en ${where}`, 'success');
        openSettings();
      }
    } catch (err) {
      if (err?.name !== 'AbortError') showToast('No se pudo completar: ' + (err?.message || err), 'error');
    }
  });
}

export function initAutoBackup(cloudReady) {
  if (!isAdmin()) return;
  document.querySelectorAll('[data-autobackup-open]').forEach((b) => {
    b.style.removeProperty('display');
    b.addEventListener('click', openSettings);
  });
  // first check once the fresh cloud data is in, then hourly (app left open past midnight)
  Promise.resolve(cloudReady).catch(() => {}).finally(() => setTimeout(runIfDue, 1500));
  setInterval(runIfDue, 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runIfDue(); });
}
