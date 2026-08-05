import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
 
const firebaseConfig = {
  apiKey: "AIzaSyAaVjIxfLAZWySdn2rYdUvwpsetL1xjrFE",
  authDomain: "wms-seu-full.firebaseapp.com",
  projectId: "wms-seu-full",
  storageBucket: "wms-seu-full.firebasestorage.app",
  messagingSenderId: "658349799840",
  appId: "1:658349799840:web:ce6aaf29a0eda379ca4cc5"
};
 
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
 
// ─── Role permissions ────────────────────────────────────
export const PERMISSIONS = {
  diretor:   { canSeeAll: true,  canEdit: true,  canSeeValues: true,  canEditValues: true,  canDelete: true  },
  comercial: { canSeeAll: true,  canEdit: true,  canSeeValues: true,  canEditValues: true,  canDelete: false },
  financeiro:{ canSeeAll: true,  canEdit: false, canSeeValues: true,  canEditValues: false, canDelete: false },
  logistica: { canSeeAll: true,  canEdit: true,  canSeeValues: false, canEditValues: false, canDelete: false },
  cliente:   { canSeeAll: false, canEdit: false, canSeeValues: false, canEditValues: false, canDelete: false },
};
 
export function getPerms(role) {
  return PERMISSIONS[role] || PERMISSIONS.cliente;
}

export function getEffectivePerms(role, overrides = []) {
  const base = getPerms(role);
  if (!overrides?.length) return base;
  const result = { ...base };
  overrides.forEach(k => { if (k in result) result[k] = true; });
  return result;
}

// ─── Granular module/action permissions ──────────────────
export const GRANULAR_PERMISSIONS = [
  { key:'wms.ver_estoque',         label:'Ver estoque',               module:'WMS',                  includedIn:['diretor','comercial','financeiro','logistica'] },
  { key:'wms.editar_posicoes',     label:'Editar posições',           module:'WMS',                  includedIn:['diretor','comercial','logistica'] },
  { key:'wms.excluir_posicoes',    label:'Excluir posições',          module:'WMS',                  includedIn:['diretor'] },
  { key:'wms.ver_valores',         label:'Ver valores R$',            module:'WMS',                  includedIn:['diretor','comercial','financeiro'] },
  { key:'wms.editar_valores',      label:'Editar valores',            module:'WMS',                  includedIn:['diretor','comercial'] },
  { key:'billing.ver',             label:'Ver faturamento',           module:'Faturamento',          includedIn:['diretor','comercial'] },
  { key:'billing.editar',          label:'Editar lançamentos',        module:'Faturamento',          includedIn:['diretor','comercial'] },
  { key:'billing.pdf',             label:'Gerar PDF',                 module:'Faturamento',          includedIn:['diretor','comercial'] },
  { key:'billing.ver_precos',      label:'Ver tabela de preços',      module:'Faturamento',          includedIn:['diretor','comercial'] },
  { key:'billing.editar_precos',   label:'Editar tabela de preços',   module:'Faturamento',          includedIn:['diretor'] },
  { key:'dashboard.ver',           label:'Ver dashboard',             module:'Dashboard Financeiro', includedIn:['diretor','comercial','financeiro'] },
  { key:'dashboard.ver_pl',        label:'Ver P&L',                   module:'Dashboard Financeiro', includedIn:['diretor','comercial','financeiro'] },
  { key:'dashboard.editar_custos', label:'Editar custos operacionais',module:'Dashboard Financeiro', includedIn:['diretor'] },
  { key:'admin.usuarios',          label:'Gestão de usuários',        module:'Admin',                includedIn:['diretor'] },
  { key:'admin.clientes',          label:'Gestão de clientes/lojas',  module:'Admin',                includedIn:['diretor','comercial'] },
  { key:'admin.config',            label:'Ver configurações',         module:'Admin',                includedIn:['diretor'] },
];

export function checkPerm(user, permKey) {
  if (!user) return false;
  const perm = GRANULAR_PERMISSIONS.find(p => p.key === permKey);
  if (!perm) return false;
  if (perm.includedIn.includes(user.role)) return true;
  return !!user.extraPermissions?.[permKey];
}
 
