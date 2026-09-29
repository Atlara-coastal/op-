/**
 * JocoAdmin - Database & Persistence Manager
 * Uses LocalStorage for Structured Data and IndexedDB for Attached CC Documents.
 *
 * Cloud sync (optional, activates once Supabase is configured and the user
 * is logged in): every collection also mirrors to a Supabase table with the
 * same name. Local reads/writes stay perfectly synchronous — the sync layer
 * only pushes writes out and pulls remote changes in — so none of the
 * components in js/components/*.js needed to change.
 */
import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { canEditCollection } from './permissions.js';
import { showToast } from './utils.js';

function writeAllowed(collection) {
  if (canEditCollection(collection)) return true;
  showToast('No tienes permiso para realizar esta acción', 'error');
  return false;
}

const DB_PREFIX = 'crediventas_';
const SYNCED_COLLECTIONS = ['products', 'clients', 'sales', 'payments', 'quotes'];
const PENDING_SUFFIX = 'pending_sync';

// Initial sample data if local state is empty
const INITIAL_PRODUCTS = [
  {
    id: 'prod-1',
    code: 'PRD-001',
    name: 'Televisor Samsung 55" 4K Smart TV',
    description: 'Pantalla Crystal UHD con control por voz',
    cost: 1200000,
    extraExpensesPercent: 5,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod-2',
    code: 'PRD-002',
    name: 'Nevera LG No Frost 390L Inverter',
    description: 'Acero inoxidable con enfriamiento rápido',
    cost: 1800000,
    extraExpensesPercent: 6,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod-3',
    code: 'PRD-003',
    name: 'Moto Yamaha FZ 250cc 2026',
    description: 'Frenos ABS, inyección electrónica',
    cost: 11500000,
    extraExpensesPercent: 8,
    createdAt: new Date().toISOString()
  },
  {
    id: 'prod-4',
    code: 'PRD-004',
    name: 'Celular iPhone 15 Pro 128GB',
    description: 'Titanio natural, cámara de 48MP',
    cost: 4200000,
    extraExpensesPercent: 4,
    createdAt: new Date().toISOString()
  }
];

const INITIAL_CLIENTS = [
  {
    id: 'cli-1',
    fullName: 'Carlos Eduardo Mendoza',
    cc: '1098765432',
    email: 'carlos.mendoza@email.com',
    age: 34,
    address: 'Calle 45 #23-12, Bogotá',
    phone: '3104567890',
    type: 'tipo-1', // Tipo 1: Excelente / Puntual
    codebtorId: null, // Sin codeudor (Cliente viejo/conocido)
    codebtorName: 'Sin Codeudor (Cliente Antiguo/Confiable)',
    createdAt: '2026-01-15T10:00:00.000Z'
  },
  {
    id: 'cli-2',
    fullName: 'María Fernanda Gómez',
    cc: '52987123',
    email: 'maria.gomez@email.com',
    age: 29,
    address: 'Carrera 15 #80-45, Medellín',
    phone: '3157891234',
    type: 'tipo-2', // Tipo 2: Regular
    codebtorId: 'cli-1',
    codebtorName: 'Carlos Eduardo Mendoza (CC: 1098765432)',
    createdAt: '2026-02-10T11:30:00.000Z'
  },
  {
    id: 'cli-3',
    fullName: 'Javier Alejandro Rivera',
    cc: '1012345678',
    email: 'javier.rivera@email.com',
    age: 41,
    address: 'Avenida 6 #18-30, Cali',
    phone: '3209876543',
    type: 'tipo-3', // Tipo 3: Riesgoso / Frecuente mora
    codebtorId: 'cli-1',
    codebtorName: 'Carlos Eduardo Mendoza (CC: 1098765432)',
    createdAt: '2026-03-01T09:15:00.000Z'
  }
];

