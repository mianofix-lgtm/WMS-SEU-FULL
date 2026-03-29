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
