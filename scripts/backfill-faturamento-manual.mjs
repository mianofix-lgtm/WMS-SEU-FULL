#!/usr/bin/env node
/**
 * Backfill de `faturamento_manual` com os valores da fórmula ANTIGA do Dashboard.
 *
 * Antes da Tarefa 4, o Dashboard calculava a receita assim, por cliente:
 *     armazenagem = max(posições × pricing.pallet_month, pricing.min_monthly)
 *     wms_portal  = pricing.wms
 *     frete       — não existia
 *
 * Este script grava esses números em faturamento_manual/{cliente}_{YYYY-MM},
 * para que o histórico do P&L continue com os valores que você já viu na tela.
 *
 * GARANTIAS
 *   • Idempotente: só grava CAMPO AUSENTE. Um campo já existente — inclusive um
 *     zero que você digitou de propósito — nunca é sobrescrito. Rodar de novo
 *     não duplica nem altera nada.
 *   • Meses protegidos (PROTECTED_MONTHS, hoje 2026-07): se o documento já tiver
 *     QUALQUER valor manual, o mês inteiro daquele cliente é pulado.
 *   • `frete` NÃO é gravado: a fórmula antiga não tinha frete. Deixá-lo ausente
 *     mantém o campo aberto para digitação (e ele já lê como 0).
 *   • Dry-run é o padrão. Só grava com --commit.
 *
 * LIMITAÇÃO HERDADA DA FÓRMULA ANTIGA
 *   A grade do WMS não tem dimensão histórica: as posições são as de HOJE. Todo
 *   mês do backfill usa a ocupação atual — exatamente como o Dashboard antigo
 *   fazia. Os números reproduzem o que estava na tela, não a ocupação real de
 *   cada mês. Confira no dry-run antes de gravar.
 *
 * USO
 *   $env:FB_EMAIL='diretor@empresa.com'; $env:FB_PASSWORD='senha'
 *   npm run backfill:dry      # mostra o que faria, não grava
 *   npm run backfill          # grava de verdade
 *
 * FLAGS
 *   --commit                  grava (sem isso é dry-run)
 *   --months-back=N           quantos meses para trás (padrão 6, igual à série
 *                             de 6 meses do Dashboard)
 *   --only-billing-clients    só clientes com lançamento em `billing` no mês.
 *                             Sem a flag, inclui também todo cliente com
 *                             posição no WMS — que é o que o Dashboard antigo
 *                             considerava.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

// Mesma config de firebase.js (script Node não pode importar firebase.js: o
// package.json não declara "type":"module", então .js é lido como CommonJS).
const firebaseConfig = {
  apiKey: "AIzaSyAaVjIxfLAZWySdn2rYdUvwpsetL1xjrFE",
  authDomain: "wms-seu-full.firebaseapp.com",
  projectId: "wms-seu-full",
  storageBucket: "wms-seu-full.firebasestorage.app",
  messagingSenderId: "658349799840",
  appId: "1:658349799840:web:ce6aaf29a0eda379ca4cc5"
};

// ─── Flags ───────────────────────────────────────────────
const ARGV = process.argv.slice(2);
const COMMIT = ARGV.includes('--commit');
const ONLY_BILLING = ARGV.includes('--only-billing-clients');
const MONTHS_BACK = (() => {
  const a = ARGV.find(x => x.startsWith('--months-back='));
  const n = a ? parseInt(a.split('=')[1], 10) : 6;
  return Number.isFinite(n) && n > 0 ? n : 6;
})();

// Competências que o script nunca sobrescreve se já tiverem valor manual.
const PROTECTED_MONTHS = new Set(['2026-07']);

// Fallbacks idênticos aos que o Dashboard antigo usava.
const FALLBACK_PALLET_MONTH = 350;
const FALLBACK_WMS = 2000;
const FALLBACK_MIN_MONTHLY = 1500;

// Campos que este script sabe preencher. `frete` fica de fora de propósito.
const FIELDS = ['armazenagem', 'wms_portal'];

// ─── Helpers copiados de firebase.js ─────────────────────
// ATENÇÃO: manter em sincronia com firebase.js. Se a geração do id divergir, o
// Faturamento não encontra os documentos que este script gravar.
function manualBillingKey(client, month) {
  const safe = String(client || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\/\\.#\[\]*`$]/g, '-')
    .replace(/^_+|_+$/g, '');
  return `${safe}_${month}`;
}

function manualClientKey(client) {
  return String(client || '').trim().replace(/\s+/g, '_').toUpperCase();
}

function parseNumberBR(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  let s = v.trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const padL = (s, n) => String(s).padStart(n);

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  const email = process.env.FB_EMAIL;
  const password = process.env.FB_PASSWORD;
  if (!email || !password) {
    console.error('\n✗ Faltam credenciais.\n');
    console.error("  PowerShell:  $env:FB_EMAIL='diretor@empresa.com'; $env:FB_PASSWORD='senha'");
    console.error('  A conta precisa ser diretor (regra do Firestore para faturamento_manual).\n');
    process.exit(1);
  }

  console.log('');
  console.log('═'.repeat(78));
  console.log(`  BACKFILL faturamento_manual — ${COMMIT ? 'MODO GRAVAÇÃO' : 'DRY-RUN (nada será gravado)'}`);
  console.log('═'.repeat(78));

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await signInWithEmailAndPassword(auth, email, password);
  const me = await getDoc(doc(db, 'users', auth.currentUser.uid));
  const role = me.exists() ? me.data().role : '(sem perfil)';
  console.log(`\n  Autenticado: ${email}  ·  perfil: ${role}`);
  if (role !== 'diretor') {
    console.warn('  ⚠ Perfil não é diretor — a gravação será negada pelas regras do Firestore.');
  }

  // 1) Preços
  const pricingSnap = await getDoc(doc(db, 'config', 'pricing'));
  const pricing = pricingSnap.exists() ? pricingSnap.data() : {};
  const palletPrice = parseNumberBR(pricing.pallet_month) || FALLBACK_PALLET_MONTH;
  const wmsPrice = parseNumberBR(pricing.wms) || FALLBACK_WMS;
  const minMonthly = parseNumberBR(pricing.min_monthly) || FALLBACK_MIN_MONTHLY;
  console.log(`  Preços: pallet_month=${brl(palletPrice)}  wms=${brl(wmsPrice)}  min_monthly=${brl(minMonthly)}`);

  // 2) Posições por cliente (grade WMS atual)
  const wmsSnap = await getDoc(doc(db, 'wms', 'estoque'));
  let cells = {};
  if (wmsSnap.exists() && wmsSnap.data().data) {
    try { cells = JSON.parse(wmsSnap.data().data); } catch (e) { cells = {}; }
  }
  const positionsByKey = {};
  Object.values(cells).forEach(c => {
    if (!c?.loja) return;
    const k = manualClientKey(c.loja);
    positionsByKey[k] = (positionsByKey[k] || 0) + 1;
  });

  // 3) Nome canônico do cliente — MESMA resolução que o Faturamento usa, na
  //    mesma ordem de precedência, para o doc id bater com o que a tela lê.
  const lojaMap = {};
  const addLoja = (name) => {
    if (!name) return;
    const k = manualClientKey(name);
    if (k && !lojaMap[k]) lojaMap[k] = String(name).trim();
  };
  Object.values(cells).forEach(c => addLoja(c.loja));
  const usersSnap = await getDocs(collection(db, 'users'));
  usersSnap.forEach(d => { const u = d.data(); if (u.loja && u.status === 'ativo') addLoja(u.loja); });
  try {
    const cfg = await getDoc(doc(db, 'wms', 'config'));
    if (cfg.exists() && Array.isArray(cfg.data().lojas)) cfg.data().lojas.forEach(addLoja);
  } catch (e) { /* config opcional */ }

  // 4) Clientes por mês, a partir dos docs de billing
  const billingSnap = await getDocs(collection(db, 'billing'));
  const clientsByMonth = {};
  billingSnap.forEach(d => {
    const b = d.data();
    if (!b.month || !b.client) return;
    if (!clientsByMonth[b.month]) clientsByMonth[b.month] = new Map();
    const k = manualClientKey(b.client);
    if (!clientsByMonth[b.month].has(k)) clientsByMonth[b.month].set(k, String(b.client).trim());
    addLoja(b.client);
  });

  // 5) Meses: últimos N + todos os que têm doc de billing
  const months = new Set(Object.keys(clientsByMonth));
  const today = new Date();
  for (let i = 0; i < MONTHS_BACK; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.add(monthKey(d));
  }
  const monthList = [...months].sort();

  console.log(`  Meses no escopo (${monthList.length}): ${monthList.join(', ')}`);
  console.log(`  Clientes com posição no WMS: ${Object.keys(positionsByKey).length}`);
  console.log(`  Escopo de clientes: ${ONLY_BILLING ? 'só quem tem billing no mês' : 'billing do mês + qualquer cliente com posição no WMS'}`);
  console.log('');

  // 6) Plano e execução
  const plan = [];
  for (const month of monthList) {
    const clients = new Map(clientsByMonth[month] || []);
    if (!ONLY_BILLING) {
      Object.keys(positionsByKey).forEach(k => { if (!clients.has(k)) clients.set(k, lojaMap[k] || k); });
    }

    for (const [key, fallbackName] of [...clients.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const display = lojaMap[key] || fallbackName;
      const positions = positionsByKey[key] || 0;
      const computed = {
        armazenagem: Math.max(positions * palletPrice, minMonthly),
        wms_portal: wmsPrice,
      };

      const id = manualBillingKey(display, month);
      const existingSnap = await getDoc(doc(db, 'faturamento_manual', id));
      const existing = existingSnap.exists() ? existingSnap.data() : null;
      const hasAnyManual = !!existing && FIELDS.concat('frete').some(f => f in existing);

      if (PROTECTED_MONTHS.has(month) && hasAnyManual) {
        plan.push({ month, display, id, positions, action: 'protegido', fields: {}, existing });
        continue;
      }

      // Idempotência: só campos AUSENTES. Um 0 digitado é valor, não vazio.
      const toWrite = {};
      FIELDS.forEach(f => { if (!existing || !(f in existing)) toWrite[f] = computed[f]; });

      plan.push({
        month, display, id, positions, existing,
        action: Object.keys(toWrite).length ? (existing ? 'completar' : 'criar') : 'ok',
        fields: toWrite,
      });
    }
  }

  // 7) Relatório
  let written = 0, failed = 0;
  for (const month of monthList) {
    const rows = plan.filter(p => p.month === month);
    if (!rows.length) continue;
    const totA = rows.reduce((s, r) => s + (('armazenagem' in r.fields) ? r.fields.armazenagem : parseNumberBR(r.existing?.armazenagem)), 0);
    const totW = rows.reduce((s, r) => s + (('wms_portal' in r.fields) ? r.fields.wms_portal : parseNumberBR(r.existing?.wms_portal)), 0);

    console.log('─'.repeat(78));
    console.log(`  ${month}`);
    console.log('─'.repeat(78));
    console.log(`  ${pad('CLIENTE', 24)} ${padL('POS', 4)} ${padL('ARMAZENAGEM', 14)} ${padL('WMS+PORTAL', 13)}  AÇÃO`);
    for (const r of rows) {
      const a = 'armazenagem' in r.fields ? brl(r.fields.armazenagem) : `(${brl(r.existing?.armazenagem)})`;
      const w = 'wms_portal' in r.fields ? brl(r.fields.wms_portal) : `(${brl(r.existing?.wms_portal)})`;
      console.log(`  ${pad(r.display, 24)} ${padL(r.positions, 4)} ${padL(a, 14)} ${padL(w, 13)}  ${r.action}`);

      if (COMMIT && Object.keys(r.fields).length) {
        try {
          await setDoc(doc(db, 'faturamento_manual', r.id), {
            ...r.fields,
            client: r.display,
            month: r.month,
            updatedAt: new Date().toISOString(),
            backfilledFrom: 'dashboard-legacy-formula',
          }, { merge: true });
          written++;
        } catch (e) {
          failed++;
          console.error(`    ✗ falha ao gravar ${r.id}: ${e?.code || e?.message}`);
        }
      }
    }
    console.log(`  ${pad('TOTAL DO MÊS', 24)} ${padL('', 4)} ${padL(brl(totA), 14)} ${padL(brl(totW), 13)}`);
    console.log('');
  }

  // 8) Resumo
  const byAction = plan.reduce((acc, p) => { acc[p.action] = (acc[p.action] || 0) + 1; return acc; }, {});
  console.log('═'.repeat(78));
  console.log('  RESUMO');
  console.log('═'.repeat(78));
  console.log(`  criar     : ${byAction.criar || 0}  (documento novo)`);
  console.log(`  completar : ${byAction.completar || 0}  (doc existe, faltava campo)`);
  console.log(`  ok        : ${byAction.ok || 0}  (já preenchido — nada a fazer)`);
  console.log(`  protegido : ${byAction.protegido || 0}  (mês protegido com valor manual)`);
  console.log(`  valores entre (parênteses) já existiam e NÃO foram tocados.`);
  if (COMMIT) {
    console.log(`\n  ✓ ${written} documento(s) gravado(s).${failed ? `  ✗ ${failed} falha(s).` : ''}`);
  } else {
    console.log('\n  DRY-RUN — nada foi gravado. Para gravar:  npm run backfill');
  }
  console.log('');

  await signOut(auth);
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error('\n✗ Erro:', e?.code || e?.message || e);
  if (e?.code === 'auth/invalid-credential' || e?.code === 'auth/wrong-password') {
    console.error('  Verifique FB_EMAIL / FB_PASSWORD.');
  }
  if (e?.code === 'permission-denied') {
    console.error('  Regras do Firestore: faturamento_manual exige diretor para escrita.');
    console.error('  Publique o bloco de regras antes de rodar com --commit.');
  }
  process.exit(1);
});