const INITIAL_SALES = [
  {
    id: 'sale-1',
    saleNumber: 'VTA-001',
    clientId: 'cli-1',
    clientName: 'Carlos Eduardo Mendoza',
    type: 'credito',
    items: [
      {
        productId: 'prod-1',
        productName: 'Televisor Samsung 55" 4K Smart TV',
        cost: 1200000,
        extraExpensesPercent: 5,
        finalUnitPrice: 1404000, // 1200000 + 144000 + 60000
        quantity: 1,
        total: 1404000
      }
    ],
    totalAmount: 1404000,
    totalPaid: 1404000,
    outstandingBalance: 0,
    installmentsCount: 4,
    frequency: 'quincenal',
    status: 'pagado',
    startDate: '2026-06-01',
    createdAt: '2026-06-01T14:00:00.000Z'
  },
  {
    id: 'sale-2',
    saleNumber: 'VTA-002',
    clientId: 'cli-2',
    clientName: 'María Fernanda Gómez',
    type: 'credito',
    items: [
      {
        productId: 'prod-2',
        productName: 'Nevera LG No Frost 390L Inverter',
        cost: 1800000,
        extraExpensesPercent: 6,
        finalUnitPrice: 2178000, // 1800000 + 270000 + 108000
        quantity: 1,
        total: 2178000
      }
    ],
    totalAmount: 2178000,
    totalPaid: 1089000,
    outstandingBalance: 1089000,
    installmentsCount: 4,
    frequency: 'mensual',
    status: 'al_dia',
    startDate: '2026-07-15',
    createdAt: '2026-07-15T16:20:00.000Z'
  },
  {
    id: 'sale-3',
    saleNumber: 'VTA-003',
    clientId: 'cli-3',
    clientName: 'Javier Alejandro Rivera',
    type: 'credito',
    items: [
      {
        productId: 'prod-4',
        productName: 'Celular iPhone 15 Pro 128GB',
        cost: 4200000,
        extraExpensesPercent: 4,
        finalUnitPrice: 4788000, // 4200000 + 420000 + 168000
        quantity: 1,
        total: 4788000
      }
    ],
    totalAmount: 4788000,
    totalPaid: 798000,
    outstandingBalance: 3990000,
    installmentsCount: 6,
    frequency: 'mensual',
    status: 'mora',
    startDate: '2026-05-10',
    createdAt: '2026-05-10T11:00:00.000Z'
  }
];

const INITIAL_PAYMENTS = [
  {
    id: 'pay-1',
    saleId: 'sale-1',
    saleNumber: 'VTA-001',
    clientId: 'cli-1',
    clientName: 'Carlos Eduardo Mendoza',
    amount: 1404000,
    paymentMethod: 'Transferencia Bancaria',
    date: '2026-07-01',
    notes: 'Pago total del crédito anticipado',
    createdAt: '2026-07-01T10:00:00.000Z'
  },
  {
    id: 'pay-2',
    saleId: 'sale-2',
    saleNumber: 'VTA-002',
    clientId: 'cli-2',
    clientName: 'María Fernanda Gómez',
    amount: 1089000,
    paymentMethod: 'Nequi',
    date: '2026-08-15',
    notes: 'Abono cuotas 1 y 2',
    createdAt: '2026-08-15T15:30:00.000Z'
  },
  {
    id: 'pay-3',
    saleId: 'sale-3',
    saleNumber: 'VTA-003',
    clientId: 'cli-3',
    clientName: 'Javier Alejandro Rivera',
    amount: 798000,
    paymentMethod: 'Efectivo',
    date: '2026-06-10',
    notes: 'Abono cuota 1',
    createdAt: '2026-06-10T12:00:00.000Z'
  }
];

const INITIAL_QUOTES = [
  {
    id: 'quote-1',
    quoteNumber: 'COT-001',
    clientName: 'Diana Carolina Torres',
    clientCc: '1032456789',
    clientPhone: '3001234567',
    items: [
      {
        productId: 'prod-3',
        productName: 'Moto Yamaha FZ 250cc 2026',
        cost: 11500000,
        extraExpensesPercent: 8,
        finalUnitPrice: 14490000,
        quantity: 1,
        total: 14490000
      }
    ],
    totalAmount: 14490000,
    installmentsCount: 12,
    installmentValue: 1207500,
    frequency: 'mensual',
    validUntil: '2026-10-15',
    createdAt: new Date().toISOString()
  }
];

