import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where, updateDoc, deleteDoc } from 'firebase/firestore';

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