// ─── Auth helpers ────────────────────────────────────────
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
  if (!userDoc.exists()) throw new Error('Usuário não encontrado no sistema');
  const data = userDoc.data();
  if (data.status === 'pendente') throw new Error('PENDENTE');
  if (data.status === 'rejeitado') throw new Error('Cadastro rejeitado. Entre em contato.');
  return { uid: cred.user.uid, email: cred.user.email, ...data };
}
 
export async function logout() {
  await signOut(auth);
}
 
export function onAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.status === 'pendente') {
          callback(null);
        } else {
          callback({ uid: user.uid, email: user.email, ...data });
        }
      } else {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}
 
// ─── User management ─────────────────────────────────────
export async function createUser(email, password, userData) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    email,
    ...userData,
    createdAt: new Date().toISOString()
  });
  return cred.user.uid;
}
 
// Client self-registration
export async function registerClient(email, password, clientData) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    email,
    role: 'cliente',
    status: 'pendente',
    ...clientData,
    createdAt: new Date().toISOString()
  });
  await signOut(auth); // sign out immediately, needs approval
  return cred.user.uid;
}
 
// Invite collaborator without signing out the current admin
function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({length: 12}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function inviteCollaborator(name, email, role, loja = '') {
  const tempPassword = generateTempPassword();
  const secondaryApp = getApps().find(a => a.name === 'secondary') || initializeApp(firebaseConfig, 'secondary');
  const secondaryAuth = getAuth(secondaryApp);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
  await setDoc(doc(db, 'users', cred.user.uid), {
    email, nome: name, role, loja: loja || '', status: 'ativo',
    permissionOverrides: [], extraPermissions: {},
    createdAt: new Date().toISOString(),
  });
  await signOut(secondaryAuth);
  return { uid: cred.user.uid, tempPassword };
}

// Get all users (admin)
export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  const users = [];
  snap.forEach(d => users.push({ uid: d.id, ...d.data() }));
  return users;
}
 
// Approve or reject client
export async function approveUser(uid, loja) {
  await updateDoc(doc(db, 'users', uid), { status: 'ativo', loja });
}
 
export async function rejectUser(uid) {
  await updateDoc(doc(db, 'users', uid), { status: 'rejeitado' });
}
 
// ─── Firestore helpers ───────────────────────────────────
export async function getUserProfile(uid) {
  const d = await getDoc(doc(db, 'users', uid));
  return d.exists() ? d.data() : null;
}
 
export async function getWmsData() {
  const d = await getDoc(doc(db, 'wms', 'estoque'));
  if (!d.exists()) return {};
  const raw = d.data();
  if (raw.data) return JSON.parse(raw.data);
  return {};
}
 
export async function saveWmsData(cells) {
  await setDoc(doc(db, 'wms', 'estoque'), {
    data: JSON.stringify(cells),
    updatedAt: new Date().toISOString()
  });
}
 
// ─── Per-cell writes (concurrency-safe) ──────────────────
// These read the server's current state, apply ONLY the local change,
// and write back atomically. This prevents a stale client from
// overwriting concurrent edits made by other users.
 
function _parseCellsFromSnap(snap) {
  if (!snap.exists()) return {};
  const raw = snap.data();
  if (!raw || !raw.data) return {};
  try { return JSON.parse(raw.data); } catch(e) { return {}; }
}
 
export async function wmsSaveCell(slotId, data) {
  const ref = doc(db, 'wms', 'estoque');
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = _parseCellsFromSnap(snap);
    current[slotId] = data;
    tx.set(ref, { data: JSON.stringify(current), updatedAt: new Date().toISOString() });
  });
}
 
export async function wmsClearCell(slotId) {
  const ref = doc(db, 'wms', 'estoque');
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = _parseCellsFromSnap(snap);
    delete current[slotId];
    tx.set(ref, { data: JSON.stringify(current), updatedAt: new Date().toISOString() });
  });
}
 
export async function wmsMoveCell(fromId, toId, destData) {
  const ref = doc(db, 'wms', 'estoque');
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = _parseCellsFromSnap(snap);
    delete current[fromId];
    current[toId] = destData;
    tx.set(ref, { data: JSON.stringify(current), updatedAt: new Date().toISOString() });
  });
}
 
export async function wmsArchiveCells(slotIds) {
  const ref = doc(db, 'wms', 'estoque');
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = _parseCellsFromSnap(snap);
    slotIds.forEach(s => delete current[s]);
    tx.set(ref, { data: JSON.stringify(current), updatedAt: new Date().toISOString() });
  });
}
 