class DBManager {
  constructor() {
    this.prefix = DB_PREFIX;
    this.tenant = null; // business space; set right after login (see setTenant)
    this.initLocalStorage();
    this.initIndexedDB();
    this.cloudMode = isSupabaseConfigured; // this deployment syncs to Supabase at all
    this.cloudEnabled = false; // the initial pull from Supabase has completed at least once
    this.onRemoteChange = null; // set by app.js to re-render the active tab
    this.onQueueChange = null; // set by app.js to update the "pending sync" badge
    this.realtimeChannels = [];
    this._flushing = false;

    if (this.cloudMode && typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushPendingQueue());
      // Safety net: some WebViews don't fire 'online' reliably.
      setInterval(() => this.flushPendingQueue(), 20000);
    }
  }

  // Scope everything to one business space: local cache + pending queue live under
  // a per-tenant key (so two accounts on the same device never see or upload each
  // other's data), pulls are filtered by it and every upload is stamped with it.
  setTenant(tenant) {
    this.tenant = tenant || null;
    this.prefix = tenant ? `${DB_PREFIX}${tenant}_` : DB_PREFIX;
    if (tenant) {
      SYNCED_COLLECTIONS.forEach((c) => {
        if (!localStorage.getItem(this.prefix + c)) localStorage.setItem(this.prefix + c, '[]');
      });
    }
  }

  /**
   * Call once the user is authenticated: pulls the latest data from
   * Supabase (source of truth across devices) and subscribes to live
   * changes made from other devices/sessions.
   *
   * Flushes any offline-made changes FIRST so they reach the cloud before
   * the pull below overwrites local storage with the server snapshot —
   * otherwise a client/sale/payment created while offline could be lost
   * the next time the app opens with a connection.
   */
  async connectCloud(onRemoteChange) {
    if (!isSupabaseConfigured || !supabase) return;
    this.onRemoteChange = onRemoteChange || null;

    await this.flushPendingQueue();

    for (const collection of SYNCED_COLLECTIONS) {
      try {
        const { rows, error } = await this.fetchAllRows(collection);

        if (error) {
          console.error(`[OP] Error al sincronizar "${collection}":`, error.message);
          continue;
        }
        this.saveCollection(collection, rows.map((row) => row.data));
      } catch (err) {
        // Offline or network failure: keep whatever is already cached locally.
        console.warn(`[OP] Sin conexión para sincronizar "${collection}", se usa la copia local.`, err.message);
      }
    }

    this.cloudEnabled = true;
    this.subscribeRealtime();
    // Views were drawn from the local cache; redraw with the freshly pulled data.
    if (this.onRemoteChange) this.onRemoteChange('sync');
  }

  // Supabase caps every request at 1000 rows, so a single select silently dropped
  // the oldest records once a collection grew past that (e.g. payments), which also
  // made totals recomputed from the local copy come out too low. Page through it all.
  async fetchAllRows(collection) {
    const PAGE = 1000;
    let rows = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from(collection)
        .select('id, data')
        .eq('deleted', false);
      // RLS already limits normal users to their tenant; the explicit filter is what
      // keeps a superadmin (who may read every tenant) on the space they picked.
      if (this.tenant) query = query.eq('tenant', this.tenant);
      const { data, error } = await query
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return { rows: [], error };
      rows = rows.concat(data);
      if (data.length < PAGE) return { rows, error: null };
    }
  }

  // --- Offline write queue -------------------------------------------
  // Every write made while cloudMode is on is queued (durably, in
  // localStorage) and only removed once it's confirmed saved in Supabase.
  // This is what lets creating a client/sale/payment while offline survive
  // an app reload: the item stays queued and is retried automatically as
  // soon as there's a connection again (on 'online', on a timer, and
  // before every connectCloud() pull).

  getPendingQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.prefix + PENDING_SUFFIX)) || [];
    } catch {
      return [];
    }
  }

  savePendingQueue(queue) {
    localStorage.setItem(this.prefix + PENDING_SUFFIX, JSON.stringify(queue));
    if (this.onQueueChange) this.onQueueChange(queue.length);
  }

  getPendingCount() {
    return this.getPendingQueue().length;
  }

  enqueue(op) {
    op.tenant = this.tenant;
    const queue = this.getPendingQueue();
    const idx = queue.findIndex((o) => o.collection === op.collection && o.id === op.id);
    if (idx !== -1) queue[idx] = op;
    else queue.push(op);
    this.savePendingQueue(queue);
  }

  async flushPendingQueue() {
    // No tenant yet (not logged in): nothing can be written — RLS requires one.
    if (this._flushing || !this.cloudMode || !supabase || !this.tenant) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const queue = this.getPendingQueue();
    if (!queue.length) return;

    this._flushing = true;
    const sent = new Map();
    const opKey = (o) => o.collection + '|' + o.id;
    try {
      for (const op of queue) {
        try {
          const tenant = op.tenant || this.tenant;
          const { error } = op.type === 'delete'
            ? await supabase.from(op.collection).upsert({ id: op.id, tenant, deleted: true, updated_at: new Date().toISOString() })
            : await supabase.from(op.collection).upsert({ id: op.id, tenant, data: op.item, updated_at: new Date().toISOString(), deleted: false });
          if (error) throw error;
          sent.set(opKey(op), JSON.stringify(op));
        } catch (err) {
          // stays in the queue, retried on the next flush
        }
      }
    } finally {
      // Writes made while this flush was awaiting the network (e.g. a payment saved
      // right after its sale's total was updated) were appended to the stored queue
      // meanwhile. Re-read it and drop only the ops actually sent in this pass —
      // overwriting it with this pass's leftovers silently lost those new writes.
      const current = this.getPendingQueue();
      const next = current.filter((o) => sent.get(opKey(o)) !== JSON.stringify(o));
      this.savePendingQueue(next);
      this._flushing = false;
      const queuedMeanwhile = next.some((o) => !queue.some((q) => opKey(q) === opKey(o) && JSON.stringify(q) === JSON.stringify(o)));
      if (queuedMeanwhile) this.flushPendingQueue();
    }
  }

  subscribeRealtime() {
    SYNCED_COLLECTIONS.forEach((collection) => {
      const channel = supabase
        .channel(`${collection}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table: collection }, (payload) => {
          this.applyRemoteChange(collection, payload);
        })
        .subscribe();
      this.realtimeChannels.push(channel);
    });
  }

  applyRemoteChange(collection, payload) {
    const items = this.getCollection(collection);
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    // A superadmin receives changes from every tenant; only apply the active one.
    if (this.tenant && row.tenant && row.tenant !== this.tenant) return;
    // A local write to this record is still queued: the local copy is newer than
    // this event (usually the late echo of an earlier save), so don't let it win.
    if (this.getPendingQueue().some((o) => o.collection === collection && o.id === row.id)) return;
    const isDelete = payload.eventType === 'DELETE' || row.deleted;
    const index = items.findIndex((i) => i.id === row.id);

    if (isDelete) {
      if (index !== -1) items.splice(index, 1);
    } else if (index !== -1) {
      items[index] = row.data;
    } else {
      items.unshift(row.data);
    }

    this.saveCollection(collection, items);
    if (this.onRemoteChange) this.onRemoteChange(collection);
  }

  // Fire-and-forget push to Supabase; local storage is already updated by the
  // caller. Queued durably first, so it survives being offline (see above).
  pushUpsert(collection, item) {
    if (!this.cloudMode || !SYNCED_COLLECTIONS.includes(collection)) return;
    this.enqueue({ collection, id: item.id, type: 'upsert', item });
    this.flushPendingQueue();
  }

  pushDelete(collection, id) {
    if (!this.cloudMode || !SYNCED_COLLECTIONS.includes(collection)) return;
    this.enqueue({ collection, id, type: 'delete' });
    this.flushPendingQueue();
  }

  initLocalStorage() {
    if (!localStorage.getItem(DB_PREFIX + 'products')) {
      localStorage.setItem(DB_PREFIX + 'products', JSON.stringify(INITIAL_PRODUCTS));
    }
    if (!localStorage.getItem(DB_PREFIX + 'clients')) {
      localStorage.setItem(DB_PREFIX + 'clients', JSON.stringify(INITIAL_CLIENTS));
    }
    if (!localStorage.getItem(DB_PREFIX + 'sales')) {
      localStorage.setItem(DB_PREFIX + 'sales', JSON.stringify(INITIAL_SALES));
    }
    if (!localStorage.getItem(DB_PREFIX + 'payments')) {
      localStorage.setItem(DB_PREFIX + 'payments', JSON.stringify(INITIAL_PAYMENTS));
    }
    if (!localStorage.getItem(DB_PREFIX + 'quotes')) {
      localStorage.setItem(DB_PREFIX + 'quotes', JSON.stringify(INITIAL_QUOTES));
    }
  }

  // --- IndexedDB for CC Documents ---
  initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('JocoAdminDocsDB', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async saveDocument(clientId, clientFullName, fileBlob, fileName) {
    if (!this.db) await this.initIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      
      const docRecord = {
        id: `doc_${clientId}_${Date.now()}`,
        clientId: clientId,
        clientFullName: clientFullName,
        fileName: fileName,
        formattedName: `CC_${clientFullName.replace(/\s+/g, '_')}_${Date.now()}.${fileName.split('.').pop()}`,
        fileBlob: fileBlob,
        fileType: fileBlob.type,
        uploadedAt: new Date().toISOString()
      };
      
      const req = store.put(docRecord);
      req.onsuccess = () => resolve(docRecord);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getClientDocuments(clientId) {
    if (!this.db) await this.initIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const req = store.getAll();
      req.onsuccess = () => {
        const docs = req.result.filter(d => d.clientId === clientId);
        resolve(docs);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDocument(docId) {
    if (!this.db) await this.initIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const req = store.delete(docId);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // --- LocalStorage Generic CRUD Methods ---
  getCollection(key) {
    const data = localStorage.getItem(this.prefix + key);
    return data ? JSON.parse(data) : [];
  }

  saveCollection(key, items) {
    localStorage.setItem(this.prefix + key, JSON.stringify(items));
  }

  addItem(key, item) {
    if (!writeAllowed(key)) return null;
    const items = this.getCollection(key);
    items.unshift(item);
    this.saveCollection(key, items);
    this.pushUpsert(key, item);
    return item;
  }

  updateItem(key, id, updatedFields) {
    if (!writeAllowed(key)) return null;
    const items = this.getCollection(key);
    const index = items.findIndex(i => i.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updatedFields };
      this.saveCollection(key, items);
      this.pushUpsert(key, items[index]);
      return items[index];
    }
    return null;
  }

  deleteItem(key, id) {
    if (!writeAllowed(key)) return;
    const items = this.getCollection(key);
    const filtered = items.filter(i => i.id !== id);
    this.saveCollection(key, filtered);
    this.pushDelete(key, id);
  }

  // Backup & Restore
  exportDatabaseJSON() {
    const backup = {
      products: this.getCollection('products'),
      clients: this.getCollection('clients'),
      sales: this.getCollection('sales'),
      payments: this.getCollection('payments'),
      quotes: this.getCollection('quotes'),
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(backup, null, 2);
  }

  importDatabaseJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.products) this.saveCollection('products', data.products);
      if (data.clients) this.saveCollection('clients', data.clients);
      if (data.sales) this.saveCollection('sales', data.sales);
      if (data.payments) this.saveCollection('payments', data.payments);
      if (data.quotes) this.saveCollection('quotes', data.quotes);
      return true;
    } catch (e) {
      console.error('Error importing backup:', e);
      return false;
    }
  }
}

export const db = new DBManager();
