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

const LEGACY_COST_LABELS = {
  aluguel:   'Aluguel galpão',
  caucao:    'Caução (oport.)',
  folha:     'Folha pagamento',
  etiquetas: 'Etiquetas/embalagens',
  energia:   'Energia/utilidades',
  outros:    'Outros fixos',
};

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

function _legacyToItems(legacy) {
  const items = [];
  Object.entries(LEGACY_COST_LABELS).forEach(([key, label]) => {
    if (legacy[key] != null && legacy[key] !== '') {
      items.push({ id: key, nome: label, tipo: 'fixo', valor: parseNumberBR(legacy[key]) });
    }
  });
  if (legacy.custom) {
    try {
      JSON.parse(legacy.custom).forEach(c => {
        items.push({ id: c.id || _genId(), nome: c.nome || 'Custo', tipo: 'fixo', valor: parseNumberBR(c.valor) });
      });
    } catch (e) { /* ignore malformed legacy custom */ }
  }
  return items;
}

function _parseItens(data) {
  try { return data.itens ? JSON.parse(data.itens) : []; } catch (e) { return []; }
}

function _prevMonthKey(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Read a month's costs. Returns { exists, itens, fechado }.
// One-time migration: opening 2026-07 with no doc yet seeds it from the
// legacy single config/costs document (current state). No history is invented.
export async function getMonthCosts(month) {
  const ref = doc(db, 'custos_operacionais', month);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    return { exists: true, itens: _parseItens(d), fechado: !!d.fechado };
  }
  if (month === '2026-07') {
    const legacy = await getDoc(doc(db, 'config', 'costs')).catch(() => null);
    if (legacy?.exists?.()) {
      const itens = _legacyToItems(legacy.data());
      await setDoc(ref, {
        itens: JSON.stringify(itens), fechado: false, month,
        migratedFrom: 'config/costs', updatedAt: new Date().toISOString(),
      });
      return { exists: true, itens, fechado: false };
    }
  }
  return { exists: false, itens: [], fechado: false };
}

export async function saveMonthCosts(month, itens, fechado = false) {
  await setDoc(doc(db, 'custos_operacionais', month), {
    itens: JSON.stringify(itens || []),
    fechado: !!fechado,
    month,
    updatedAt: new Date().toISOString(),
  });
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