export async function getClientStock(lojaName) {
  const allCells = await getWmsData();
  const clientCells = {};
  for (const [id, cell] of Object.entries(allCells)) {
    if (cell.loja && cell.loja.toLowerCase().includes(lojaName.toLowerCase())) {
      clientCells[id] = cell;
    }
  }
  return clientCells;
}
 
 
// ─── Pricing config ──────────────────────────────────────
export const DEFAULT_PRICES = {
  pallet_month: 350,
  min_monthly: 1500,
  wms: 2000,
  full_unit: 1.20,
  flex: 16,
  correios_places: 3.00,
  etiq_full: 0.30,
  etiq_receb: 0.20,
  receb_caixa: 1.50,
  kit_small: 0.50,
  kit_medium: 1.50,
  kit_large: 4.00,
  montagem_embalagem: 0.50,
  devolucao: 2.00,
};
 
export async function getPricing() {
  try {
    const d = await getDoc(doc(db, 'config', 'pricing'));
    if (d.exists()) return { ...DEFAULT_PRICES, ...d.data() };
  } catch(e) { console.error(e); }
  return { ...DEFAULT_PRICES };
}
 
export async function savePricing(prices) {
  await setDoc(doc(db, 'config', 'pricing'), { ...prices, updatedAt: new Date().toISOString() });
}


// ─── Operating costs per month (competência) ─────────────
// Stored as custos_operacionais/{YYYY-MM}. Each doc holds an array of
// items and a `fechado` flag. Editing one month NEVER touches another.
//
// Item shape: { id, nome, tipo: 'fixo'|'percentual', valor:Number }
//   - tipo 'fixo':       valor is the amount in R$ (stored as a Number).
//   - tipo 'percentual': valor is the percentage (e.g. 9). The R$ amount is
//                        ALWAYS computed as revenue*(valor/100), never stored.

// Where costs lived before the per-month split: a single config/costs document
// holding the six fixed fields below plus `custom` (a JSON string array of
// { id, nome, valor }). It is READ ONLY here — never written, never deleted.
const LEGACY_COST_COLLECTION = 'config';
const LEGACY_COST_DOC = 'costs';
const LEGACY_MIGRATION_MONTH = '2026-07'; // competência that inherits the legacy snapshot

const LEGACY_COST_LABELS = {
  aluguel:   'Aluguel galpão',
  caucao:    'Caução (oport.)',
  folha:     'Folha pagamento',
  etiquetas: 'Etiquetas/embalagens',
  energia:   'Energia/utilidades',
  outros:    'Outros fixos',
};

// Legacy fields that are metadata, not costs.
const LEGACY_META_FIELDS = new Set([
  'custom', 'updatedAt', 'createdAt', 'month', 'itens', 'fechado',
  'migratedFrom', 'migrationDone',
]);

function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

// Normalize a numeric input. Accepts Number or strings like
// "1234,56", "1234.56" or "1.234,56" (pt-BR thousands). Returns a plain Number.
export function parseNumberBR(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  let s = v.trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    // "1.234,56" -> dot is thousands, comma is decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // "1234,56" -> comma is decimal
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// R$ value of a single cost item given the month's revenue.
export function resolveCostItemValue(item, revenue = 0) {
  if (!item) return 0;
  if (item.tipo === 'percentual') return (parseNumberBR(revenue)) * (parseNumberBR(item.valor) / 100);
  return parseNumberBR(item.valor);
}

// Total cost of a month = fixed items (R$) + resolved percentual items.
export function sumCostItems(itens, revenue = 0) {
  return (itens || []).reduce((s, it) => s + resolveCostItemValue(it, revenue), 0);
}

// Force an item into the canonical shape. `valor` is ALWAYS a plain Number.
function _normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: item.id != null && item.id !== '' ? String(item.id) : _genId(),
    nome: String(item.nome ?? item.name ?? 'Custo'),
    tipo: item.tipo === 'percentual' ? 'percentual' : 'fixo',
    valor: parseNumberBR(item.valor ?? item.value),
  };
}

function _isNumericLike(v) {
  if (typeof v === 'number') return isFinite(v);
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return !!s && /^-?\s*(R\$)?\s*[\d.,]+$/i.test(s);
}

