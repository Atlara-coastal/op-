/**
 * JocoAdmin - Daily backup of the cloud database to a local folder.
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_USER, ADMIN_PASSWORD, BACKUP_DIR (optional).
 */
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { effectiveStatus, nextDue, installmentValue } from '../js/due.js';

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, ADMIN_USER, ADMIN_PASSWORD } = process.env;
const dir = process.env.BACKUP_DIR || path.join(process.env.USERPROFILE || '.', 'Documents', 'JocoAdmin-Backups');
if (!url || !anon || !ADMIN_USER || !ADMIN_PASSWORD) throw new Error('Faltan variables de entorno');

const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `${ADMIN_USER}@users.crediventas.internal`, password: ADMIN_PASSWORD })
});
if (!login.ok) throw new Error('Login fallido: ' + login.status);
const headers = { apikey: anon, Authorization: 'Bearer ' + (await login.json()).access_token };

async function fetchAll(table, select = '*') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/${table}?select=${select}&order=id.asc`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    const part = await r.json();
    rows.push(...part);
    if (part.length < 1000) break;
  }
  return rows;
}

const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const out = { app: 'JocoAdmin', createdAt: new Date().toISOString(), day, tables: {} };
for (const t of ['products', 'clients', 'sales', 'payments', 'quotes']) out.tables[t] = await fetchAll(t);
try { out.tables.profiles = await fetchAll('profiles', 'user_id,username,role,perms'); } catch { /* optional */ }

fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `jocoadmin-${day}.json`);
fs.writeFileSync(file, JSON.stringify(out));
const counts = Object.entries(out.tables).map(([k, v]) => `${k}:${v.length}`).join(' ');
console.log(`Backup OK -> ${file} (${counts})`);

// ---- Excel copy (same day, same folder) ----
const live = (t) => out.tables[t].filter((r) => !r.deleted).map((r) => r.data);
const num = (v) => (typeof v === 'number' ? v : v === undefined || v === null || v === '' ? '' : Number(v) || 0);
const d10 = (v) => (v ? String(v).slice(0, 10) : '');
const clients = live('clients');
const sales = live('sales');

const sheets = {
  Productos: live('products').map((p) => ({ Código: p.code, Nombre: p.name, Categoría: p.category || '', Descripción: p.description || '', Costo: num(p.cost), 'Admin %': num(p.extraExpensesPercent), Creado: d10(p.createdAt) })),
  Clientes: clients.map((c) => ({ Nombre: c.fullName, Cédula: c.cc || '', Teléfono: c.phone || '', Correo: c.email || '', Edad: num(c.age), Dirección: c.address || '', Tipo: c.type || '', Codeudor: c.codebtorName || '', 'Próx. fecha de pago': c.nextPaymentDate || '', 'Abono prometido': num(c.promisedAmount), Nota: c.sheetNote || '', Creado: d10(c.createdAt) })),
  Ventas: sales.map((s) => {
    const nd = nextDue(s);
    return { 'N° Venta': s.saleNumber, Cliente: s.clientName, Vendedor: s.sellerName || s.sellerUsername || '', Fecha: d10(s.date || s.createdAt), Tipo: s.type, Productos: (s.items || []).map((i) => `${i.productName} x${i.quantity}`).join('; '), Total: num(s.totalAmount), 'Cuota inicial': num(s.initialPayment), Abonado: num(s.totalPaid), Saldo: num(s.outstandingBalance), 'N° cuotas': num(s.installmentsCount), 'Valor cuota': Math.round(installmentValue(s)), Frecuencia: s.frequency || '', 'Días de pago': (s.paymentDays || []).join(','), 'Primera cuota': s.startDate || '', Estado: effectiveStatus(s), 'Próximo pago': nd?.date || '', 'Días de atraso': nd?.daysOverdue || 0, Notas: s.notes || '' };
  }),
  Pagos: live('payments').map((p) => ({ Recibo: p.receiptNumber || '', Fecha: d10(p.date || p.createdAt), 'N° Venta': p.saleNumber || '', Cliente: p.clientName || '', Valor: num(p.amount), Método: p.paymentMethod || '', Notas: p.notes || '' })),
  Cotizaciones: live('quotes').map((q) => ({ 'N° Cotización': q.quoteNumber, Cliente: q.clientName, Teléfono: q.clientPhone || '', Productos: (q.items || []).map((i) => `${i.productName} x${i.quantity}`).join('; '), Total: num(q.totalAmount), Cuotas: num(q.installmentsCount), 'Valor cuota': num(q.installmentValue), Frecuencia: q.frequency || '', 'Válida hasta': q.validUntil || '', Creada: d10(q.createdAt) }))
};
sheets.Cartera = sales.filter((s) => (s.outstandingBalance || 0) > 0).map((s) => {
  const nd = nextDue(s);
  const c = clients.find((x) => x.id === s.clientId) || {};
  return { Cliente: s.clientName, Teléfono: c.phone || '', 'N° Venta': s.saleNumber, Vendedor: s.sellerName || s.sellerUsername || '', Saldo: num(s.outstandingBalance), 'Valor cuota': Math.round(installmentValue(s)), 'Próximo pago': nd?.date || '', 'Días de atraso': nd?.daysOverdue || 0, Estado: effectiveStatus(s) };
}).sort((a, b) => b['Días de atraso'] - a['Días de atraso']);

const wb = XLSX.utils.book_new();
for (const [name, rows] of Object.entries(sheets)) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const cols = Object.keys(rows[0] || {});
  ws['!cols'] = cols.map((k) => ({ wch: Math.min(45, Math.max(k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 2))) }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}
const xlsxFile = path.join(dir, `jocoadmin-${day}.xlsx`);
XLSX.writeFile(wb, xlsxFile);
console.log(`Excel OK -> ${xlsxFile}`);
// Keep the last 120 days (json + xlsx).
const old = fs.readdirSync(dir).filter((f) => /^jocoadmin-\d{4}-\d{2}-\d{2}\.(json|xlsx)$/.test(f)).sort().slice(0, -240);
old.forEach((f) => fs.unlinkSync(path.join(dir, f)));