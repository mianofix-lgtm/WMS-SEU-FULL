import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';

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

// ─── Auth helpers ────────────────────────────────────────
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
  if (!userDoc.exists()) throw new Error('Usuário não encontrado no sistema');
  return { uid: cred.user.uid, email: cred.user.email, ...userDoc.data() };
}

export async function logout() {
  await signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        callback({ uid: user.uid, email: user.email, ...userDoc.data() });
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

// ─── Firestore helpers ───────────────────────────────────
export async function getUserProfile(uid) {
  const d = await getDoc(doc(db, 'users', uid));
  return d.exists() ? d.data() : null;
}

// Get WMS data (all cells)
export async function getWmsData() {
  const d = await getDoc(doc(db, 'wms', 'estoque'));
  if (!d.exists()) return {};
  const raw = d.data();
  if (raw.data) return JSON.parse(raw.data);
  return {};
}

// Save WMS data
export async function saveWmsData(cells) {
  await setDoc(doc(db, 'wms', 'estoque'), {
    data: JSON.stringify(cells),
    updatedAt: new Date().toISOString()
  });
}

// Get stock for a specific client (loja)
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