function _prettyLabel(key) {
  const s = String(key).replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Convert the legacy config/costs document into canonical items.
// Ids are DETERMINISTIC (derived from the legacy key) so re-running the
// migration produces the same ids and merging by id can never duplicate.
function _legacyToItems(legacy) {
  const items = [];
  const seen = new Set();
  const push = (id, nome, valor, tipo = 'fixo') => {
    if (seen.has(id)) return;
    seen.add(id);
    items.push(_normalizeItem({ id, nome, tipo, valor }));
  };

  // 1) the six known fixed fields, in their canonical order and labels
  Object.entries(LEGACY_COST_LABELS).forEach(([key, label]) => {
    if (legacy[key] != null && legacy[key] !== '') push(key, label, legacy[key]);
  });

  // 2) any other numeric field the old editor may have written — keep it
  //    instead of silently dropping it
  Object.entries(legacy).forEach(([key, v]) => {
    if (LEGACY_META_FIELDS.has(key) || LEGACY_COST_LABELS[key]) return;
    if (!_isNumericLike(v)) return;
    push(key, _prettyLabel(key), v);
  });

  // 3) the custom list (JSON string in the legacy doc; tolerate a real array)
  let custom = legacy.custom;
  if (typeof custom === 'string') {
    try { custom = JSON.parse(custom); } catch (e) { custom = null; }
  }
  if (Array.isArray(custom)) {
    custom.forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      push(`custom_${c.id != null && c.id !== '' ? c.id : i}`,
           c.nome || c.name || `Custo ${i + 1}`,
           c.valor ?? c.value,
           c.tipo === 'percentual' ? 'percentual' : 'fixo');
    });
  }
  return items;
}

async function _readLegacyCostItems() {
  try {
    const snap = await getDoc(doc(db, LEGACY_COST_COLLECTION, LEGACY_COST_DOC));
    if (!snap.exists()) return [];
    return _legacyToItems(snap.data());
  } catch (e) {
    console.error(`[custos] falha ao ler o documento legado ${LEGACY_COST_COLLECTION}/${LEGACY_COST_DOC}`, e);
    return [];
  }
}

// Accepts the stored JSON string or an already-decoded array.
function _parseItens(data) {
  const raw = data?.itens;
  const arr = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' && raw.trim() ? (() => { try { return JSON.parse(raw); } catch (e) { return []; } })() : []);
  return (Array.isArray(arr) ? arr : []).map(_normalizeItem).filter(Boolean);
}

// Union by id — existing items win, legacy items only fill gaps.
function _mergeById(current, incoming) {
  const byId = new Map(current.map(it => [it.id, it]));
  incoming.forEach(it => { if (!byId.has(it.id)) byId.set(it.id, it); });
  return [...byId.values()];
}

function _prevMonthKey(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Read a month's costs. Returns { exists, itens, fechado, error }.
// Never throws: a failed read degrades to an empty month plus an `error`
// message the UI can surface, instead of blanking out silently.
//
// Migration: the competência LEGACY_MIGRATION_MONTH inherits the legacy
// config/costs snapshot. It runs whenever that month has NO items yet — so a
// previous half-failed attempt (missing doc, or a doc written empty) repairs
// itself on the next read. Ids are deterministic and items merge by id, so
// running it again never duplicates. `migrationDone` marks the doc as
// user-owned: once anyone saves that month, the legacy doc is never re-read.
export async function getMonthCosts(month) {
  const ref = doc(db, 'custos_operacionais', month);
  let data = null;
  let error = null;
  try {
    const snap = await getDoc(ref);
    data = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error(`[custos] leitura de custos_operacionais/${month} falhou`, e);
    error = `Não foi possível ler custos_operacionais/${month} (${e?.code || e?.message || 'erro'}). Verifique as regras do Firestore.`;
  }

  const itens = _parseItens(data);
  const fechado = !!data?.fechado;

  // Stored data always wins — never seed on top of real items.
  if (itens.length) return { exists: true, itens, fechado, error: null };

  if (month === LEGACY_MIGRATION_MONTH && !data?.migrationDone) {
    const legacyItems = await _readLegacyCostItems();
    if (legacyItems.length) {
      const merged = _mergeById(itens, legacyItems);
      try {
        await setDoc(ref, {
          itens: JSON.stringify(merged),
          fechado,
          month,
          migratedFrom: `${LEGACY_COST_COLLECTION}/${LEGACY_COST_DOC}`,
          migrationDone: true,
          updatedAt: new Date().toISOString(),
        });
        return { exists: true, itens: merged, fechado, error: null };
      } catch (e) {
        console.error(`[custos] migração não conseguiu gravar custos_operacionais/${month}`, e);
        // Show the legacy numbers anyway; the write retries on the next read.
        return {
          exists: false, itens: merged, fechado,
          error: `Migração leu ${legacyItems.length} custos do legado mas não conseguiu gravar em custos_operacionais/${month} (${e?.code || e?.message || 'erro'}). Verifique as regras do Firestore.`,
        };
      }
    }
  }

  return { exists: !!data, itens, fechado, error };
}

export async function saveMonthCosts(month, itens, fechado = false) {
  const norm = (itens || []).map(_normalizeItem).filter(Boolean);
  await setDoc(doc(db, 'custos_operacionais', month), {
    itens: JSON.stringify(norm),
    fechado: !!fechado,
    month,
    migrationDone: true, // user-owned from now on: never re-seed from the legacy doc
    updatedAt: new Date().toISOString(),
  });
  return norm;
}

// Independent copy of the previous month's items (fresh ids, no reference).
export async function copyCostsFromPreviousMonth(month) {
  const prev = await getMonthCosts(_prevMonthKey(month));
  return prev.itens.map(it => ({ ...it, id: _genId() }));
}

 
// ─── Auto Backup (runs daily for directors) ──────────
export async function autoBackup() {
  const today = new Date().toISOString().substring(0,10);
  try {
    // Check if already backed up today
    const check = await getDoc(doc(db, 'backups', today));
    if (check.exists()) return false; // already done
 
    // Collect all data
    const wms = await getWmsData();
    
    const usersSnap = await getDocs(collection(db, 'users'));
    const users = {};
    usersSnap.forEach(d => { users[d.id] = d.data(); });
 
    const billingSnap = await getDocs(collection(db, 'billing'));
    const billing = {};
    billingSnap.forEach(d => { billing[d.id] = d.data(); });
 
    const coletaDoc = await getDoc(doc(db, 'wms', 'coletas')).catch(()=>null);
    const coletas = coletaDoc?.exists?.() ? coletaDoc.data() : {};
 
    const pricingDoc = await getDoc(doc(db, 'config', 'pricing')).catch(()=>null);
    const pricing = pricingDoc?.exists?.() ? pricingDoc.data() : {};
 
    const costsDoc = await getDoc(doc(db, 'config', 'costs')).catch(()=>null);
    const costs = costsDoc?.exists?.() ? costsDoc.data() : {};
 
    // Save backup
    await setDoc(doc(db, 'backups', today), {
      date: new Date().toISOString(),
      auto: true,
      wms: JSON.stringify(wms),
      users: JSON.stringify(users),
      billing: JSON.stringify(billing),
      coletas: JSON.stringify(coletas),
      pricing: JSON.stringify(pricing),
      costs: JSON.stringify(costs),
    });
 
    await setDoc(doc(db, 'config', 'lastBackup'), { date: new Date().toISOString(), auto: true });
 
    // Clean old backups (keep last 30 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().substring(0,10);
    const backupsSnap = await getDocs(collection(db, 'backups'));
    backupsSnap.forEach(async (d) => {
      if (d.id < cutoffStr) {
        try { await deleteDoc(doc(db, 'backups', d.id)); } catch(e) {}
      }
    });
 
    console.log('[Seu Full] Auto-backup realizado:', today);
    return true;
  } catch(e) {
    console.error('[Seu Full] Erro no auto-backup:', e);
    return false;
  }
}
 
 
// ─── Audit Log ──────────────────────────────────────
export async function logAction(user, action, details) {
  try {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2,6);
    await setDoc(doc(db, 'logs', id), {
      timestamp: new Date().toISOString(),
      user: user?.email || 'system',
      userName: user?.nome || user?.email || 'system',
      role: user?.role || 'system',
      action,
      details: typeof details === 'string' ? details : JSON.stringify(details),
    });
  } catch(e) { console.error('Log error:', e); }
}
 
export async function getLogs(limit = 100) {
  try {
    const snap = await getDocs(collection(db, 'logs'));
    const logs = [];
    snap.forEach(d => logs.push({id: d.id, ...d.data()}));
    return logs.sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||'')).slice(0, limit);
  } catch(e) { console.error(e); return []; }
}
