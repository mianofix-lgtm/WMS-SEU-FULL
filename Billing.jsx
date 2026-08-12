import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { db, getWmsData, getPricing, DEFAULT_PRICES, logAction, getManualBilling, saveManualBilling, parseNumberBR } from './firebase.js';
import { LOGO_ICON, LOGO_WORDMARK } from './logo.js';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const SERVICE_CONFIG = {
  'Full ML':           { label:'Preparo Full ML',             priceKey:'full_unit',       adicionais:['etiqFull','kitSmall','kitMedium','kitLarge','montagem','frete','outro'] },
  'Envio Flex':        { label:'Envio Flex',                  priceKey:'flex',            adicionais:['etiqReceb','frete','outro'] },
  'Correios/Places':   { label:'Correios / Places / Agência', priceKey:'correios_places', adicionais:['etiqReceb','frete','outro'] },
  'Recebimento Caixa': { label:'Recebimento Caixa',           priceKey:'receb_caixa',     adicionais:[] },
  'Triagem Devoluções':{ label:'Triagem Devoluções',          priceKey:'devolucao',       adicionais:[] },
  'Outros':            { label:'Outros',                      priceKey:null,              adicionais:[] },
};

const ADICIONAL_CONFIG = {
  etiqFull:  { label:'Etiquetagem Full',        priceKey:'etiq_full',          type:'qty' },
  etiqReceb: { label:'Etiquetagem Recebimento', priceKey:'etiq_receb',         type:'qty' },
  kitSmall:  { label:'Kit Pequeno',             priceKey:'kit_small',          type:'qty' },
  kitMedium: { label:'Kit Médio',               priceKey:'kit_medium',         type:'qty' },
  kitLarge:  { label:'Kit Grande',              priceKey:'kit_large',          type:'qty' },
  montagem:  { label:'Montagem Embalagem',      priceKey:'montagem_embalagem', type:'qty' },
  frete:     { label:'Frete',                   priceKey:null,                 type:'valor' },
  outro:     { label:'Outro custo extra',        priceKey:null,                 type:'valor+desc' },
};

const DEFAULT_ADDS = {
  etiqFull:  {active:false, qtd:'1'},
  etiqReceb: {active:false, qtd:'1'},
  kitSmall:  {active:false, qtd:'1'},
  kitMedium: {active:false, qtd:'1'},
  kitLarge:  {active:false, qtd:'1'},
  montagem:  {active:false, qtd:'1'},
  frete:     {active:false, valor:''},
  outro:     {active:false, desc:'', valor:''},
};

// A lançamento carries the shipment data (applies to every item) plus a list of
// items. Same `produtos`-array idea used by Wms.jsx (EMPTY_PROD), kept in the
// billing vocabulary: sku, nome, canal, qtd, valorUnit.
//
// Fresh objects every call: `adds` is nested state and must never be shared
// between items.
function newItem(canal = 'Full ML', valorUnit = '') {
  return {
    sku:'', nome:'', canal, qtd:'1', valorUnit, descCustom:'',
    adds: Object.fromEntries(Object.entries(DEFAULT_ADDS).map(([k, v]) => [k, {...v}])),
  };
}

function defaultForm(canal = 'Full ML', valorUnit = '') {
  return {
    dataVenda:'', numero:'', numEnvio:'',
    paletes:'', caixasMaster:'', obs:'',
    itens: [newItem(canal, valorUnit)],
  };
}

// ─── Retrocompatibilidade ────────────────────────────────
// Reads BOTH shapes and always returns a list of items:
//   • new:    { itens:[{sku,nome,canal,qtd,valorUnitario,adicionais,valor}], ... }
//   • legacy: { produto, canal, qtd, valorUnitario, adicionais, valor, ... }
//     (~90 existing lançamentos) — the sale itself is treated as its own single
//     item. Nothing is written back: legacy documents stay exactly as they are
//     on disk. There is no migration.
function saleItems(s) {
  if (Array.isArray(s?.itens) && s.itens.length) return s.itens;
  return [{
    sku: s?.sku || '',
    nome: s?.produto || s?.descCustom || canalLabel(s?.canal) || '',
    descCustom: s?.descCustom || '',
    canal: s?.canal || 'Outros',
    qtd: s?.qtd ?? 1,
    valorUnitario: s?.valorUnitario ?? 0,
    adicionais: s?.adicionais || [],
    valor: s?.valor ?? 0,
  }];
}

// Unit price shown for an item, falling back to derived value on old records
// that never stored valorUnitario.
const itemUnit = (it) =>
  it.valorUnitario != null ? it.valorUnitario
  : it.qtd ? (it.valor || 0) / (it.qtd || 1)
  : (it.valor || 0);

// Legacy canal names ('Flex', 'Correios', 'Places', 'Preparo Full ML', 'Kit')
// collapse onto the current SERVICE_CONFIG keys, so filter and grouping treat a
// legacy entry as the same service type the edit form loads it as.
function canalKeyOf(canal) {
  if (SERVICE_CONFIG[canal]) return canal;
  if (canal === 'Preparo Full ML') return 'Full ML';
  if (canal === 'Flex') return 'Envio Flex';
  if (canal === 'Correios' || canal === 'Places') return 'Correios/Places';
  return 'Outros';
}

function canalLabel(canal) {
  const k = canalKeyOf(canal);
  return SERVICE_CONFIG[k]?.label || canal;
}

// Filter buttons and groups follow the order of the service dropdown.
const CANAL_ORDER = Object.keys(SERVICE_CONFIG);

// Effective date of a sale: the typed sale date, else the record timestamp.
const saleTime = (s) =>
  s.dataVenda ? new Date(s.dataVenda + 'T12:00:00').getTime()
  : s.data ? new Date(s.data).getTime()
  : 0;

function canalColor(canal) {
  if (canal==='Full ML'||canal==='Preparo Full ML') return {bg:'#00C89620',c:'#00C896'};
  if (canal==='Envio Flex'||canal==='Flex') return {bg:'#3b82f620',c:'#3b82f6'};
  if (canal==='Correios/Places'||canal==='Correios'||canal==='Places') return {bg:'#f9731620',c:'#f97316'};
  if (canal==='Recebimento Caixa') return {bg:'#7c3aed20',c:'#a78bfa'};
  if (canal==='Triagem Devoluções') return {bg:'#dc262620',c:'#fca5a5'};
  return {bg:'#8B8D9720',c:'#C0C2CC'};
}

const money = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', {minimumFractionDigits:2});

// Manually-entered monthly values, per client + competência.
const MANUAL_LABELS = {
  wms_portal:  'WMS + Portal',
  armazenagem: 'Armazenagem',
  frete:       'Frete',
};

// Inline editor for a manually-entered R$ value. Accepts "1234,56" or
// "1234.56"; the parent normalizes to Number before saving.
function ManualValue({ value, editing, canEdit, saving, onStart, onCancel, onSave, big }) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (editing) setDraft(value ? String(value).replace('.', ',') : '');
  }, [editing]);

  const valStyle = big
    ? {fontSize:22, fontWeight:900, marginTop:4}
    : {fontWeight:700};

  if (!editing) {
    if (!canEdit) return <span style={valStyle}>{money(value)}</span>;
    return (
      <button onClick={onStart} title="Clique para editar"
        style={{...valStyle, display:'inline-flex', alignItems:'center', gap:6, background:'transparent',
          border:'1px dashed #1E2028', borderRadius:6, padding:big?'2px 8px':'2px 6px', color:'#fff',
          fontFamily:'inherit', cursor:'pointer'}}>
        {money(value)}
        <span style={{fontSize:big?12:10, color:'#00C896'}}>✎</span>
      </button>
    );
  }

  return (
    <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
      <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') onSave(draft); if (e.key === 'Escape') onCancel(); }}
        placeholder="0,00" inputMode="decimal"
        style={{width:big?120:100, padding:'6px 10px', background:'#161820', border:'1.5px solid #00C89660',
          borderRadius:6, color:'#fff', fontSize:big?16:13, fontWeight:700, fontFamily:'inherit',
          outline:'none', boxSizing:'border-box'}} />
      <button onClick={() => onSave(draft)} disabled={saving}
        style={{padding:'5px 9px', background:'#00C896', border:'none', borderRadius:5, color:'#0F1117',
          fontSize:12, fontWeight:800, cursor:saving?'wait':'pointer', fontFamily:'inherit'}}>
        {saving ? '…' : '✓'}
      </button>
      <button onClick={onCancel} disabled={saving}
        style={{padding:'5px 9px', background:'#161820', border:'1px solid #1E2028', borderRadius:5,
          color:'#8B8D97', fontSize:12, cursor:'pointer', fontFamily:'inherit'}}>✕</button>
      <span style={{fontSize:11, color:'#8B8D97', whiteSpace:'nowrap'}}>= {money(parseNumberBR(draft))}</span>
    </div>
  );
}

export default function Billing() {
  const { user, checkPerm } = useAuth();
  const [PRICES, setPRICES] = useState({...DEFAULT_PRICES, pallet_day: DEFAULT_PRICES.pallet_month / 30});
  const [clients, setClients] = useState([]);
  const [selClient, setSelClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [pallets, setPallets] = useState([]);
  const [newSale, setNewSale] = useState(() => defaultForm());
  const [editingSale, setEditingSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [toast, setToast] = useState('');
  const [wmsData, setWmsData] = useState({});
  const [coletaData, setColetaData] = useState([]);
  const [positionWarnings, setPositionWarnings] = useState([]);
  const [tab, setTab] = useState('resumo');
  // Presentation-only state for the sales list: nothing here changes values,
  // what gets saved, the PDF or the month total.
  const [filterCanal, setFilterCanal] = useState('all');
  const [groupByCanal, setGroupByCanal] = useState(false);
  // Manual per-client/per-month values (faturamento_manual/{cliente}_{YYYY-MM}).
  // Never derived: no stored document means zero.
  const [manual, setManual] = useState({ wms_portal: 0, armazenagem: 0, frete: 0 });
  const [manualErr, setManualErr] = useState('');
  // 'slot:campo' — the slot prefix keeps the KPI editor and the Resumo-row
  // editor for the same field from opening together.
  const [editingField, setEditingField] = useState(null);
  const [savingManual, setSavingManual] = useState(false);
  // Guards against a slow response for a previous client/month landing on the
  // current selection — which would otherwise let a save write the wrong
  // client's value into this one.
  const loadKeyRef = useRef('');

  const canEditManual = user?.role === 'diretor' || user?.role === 'comercial' || !!checkPerm?.('billing.editar');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const pricing = await getPricing();
      setPRICES({...pricing, pallet_day: pricing.pallet_month / 30});
      const snap = await getDocs(collection(db, 'users'));
      const allUsers = [];
      snap.forEach(d => allUsers.push({uid:d.id,...d.data()}));
      const wms = await getWmsData();
      setWmsData(wms);
      try {
        const coletaDoc = await getDoc(doc(db, 'wms', 'coletas'));
        if (coletaDoc.exists() && coletaDoc.data().history) {
          setColetaData(JSON.parse(coletaDoc.data().history));
        }
      } catch(e) {}
      const warnings = [];
      Object.entries(wms).forEach(([id, cell]) => {
        const hasContent = cell.nome || cell.descricao || (cell.produtos && cell.produtos.length > 0 && cell.produtos[0].nome);
        if (cell.loja && !hasContent) warnings.push({id, loja: cell.loja, issue: 'Sem nome do produto'});
        if (hasContent && !cell.loja) warnings.push({id, loja: '-', issue: 'Sem loja definida'});
      });
      setPositionWarnings(warnings);
      const lojaMap = {};
      const addLoja = (name) => { if (!name) return; const key = name.trim().toUpperCase(); if (!lojaMap[key]) lojaMap[key] = name.trim(); };
      Object.values(wms).forEach(c => addLoja(c.loja));
      allUsers.filter(u => u.loja && u.status === 'ativo').forEach(u => addLoja(u.loja));
      try {
        const cfgDoc = await getDoc(doc(db, 'wms', 'config'));
        if (cfgDoc.exists() && Array.isArray(cfgDoc.data().lojas)) cfgDoc.data().lojas.forEach(addLoja);
      } catch(e) {}
      const uniqueLojas = Object.values(lojaMap).sort();
      setClients(uniqueLojas);
      if (uniqueLojas.length > 0 && !selClient) setSelClient(uniqueLojas[0]);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { if (selClient && month) loadClientData(); }, [selClient, month]);

  async function loadClientData() {
    // Any open inline editor belongs to the previous selection — close it.
    setEditingField(null);
    // The previous selection's service types may not exist here; a stale filter
    // would show an empty list for no visible reason.
    setFilterCanal('all');
    const reqKey = `${selClient}||${month}`;
    loadKeyRef.current = reqKey;
    const stale = () => loadKeyRef.current !== reqKey;
    try {
      const key = `billing_${selClient}_${month}`.replace(/\s/g,'_');
      const d = await getDoc(doc(db, 'billing', key));
      if (stale()) return;
      if (d.exists()) {
        const data = d.data();
        setSales(data.sales ? JSON.parse(data.sales) : []);
        setPallets(data.pallets ? JSON.parse(data.pallets) : []);
      } else { setSales([]); setPallets([]); }
    } catch(e) { console.error(e); if (!stale()) { setSales([]); setPallets([]); } }

    const m = await getManualBilling(selClient, month);
    if (stale()) return;
    setManual({ wms_portal: m.wms_portal, armazenagem: m.armazenagem, frete: m.frete });
    setManualErr(m.error || '');
  }

  // Saves ONE field of ONE client for ONE month. The target client/month is
  // captured here, and the inline editor is only ever open for the current
  // selection, so this can never touch another client or competência.
  async function saveManualField(field, raw) {
    if (!canEditManual) { showToast('Sem permissão para editar valores.'); return; }
    const targetClient = selClient, targetMonth = month;
    const valor = parseNumberBR(raw);
    if (valor < 0) { showToast('Valor não pode ser negativo'); return; }
    setSavingManual(true);
    try {
      await saveManualBilling(targetClient, targetMonth, { [field]: valor });
      if (loadKeyRef.current === `${targetClient}||${targetMonth}`) {
        setManual(prev => ({ ...prev, [field]: valor }));
        setManualErr('');
        setEditingField(null);
      }
      showToast(`${MANUAL_LABELS[field] || field} salvo: ${money(valor)}`);
      logAction(user, 'BILLING_MANUAL', `${targetClient} ${targetMonth}: ${field} = ${valor.toFixed(2)}`).catch(()=>{});
    } catch(e) {
      console.error(e);
      showToast('Erro ao salvar: ' + (e?.code || e?.message || 'falha'));
    }
    setSavingManual(false);
  }

  async function saveClientData(newSales, newPallets) {
    const key = `billing_${selClient}_${month}`.replace(/\s/g,'_');
    await setDoc(doc(db, 'billing', key), {
      client: selClient, month,
      sales: JSON.stringify(newSales || sales),
      pallets: JSON.stringify(newPallets || pallets),
      updatedAt: new Date().toISOString(),
    });
  }

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''),3000); }

  // ─── Item form helpers ───
  function patchItem(i, patch) {
    setNewSale(f => ({ ...f, itens: f.itens.map((it, j) => j === i ? { ...it, ...patch } : it) }));
  }

  function patchItemAdd(i, key, patch) {
    setNewSale(f => ({ ...f, itens: f.itens.map((it, j) =>
      j === i ? { ...it, adds: { ...it.adds, [key]: { ...it.adds[key], ...patch } } } : it) }));
  }

  // Switching the service pulls the price from the pricing table (Firestore) and
  // clears the adicionais, which differ per service.
  function handleItemService(i, canal) {
    const svc = SERVICE_CONFIG[canal];
    const price = svc?.priceKey ? (PRICES[svc.priceKey] ?? '') : '';
    setNewSale(f => ({ ...f, itens: f.itens.map((it, j) =>
      j === i ? { ...newItem(canal, price !== '' ? String(price) : ''), sku: it.sku, nome: it.nome, qtd: it.qtd } : it) }));
  }

  function addItem() {
    const canal = newSale.itens[newSale.itens.length - 1]?.canal || 'Full ML';
    const svc = SERVICE_CONFIG[canal];
    const price = svc?.priceKey ? (PRICES[svc.priceKey] ?? '') : '';
    setNewSale(f => ({ ...f, itens: [...f.itens, newItem(canal, price !== '' ? String(price) : '')] }));
  }

  function removeItem(i) {
    setNewSale(f => f.itens.length <= 1 ? f : { ...f, itens: f.itens.filter((_, j) => j !== i) });
  }

  // Resolved adicionais of one item, priced from the pricing table.
  function buildAdicionais(item) {
    const svc = SERVICE_CONFIG[item.canal];
    const out = [];
    (svc?.adicionais || []).forEach(key => {
      const add = item.adds?.[key];
      if (!add?.active) return;
      const cfg = ADICIONAL_CONFIG[key];
      let valor = 0, addQtd = 1;
      if (cfg.type === 'qty') {
        addQtd = parseInt(add.qtd) || 1;
        valor = addQtd * (PRICES[cfg.priceKey] || 0);
      } else {
        valor = parseFloat(add.valor) || 0;
      }
      out.push({ key, label:cfg.label, qtd:addQtd, valorUnit:cfg.priceKey?(PRICES[cfg.priceKey]||0):(addQtd?valor/addQtd:0), valor, ...(cfg.type==='valor+desc'&&{desc:add.desc||''}) });
    });
    return out;
  }

  // Same math as before, per item: qtd × valor unit + adicionais.
  function buildItem(item) {
    const svc = SERVICE_CONFIG[item.canal];
    const unitPrice = parseFloat(item.valorUnit) || (svc?.priceKey ? PRICES[svc.priceKey] : 0) || 0;
    const qtd = parseInt(item.qtd) || 1;
    const adicionais = buildAdicionais(item);
    return {
      sku: (item.sku || '').trim(),
      nome: (item.nome || '').trim() || item.descCustom || svc?.label || item.canal,
      descCustom: item.descCustom || '',
      canal: item.canal,
      qtd,
      valorUnitario: unitPrice,
      adicionais,
      valor: qtd * unitPrice + adicionais.reduce((s,a) => s + a.valor, 0),
    };
  }

  const isBlankItem = (it) =>
    !(it.sku || '').trim() && !(it.nome || '').trim() &&
    !String(it.valorUnit ?? '').trim() &&
    !Object.values(it.adds || {}).some(a => a.active);

  function itemTotal(item) {
    const svc = SERVICE_CONFIG[item.canal];
    const unitPrice = parseFloat(item.valorUnit) || (svc?.priceKey ? PRICES[svc.priceKey] : 0) || 0;
    let extra = 0;
    (svc?.adicionais || []).forEach(key => {
      const add = item.adds?.[key];
      if (!add?.active) return;
      const cfg = ADICIONAL_CONFIG[key];
      if (cfg.type === 'qty') extra += (parseInt(add.qtd)||1) * (PRICES[cfg.priceKey]||0);
      else extra += parseFloat(add.valor)||0;
    });
    return (parseInt(item.qtd) || 1) * unitPrice + extra;
  }

  // ─── Sales ───
  async function addSale() {
    // Untouched blank rows are dropped; if the operator filled nothing at all,
    // fall back to the first item so a service-only entry still works like before.
    let source = newSale.itens.filter(it => !isBlankItem(it));
    if (!source.length) source = newSale.itens.slice(0, 1);
    const itens = source.map(buildItem);
    if (!itens.length) { showToast('Adicione ao menos um produto'); return; }
    const total = itens.reduce((s, it) => s + it.valor, 0);
    const sale = {
      id: editingSale || Date.now().toString(36),
      numero: newSale.numero,
      numEnvio: newSale.numEnvio,
      paletes: newSale.paletes === '' ? '' : (parseInt(newSale.paletes) || 0),
      caixasMaster: newSale.caixasMaster === '' ? '' : (parseInt(newSale.caixasMaster) || 0),
      obs: newSale.obs || '',
      itens,
      dataVenda: newSale.dataVenda || '',
      data: newSale.dataVenda ? new Date(newSale.dataVenda+'T12:00:00').toISOString() : new Date().toISOString(),
      // Top-level `valor` is the sum of the items, so everything that already
      // sums sales[].valor — TOTAL MÊS, Resumo, PDF subtotal — keeps working
      // untouched for both formats.
      valor: total,
    };
    const next = editingSale ? sales.map(s => s.id === editingSale ? sale : s) : [sale, ...sales];
    setSales(next);
    await saveClientData(next, pallets);
    setNewSale(defaultForm(newSale.itens[0]?.canal || 'Full ML'));
    setEditingSale(null);
    showToast(editingSale ? 'Lançamento atualizado!' : 'Lançamento registrado!');
    logAction(user, editingSale ? 'BILLING_EDIT' : 'BILLING_ADD', `${selClient}: ${itens.length} item(ns) = R$${total.toFixed(2)}`).catch(()=>{});
  }

  function calcUnitPrice(s) {
    if (s.valorUnitario != null) return s.valorUnitario;
    const svc = SERVICE_CONFIG[s.canal];
    if (svc?.priceKey) return PRICES[svc.priceKey] || 0;
    // Legacy canal names
    if (s.canal==='Preparo Full ML') return PRICES.full_unit;
    if (s.canal==='Envio Flex'||s.canal==='Flex') return PRICES.flex;
    if (s.canal==='Correios'||s.canal==='Places') return PRICES.correios_places;
    if (s.canal==='Kit') return s.kitTier==='large'?PRICES.kit_large:s.kitTier==='medium'?PRICES.kit_medium:PRICES.kit_small;
    if (s.canal==='Triagem Devoluções') return PRICES.devolucao;
    return 0;
  }

  // Rebuild the `adds` form state from a stored adicionais array.
  function addsFromAdicionais(adicionais) {
    const adds = Object.fromEntries(Object.entries(DEFAULT_ADDS).map(([k, v]) => [k, {...v}]));
    (adicionais || []).forEach(a => {
      if (!(a.key in adds)) return;
      const cfg = ADICIONAL_CONFIG[a.key];
      if (cfg.type === 'qty') adds[a.key] = {active:true, qtd:String(a.qtd||1)};
      else if (cfg.type === 'valor') adds[a.key] = {active:true, valor:String(a.valor||'')};
      else adds[a.key] = {active:true, desc:a.desc||'', valor:String(a.valor||'')};
    });
    return adds;
  }

  // Loads either shape into the form: saleItems() turns a legacy single-product
  // lançamento into a one-item list, so editing an old record works unchanged.
  function editSale(s) {
    const itens = saleItems(s).map(it => ({
      sku: it.sku || '',
      nome: it.nome || '',
      canal: canalKeyOf(it.canal),
      qtd: String(it.qtd || 1),
      valorUnit: it.valorUnitario != null ? String(it.valorUnitario) : '',
      descCustom: it.descCustom || '',
      adds: addsFromAdicionais(it.adicionais),
    }));
    setNewSale({
      dataVenda: s.dataVenda || (s.data ? s.data.substring(0,10) : ''),
      numero: s.numero || '',
      numEnvio: s.numEnvio || '',
      paletes: s.paletes === '' || s.paletes == null ? '' : String(s.paletes),
      caixasMaster: s.caixasMaster === '' || s.caixasMaster == null ? '' : String(s.caixasMaster),
      obs: s.obs || '',
      itens: itens.length ? itens : [newItem()],
    });
    setEditingSale(s.id);
    showToast(itens.length > 1 ? `Editando lançamento (${itens.length} itens)...` : 'Editando lançamento...');
  }

  async function removeSale(id) {
    const next = sales.filter(s => s.id !== id);
    setSales(next);
    await saveClientData(next, pallets);
    showToast('Venda removida');
    logAction(user, 'BILLING_REMOVE', `${selClient}: lançamento removido`).catch(()=>{});
  }

  // ─── Pallets ───
  async function addPallet() {
    const p = { id: Date.now().toString(36), entrada: new Date().toISOString(), saida: null, posicao: '' };
    const next = [p, ...pallets];
    setPallets(next);
    await saveClientData(sales, next);
    showToast('Pallet registrado');
  }

  async function closePallet(id) {
    const next = pallets.map(p => p.id === id ? {...p, saida: new Date().toISOString()} : p);
    setPallets(next);
    await saveClientData(sales, next);
    showToast('Pallet encerrado');
  }

  async function removePallet(id) {
    const next = pallets.filter(p => p.id !== id);
    setPallets(next);
    await saveClientData(sales, next);
  }

  function generatePDF() {
    const clientCells = Object.entries(wmsData)
      .filter(([id, cell]) => cell.loja && selClient && cell.loja.trim().toUpperCase() === selClient.trim().toUpperCase())
      .sort(([a],[b]) => a.localeCompare(b));
    const posRows = clientCells.map(([id, cell]) => {
      const entry = cell.dataEntrada ? new Date(cell.dataEntrada) : null;
      const days = entry ? Math.max(1, Math.ceil((new Date() - entry) / (86400000))) : 30;
      const val = days * PRICES.pallet_day;
      const prodNames = cell.produtos && cell.produtos[0]?.nome ? cell.produtos.map(p=>`${p.nome} (${p.qtd||0})`).join(', ') : `${cell.nome||cell.descricao||'-'} (${cell.qtd||0})`;
      return `<tr><td>${id}</td><td>${prodNames}</td><td style="text-align:center">${cell.produtos ? cell.produtos.reduce((s,p)=>s+(parseInt(p.qtd)||0),0) : cell.qtd||'-'}</td><td style="text-align:center">${entry?entry.toLocaleDateString('pt-BR'):'-'}</td><td style="text-align:center">${days}d</td><td style="text-align:right">R$ ${val.toFixed(2)}</td></tr>`;
    }).join('');
    // Serviços Prestados: 8 columns. Every lançamento is broken down item by
    // item with SKU and description, which is what was missing before — a
    // service with adicionais showed only the service name, never the product.
    // Works for both shapes: saleItems() presents a legacy record as one item.
    const esc = (v) => String(v ?? '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    const addLinesOf = (adicionais) => (adicionais||[]).map(a =>
      `<tr style="background:#fafafa"><td colspan="6" style="padding-left:34px;color:#666;font-size:11px">↳ ${esc(a.label)}${a.desc?' — '+esc(a.desc):''}</td><td style="text-align:right;font-size:11px">${a.qtd}</td><td style="text-align:right;font-size:11px">R$ ${(a.valor||0).toFixed(2)}</td></tr>`
    ).join('');

    const detailRows = sales.map(s => {
      const items = saleItems(s);
      const dateStr = s.dataVenda ? new Date(s.dataVenda+'T12:00:00').toLocaleDateString('pt-BR') : new Date(s.data).toLocaleDateString('pt-BR');

      // Single item (all legacy records, and new ones with one product):
      // one self-contained line, as before, now with SKU and product name.
      if (items.length === 1) {
        const it = items[0];
        return `<tr><td style="font-size:11px;color:#666">${dateStr}</td><td style="font-family:monospace;font-size:11px">${esc(s.numero)||'-'}</td><td style="font-family:monospace;font-size:11px;color:#1e3a5f">${esc(s.numEnvio)||'-'}</td><td style="font-family:monospace;font-size:11px">${esc(it.sku)||'-'}</td><td>${esc(it.nome)||'-'}</td><td>${esc(canalLabel(it.canal))}</td><td style="text-align:right">${it.qtd}</td><td style="text-align:right;font-weight:700">R$ ${(it.valor||0).toFixed(2)}</td></tr>${addLinesOf(it.adicionais)}`;
      }

      // Multi-item: shipment header, one line per item, subtotal.
      const meta = [
        `Venda ${esc(s.numero)||'-'}`,
        `Envio ${esc(s.numEnvio)||'-'}`,
        `${items.length} itens`,
        s.paletes !== '' && s.paletes != null ? `${s.paletes} palete(s)` : null,
        s.caixasMaster !== '' && s.caixasMaster != null ? `${s.caixasMaster} cx. master` : null,
      ].filter(Boolean).join(' · ');
      const header = `<tr style="background:#eef4f2"><td colspan="8" style="font-weight:700;font-size:11px;color:#2E2C3A;border-top:2px solid #00C89660">${dateStr} · ${meta}${s.obs?` · <span style="font-weight:400;color:#666">${esc(s.obs)}</span>`:''}</td></tr>`;
      const rows = items.map(it =>
        `<tr><td></td><td></td><td></td><td style="font-family:monospace;font-size:11px">${esc(it.sku)||'-'}</td><td>${esc(it.nome)||'-'}</td><td>${esc(canalLabel(it.canal))}</td><td style="text-align:right">${it.qtd}</td><td style="text-align:right;font-weight:700">R$ ${(it.valor||0).toFixed(2)}</td></tr>${addLinesOf(it.adicionais)}`
      ).join('');
      const subtotal = `<tr><td colspan="7" style="text-align:right;font-size:11px;font-weight:700;color:#666">Subtotal do lançamento</td><td style="text-align:right;font-weight:800;border-top:1px solid #00C89660">R$ ${(s.valor||0).toFixed(2)}</td></tr>`;
      return header + rows + subtotal;
    }).join('');
    const monthLabel = new Date(month+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fatura Seu Full - ${selClient} - ${month}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Outfit',sans-serif;color:#1a1a2e;padding:40px;max-width:900px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #00C896;}
.logo img{height:60px;}
.header-right{text-align:right;}
.header-right h1{font-size:22px;color:#2E2C3A;font-weight:900;letter-spacing:-0.5px;}
.header-right .period{font-size:14px;color:#00C896;font-weight:700;margin-top:4px;}
.header-right .date{font-size:12px;color:#888;margin-top:4px;}
.client-box{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:20px;margin-bottom:24px;display:flex;justify-content:space-between;}
.client-box h3{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
.client-box .name{font-size:20px;font-weight:800;color:#2E2C3A;}
.client-box .positions{font-size:28px;font-weight:900;color:#00C896;}
.section{margin-bottom:24px;}
.section h2{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding:8px 12px;background:#2E2C3A;color:#fff;border-radius:6px;}
.section h2.green{background:#00C896;color:#2E2C3A;}
table{width:100%;border-collapse:collapse;margin-bottom:8px;}
th{text-align:left;padding:8px 10px;background:#f0f0f0;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #ddd;}
td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;}
tr:nth-child(even){background:#fafafa;}
.total-row{background:#00C89615!important;font-weight:800;font-size:14px;}
.total-row td{border-top:2px solid #00C896;border-bottom:2px solid #00C896;padding:12px 10px;}
.grand-total{background:#2E2C3A;border-radius:10px;padding:24px;display:flex;justify-content:space-between;align-items:center;margin:24px 0;}
.grand-total .label{color:#8B8D97;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;}
.grand-total .value{color:#00C896;font-size:32px;font-weight:900;letter-spacing:-1px;}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e0e0e0;text-align:center;color:#999;font-size:11px;}
.footer a{color:#00C896;text-decoration:none;font-weight:600;}
@media print{body{padding:20px;}}
</style></head><body>
<div class="header">
  <div class="logo"><img src="${LOGO_WORDMARK}" alt="Seu Full" /></div>
  <div class="header-right">
    <h1>FATURA DE SERVIÇOS</h1>
    <div class="period">${monthLabel}</div>
    <div class="date">Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>
</div>
<div class="client-box">
  <div><h3>Cliente</h3><div class="name">${selClient}</div></div>
  <div style="text-align:right"><h3>Posições Ocupadas</h3><div class="positions">${clientPositions}</div></div>
</div>
<div class="section">
  <h2 class="green">Armazenagem — Posições Ocupadas</h2>
  <table><thead><tr><th>Endereço</th><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:center">Entrada</th><th style="text-align:center">Dias</th><th style="text-align:right">Valor ref.</th></tr></thead>
  <tbody>${posRows||'<tr><td colspan="6" style="text-align:center;color:#999">Nenhuma posição</td></tr>'}
  <tr class="total-row"><td colspan="5">Subtotal Armazenagem</td><td style="text-align:right">R$ ${totals.armazenagem.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
  </tbody></table>
  <p style="font-size:10px;color:#999;margin-top:-4px">Valores por posição são apenas referência de conferência. O valor cobrado é o subtotal acima.</p>
</div>
<div class="section">
  <h2>Serviços Prestados</h2>
  <table><thead><tr><th>Data</th><th>Nº Venda</th><th>Nº Envio</th><th>SKU</th><th>Produto</th><th>Serviço</th><th style="text-align:right">Qtd</th><th style="text-align:right">Valor</th></tr></thead>
  <tbody>
  <tr><td colspan="6">Sistema WMS + Portal — Fixo mensal</td><td style="text-align:right">1</td><td style="text-align:right;font-weight:700">R$ ${totals.wms.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
  <tr><td colspan="6">Frete — Fechamento do mês</td><td style="text-align:right">1</td><td style="text-align:right;font-weight:700">R$ ${totals.frete.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
  ${detailRows}
  <tr class="total-row"><td colspan="7">Subtotal Serviços</td><td style="text-align:right">R$ ${(totals.salesTotal+totals.wms+totals.frete).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
  </tbody></table>
</div>
<div class="grand-total"><div class="label">Total a Pagar</div><div class="value">R$ ${totals.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></div>
<p style="text-align:center;font-size:12px;color:#666;margin:16px 0;">Vencimento: 7 dias úteis após emissão · Impostos já inclusos nos valores</p>
<div class="footer">
  <p><strong>Seu Full Particular</strong> — Soluções operacionais completas para sua logística</p>
  <p style="margin-top:6px"><a href="https://seufull.com.br">seufull.com.br</a> · (11) 97194-4949 · (11) 94374-9798</p>
</div>
</body></html>`;
    const win = window.open('', '_blank', 'width=900,height=1200');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 800);
  }

  function palletDays(p) {
    const start = new Date(p.entrada);
    const end = p.saida ? new Date(p.saida) : new Date();
    return Math.max(1, Math.ceil((end - start) / (1000*60*60*24)));
  }

  const clientPositions = useMemo(() => {
    let count = 0;
    Object.values(wmsData).forEach(c => {
      if (c.loja && selClient && c.loja.trim().toUpperCase() === selClient.trim().toUpperCase()) count++;
    });
    return count;
  }, [wmsData, selClient]);

  // Total do lançamento = soma dos totais dos itens.
  const liveTotal = useMemo(
    () => newSale.itens.reduce((s, it) => s + itemTotal(it), 0),
    [newSale, PRICES]
  );

  // ─── Sales list presentation (filter + grouping) ───
  // Derived from `sales` for display only. The grouping subtotals are a plain
  // sum of each sale's own stored `valor` — no value is recomputed here.
  // The list shows one row per ITEM, not per lançamento. A lançamento with three
  // products occupies three rows, each carrying the shipment metadata. That is
  // what keeps the filter exact and every group subtotal adding up: a multi-item
  // entry with different services can't belong to a single group. Editing or
  // removing from any row acts on the whole parent lançamento.
  const itemRows = useMemo(() => {
    const rows = [];
    sales.forEach(s => {
      const items = saleItems(s);
      items.forEach((it, idx) => rows.push({
        rowKey: `${s.id}__${idx}`,
        sale: s,
        item: it,
        itemIndex: idx,
        itemCount: items.length,
        canalKey: canalKeyOf(it.canal),
      }));
    });
    return rows;
  }, [sales]);

  const canalGroups = useMemo(() => {
    const map = new Map();
    itemRows.forEach(r => {
      if (!map.has(r.canalKey)) map.set(r.canalKey, { key:r.canalKey, label: canalLabel(r.item.canal), count:0, total:0, rows:[] });
      const g = map.get(r.canalKey);
      g.count++;
      g.total += r.item.valor || 0;
      g.rows.push(r);
    });
    // Newest first inside each group, matching the flat list's default feel.
    map.forEach(g => g.rows.sort((a, b) => saleTime(b.sale) - saleTime(a.sale)));
    const orderOf = (k) => { const i = CANAL_ORDER.indexOf(k); return i === -1 ? CANAL_ORDER.length : i; };
    return [...map.values()].sort((a, b) => orderOf(a.key) - orderOf(b.key) || a.label.localeCompare(b.label));
  }, [itemRows]);

  // A filter for a type that no longer exists would silently show nothing.
  const activeFilter = (filterCanal !== 'all' && !canalGroups.some(g => g.key === filterCanal)) ? 'all' : filterCanal;

  const visibleRows = useMemo(
    () => activeFilter === 'all' ? itemRows : itemRows.filter(r => r.canalKey === activeFilter),
    [itemRows, activeFilter]
  );

  const visibleGroups = useMemo(
    () => activeFilter === 'all' ? canalGroups : canalGroups.filter(g => g.key === activeFilter),
    [canalGroups, activeFilter]
  );

  // Distinct lançamentos behind the visible rows, for an honest header count.
  const visibleSaleCount = useMemo(() => new Set(visibleRows.map(r => r.sale.id)).size, [visibleRows]);

  const totals = useMemo(() => {
    // Breakdown by service, walking the ITEMS of each lançamento so a
    // multi-item entry lands on every service it contains. Because the items'
    // valores add up to the lançamento's own `valor`, the channels still sum to
    // exactly salesTotal — the month total is not affected.
    const salesByChannel = {};
    sales.forEach(s => {
      saleItems(s).forEach(it => {
        const k = canalKeyOf(it.canal);
        if (!salesByChannel[k]) salesByChannel[k] = { count:0, units:0, valor:0 };
        salesByChannel[k].count++;
        salesByChannel[k].units += parseInt(it.qtd) || 1;
        salesByChannel[k].valor += it.valor || 0;
      });
    });
    const wmsPositions = clientPositions;
    // Reference figures from the price table — shown for comparison only.
    // They do NOT feed the invoice: armazenagem is a manual value now.
    const palletsRefCost = pallets.reduce((sum, p) => sum + palletDays(p) * PRICES.pallet_day, 0);
    const positionsRefCost = wmsPositions * PRICES.pallet_month;
    const salesTotal = sales.reduce((sum, s) => sum + (s.valor || 0), 0);
    // Billed values: entered by hand per client + month, never derived.
    const armazenagem = parseNumberBR(manual.armazenagem);
    const wms = parseNumberBR(manual.wms_portal);
    const frete = parseNumberBR(manual.frete);
    const total = armazenagem + wms + frete + salesTotal;
    const monthStart = month + '-01';
    const monthEnd = month + '-31';
    let autoFullItems = 0;
    coletaData.forEach(coleta => {
      const d = coleta.date?.substring(0, 10);
      if (d >= monthStart && d <= monthEnd) {
        (coleta.items || []).forEach(item => {
          if (item.loja && selClient && item.loja.trim().toUpperCase() === selClient.trim().toUpperCase()) {
            autoFullItems += parseInt(item.qtd) || 0;
          }
        });
      }
    });
    return { salesByChannel, palletsRefCost, positionsRefCost, armazenagem, frete, salesTotal, wms, total, activePallets: pallets.filter(p=>!p.saida).length, autoFullItems, wmsPositions };
  }, [sales, pallets, manual, PRICES, clientPositions, coletaData, month, selClient]);

  // ─── Sales list rendering, shared by the flat and grouped views ───
  const chipStyle = (active, col) => ({
    padding:'6px 12px', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer',
    fontFamily:'inherit', transition:'.15s', whiteSpace:'nowrap',
    background: active ? (col?.c || '#00C896') : '#161820',
    color:      active ? '#0F1117' : (col?.c || '#C0C2CC'),
    border:     `1px solid ${active ? (col?.c || '#00C896') : '#1E2028'}`,
  });

  const SALES_COLS = 10;

  const salesHead = (
    <thead><tr>
      <th style={S.th}>Data</th><th style={S.th}>Nº Venda</th><th style={S.th}>Nº Envio</th><th style={S.th}>SKU</th><th style={S.th}>Produto</th><th style={S.th}>Serviço</th><th style={{...S.th,textAlign:'right'}}>Qtd</th><th style={{...S.th,textAlign:'right'}}>Valor Unit.</th><th style={{...S.th,textAlign:'right'}}>Total</th><th style={S.th}></th>
    </tr></thead>
  );

  // One row = one item of a lançamento. Shipment metadata repeats on every row
  // of the same lançamento, so the row stays readable under any filter or
  // grouping, with a badge marking that it shares a lançamento with others.
  function itemRowView(r) {
    const { sale: s, item: it, itemCount } = r;
    const col = canalColor(r.canalKey);
    const adds = it.adicionais || [];
    const hasAdds = adds.length > 0;
    const unit = itemUnit(it);
    return (
      <tr key={r.rowKey} style={{background:editingSale===s.id?'#fbbf2410':'transparent'}}>
        <td style={{...S.td,fontSize:12,color:'#8B8D97'}}>{s.dataVenda ? new Date(s.dataVenda+'T12:00:00').toLocaleDateString('pt-BR') : new Date(s.data).toLocaleDateString('pt-BR')}</td>
        <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{s.numero||'-'}</td>
        <td style={{...S.td,fontFamily:'monospace',fontSize:12,color:'#93c5fd'}}>
          {s.numEnvio||'-'}
          {itemCount > 1 && (
            <span title={`Lançamento com ${itemCount} itens — editar/excluir afeta todos`}
              style={{marginLeft:6,background:'#7c3aed30',color:'#c4b5fd',borderRadius:8,fontSize:9,fontWeight:800,padding:'1px 6px',whiteSpace:'nowrap'}}>
              {itemCount} itens
            </span>
          )}
        </td>
        <td style={{...S.td,fontFamily:'monospace',fontSize:12,color:'#C0C2CC'}}>{it.sku||'-'}</td>
        <td style={S.td}>{it.nome||'-'}</td>
        <td style={S.td}>
          <div className="has-adds">
            <span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,background:col.bg,color:col.c}}>
              {canalLabel(it.canal)}
            </span>
            {hasAdds && <span style={{background:'#00C896',color:'#0F1117',borderRadius:10,fontSize:10,fontWeight:800,padding:'1px 5px'}}>+{adds.length}</span>}
            {hasAdds && (
              <div className="add-tip">
                <div style={{fontWeight:700,color:'#00C896',fontSize:12,marginBottom:6}}>{canalLabel(it.canal)}{it.nome?` — ${it.nome}`:''}</div>
                <div style={{color:'#C0C2CC',fontSize:11,marginBottom:3}}>
                  Principal: {it.qtd} × R$ {(it.valorUnitario||0).toFixed(2)} = <b style={{color:'#fff'}}>R$ {((it.valorUnitario||0)*(it.qtd||1)).toFixed(2)}</b>
                </div>
                {adds.map((a,i) => (
                  <div key={i} style={{color:'#C0C2CC',fontSize:11,marginBottom:2}}>
                    {a.label}{a.desc?` — ${a.desc}`:''}: {a.qtd>1?`${a.qtd} × R$${(a.valorUnit||0).toFixed(2)} = `:''}<b style={{color:'#fff'}}>R$ {(a.valor||0).toFixed(2)}</b>
                  </div>
                ))}
                <div style={{borderTop:'1px solid #2a2d3a',marginTop:6,paddingTop:6,color:'#00C896',fontWeight:700,fontSize:12}}>
                  Total do item: R$ {(it.valor||0).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </td>
        <td style={{...S.td,textAlign:'right'}}>{it.qtd}</td>
        <td style={{...S.td,textAlign:'right',color:'#8B8D97'}}>R$ {(unit||0).toFixed(2)}</td>
        <td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {(it.valor||0).toFixed(2)}</td>
        <td style={S.td}><div style={{display:'flex',gap:4}}>
          <button onClick={()=>editSale(s)} title={itemCount>1?`Editar o lançamento inteiro (${itemCount} itens)`:'Editar'} style={{padding:'4px 8px',background:'#1e3a5f',border:'none',borderRadius:4,color:'#93c5fd',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>✎</button>
          <button onClick={()=>removeSale(s.id)} title={itemCount>1?`Excluir o lançamento inteiro (${itemCount} itens)`:'Excluir'} style={S.btnDel}>✕</button>
        </div></td>
      </tr>
    );
  }

  if (loading) return <div style={S.loadPage}><div style={{color:'#00C896',fontSize:16}}>Carregando...</div></div>;

  return (
    <div style={S.page}>
      <style>{`
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.has-adds{position:relative;display:inline-flex;align-items:center;gap:4px;}
.add-tip{display:none;position:absolute;bottom:calc(100% + 8px);left:0;background:#1E2028;border:1px solid #00C89640;border-radius:8px;padding:10px 14px;min-width:240px;z-index:200;box-shadow:0 4px 24px #00000060;}
.has-adds:hover .add-tip{display:block;}
@media(max-width:768px){
  .bill-controls{flex-direction:column!important;gap:10px!important;}
  .bill-kpis{flex-direction:column!important;gap:8px!important;}
  .bill-kpi{min-width:auto!important;}
  .bill-form{flex-direction:column!important;gap:8px!important;}
  .bill-form input,.bill-form select{width:100%!important;min-height:44px!important;}
  .bill-table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch;}
  .bill-nav{display:none!important;}
}
`}</style>

      <header style={S.header}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <Link to="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <img src={LOGO_ICON} alt="Seu Full" style={{width:32,height:32,borderRadius:8}} />
            <div style={S.logoText}>Faturamento <span style={{color:'#00C896'}}>Seu Full</span></div>
          </Link>
        </div>
        <div style={{display:'flex',gap:12}}>
          <Link to="/dashboard" style={{...S.navBtn,color:'#00C896'}}>Dashboard</Link>
          <Link to="/wms" style={S.navBtn}>WMS</Link>
          <Link to="/admin" style={{...S.navBtn,color:'#fbbf24'}}>Admin</Link>
          <Link to="/portal" style={S.navBtn}>Portal</Link>
        </div>
      </header>

      <div style={S.main}>
        <div className='bill-controls' style={S.controls}>
          <div>
            <label style={S.label}>Cliente</label>
            <select value={selClient||''} onChange={e=>setSelClient(e.target.value)} style={S.select}>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Mês de referência</label>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={S.input} />
          </div>
          <div style={{marginLeft:'auto',textAlign:'right'}}>
            <div style={S.label}>Posições no WMS</div>
            <div style={{fontSize:24,fontWeight:900,color:'#00C896'}}>{clientPositions}</div>
          </div>
        </div>

        <div className='bill-kpis' style={S.kpiRow}>
          <div style={S.kpi}>
            <div style={S.kpiL}>Armazenagem (manual)</div>
            <ManualValue value={manual.armazenagem} big canEdit={canEditManual} saving={savingManual}
              editing={editingField==='kpi:armazenagem'}
              onStart={()=>setEditingField('kpi:armazenagem')} onCancel={()=>setEditingField(null)}
              onSave={(v)=>saveManualField('armazenagem', v)} />
            <div style={{fontSize:10,color:'#8B8D97',marginTop:4}}>{clientPositions} posições WMS · referência R$ {totals.positionsRefCost.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiL}>Vendas / Serviços</div>
            <div style={S.kpiV}>R$ {totals.salesTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
            <div style={{fontSize:10,color:'#8B8D97',marginTop:4}}>{sales.length} lançamentos</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiL}>WMS + Portal (manual)</div>
            <ManualValue value={manual.wms_portal} big canEdit={canEditManual} saving={savingManual}
              editing={editingField==='kpi:wms_portal'}
              onStart={()=>setEditingField('kpi:wms_portal')} onCancel={()=>setEditingField(null)}
              onSave={(v)=>saveManualField('wms_portal', v)} />
            <div style={{fontSize:10,color:'#8B8D97',marginTop:4}}>Valor fixo do mês · digitado manualmente</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiL}>Frete (manual)</div>
            <ManualValue value={manual.frete} big canEdit={canEditManual} saving={savingManual}
              editing={editingField==='kpi:frete'}
              onStart={()=>setEditingField('kpi:frete')} onCancel={()=>setEditingField(null)}
              onSave={(v)=>saveManualField('frete', v)} />
            <div style={{fontSize:10,color:'#8B8D97',marginTop:4}}>Frete do mês · não inclui os fretes lançados em vendas</div>
          </div>
          <div style={{...S.kpi,background:'#00C89610',borderColor:'#00C89640'}}>
            <div style={S.kpiL}>TOTAL MÊS</div>
            <div style={{fontSize:28,fontWeight:900,color:'#00C896',marginTop:4}}>R$ {totals.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <button onClick={generatePDF} style={{padding:'14px 32px',background:'#2E2C3A',color:'#fff',border:'2px solid #00C896',borderRadius:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:15,display:'flex',alignItems:'center',gap:10}}>📄 Gerar Relatório PDF — {selClient}</button>
        </div>

        {totals.autoFullItems > 0 && (
          <div style={{background:'#00C89610',border:'1px solid #00C89630',borderRadius:10,padding:'12px 16px',marginBottom:12,fontSize:13}}>
            <span style={{color:'#00C896',fontWeight:700}}>Full ML automático:</span> {totals.autoFullItems.toLocaleString('pt-BR')} itens detectados nas coletas do mês = <span style={{fontWeight:700}}>R$ {(totals.autoFullItems * PRICES.full_unit).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
          </div>
        )}

        {manualErr && (
          <div style={{background:'#dc262610',border:'1px solid #dc262640',borderRadius:10,padding:'12px 16px',marginBottom:12,fontSize:12,color:'#fca5a5'}}>
            <span style={{fontWeight:700}}>⚠ Valores manuais:</span> {manualErr}
          </div>
        )}

        {positionWarnings.length > 0 && (
          <div style={{background:'#fbbf2410',border:'1px solid #fbbf2430',borderRadius:10,padding:'12px 16px',marginBottom:12,fontSize:12}}>
            <span style={{color:'#fbbf24',fontWeight:700}}>⚠ {positionWarnings.length} posições com informação incompleta</span>
            <div style={{marginTop:8,maxHeight:80,overflowY:'auto'}}>
              {positionWarnings.slice(0,10).map((w,i) => (
                <div key={i} style={{color:'#C0C2CC',marginBottom:2}}><span style={{color:'#fbbf24',fontFamily:'monospace'}}>{w.id}</span> — {w.loja} — {w.issue}</div>
              ))}
              {positionWarnings.length > 10 && <div style={{color:'#8B8D97'}}>...e mais {positionWarnings.length - 10}</div>}
            </div>
          </div>
        )}

        <div style={S.tabs}>
          {['resumo','vendas','pallets'].map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{...S.tab, ...(tab===t?{background:'#fff',color:'#0F1117'}:{})}}>{t==='resumo'?'Resumo':t==='vendas'?'Vendas / Serviços':'Pallets'}</button>
          ))}
        </div>

        {/* ── Resumo ── */}
        {tab === 'resumo' && (
          <div style={S.card}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Resumo — {selClient} — {month}</h3>
            <p style={{fontSize:12,color:'#8B8D97',marginBottom:16}}>
              WMS + Portal, Armazenagem e Frete são valores manuais deste cliente neste mês
              {canEditManual ? ' — clique no valor para editar.' : '.'}
            </p>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Serviço</th><th style={{...S.th,textAlign:'right'}}>Qtd</th><th style={{...S.th,textAlign:'right'}}>Valor Unit.</th><th style={{...S.th,textAlign:'right'}}>Total</th>
              </tr></thead>
              <tbody>
                <tr>
                  <td style={S.td}>WMS + Portal <span style={{fontSize:10,color:'#8B8D97',fontWeight:600}}>· manual</span></td>
                  <td style={{...S.td,textAlign:'right'}}>1</td>
                  <td style={{...S.td,textAlign:'right',color:'#8B8D97'}}>—</td>
                  <td style={{...S.td,textAlign:'right'}}>
                    <div style={{display:'flex',justifyContent:'flex-end'}}>
                      <ManualValue value={manual.wms_portal} canEdit={canEditManual} saving={savingManual}
                        editing={editingField==='row:wms_portal'}
                        onStart={()=>setEditingField('row:wms_portal')} onCancel={()=>setEditingField(null)}
                        onSave={(v)=>saveManualField('wms_portal', v)} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={S.td}>Armazenagem <span style={{fontSize:10,color:'#8B8D97',fontWeight:600}}>· manual</span></td>
                  <td style={{...S.td,textAlign:'right'}}>{clientPositions} pos.</td>
                  <td style={{...S.td,textAlign:'right',color:'#8B8D97'}}>—</td>
                  <td style={{...S.td,textAlign:'right'}}>
                    <div style={{display:'flex',justifyContent:'flex-end'}}>
                      <ManualValue value={manual.armazenagem} canEdit={canEditManual} saving={savingManual}
                        editing={editingField==='row:armazenagem'}
                        onStart={()=>setEditingField('row:armazenagem')} onCancel={()=>setEditingField(null)}
                        onSave={(v)=>saveManualField('armazenagem', v)} />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={S.td}>Frete <span style={{fontSize:10,color:'#8B8D97',fontWeight:600}}>· manual</span></td>
                  <td style={{...S.td,textAlign:'right'}}>1</td>
                  <td style={{...S.td,textAlign:'right',color:'#8B8D97'}}>—</td>
                  <td style={{...S.td,textAlign:'right'}}>
                    <div style={{display:'flex',justifyContent:'flex-end'}}>
                      <ManualValue value={manual.frete} canEdit={canEditManual} saving={savingManual}
                        editing={editingField==='row:frete'}
                        onStart={()=>setEditingField('row:frete')} onCancel={()=>setEditingField(null)}
                        onSave={(v)=>saveManualField('frete', v)} />
                    </div>
                  </td>
                </tr>
                {Object.keys(totals.salesByChannel).map(ch => {
                  const d = totals.salesByChannel[ch];
                  if (!d || d.count === 0) return null;
                  return <tr key={ch}><td style={S.td}>{SERVICE_CONFIG[ch]?.label || ch}</td><td style={{...S.td,textAlign:'right'}}>{d.units} unid / {d.count} lanç.</td><td style={{...S.td,textAlign:'right'}}>—</td><td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {d.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>;
                })}
                <tr style={{background:'#00C89610'}}><td style={{...S.td,fontWeight:900,fontSize:15}} colSpan={3}>TOTAL</td><td style={{...S.td,textAlign:'right',fontWeight:900,fontSize:18,color:'#00C896'}}>R$ {totals.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
              </tbody>
            </table>
            <h3 style={{fontSize:14,fontWeight:700,marginTop:24,marginBottom:4}}>Posições Ocupadas — Datas de Entrada</h3>
            <p style={{fontSize:11,color:'#8B8D97',marginBottom:12}}>Referência de conferência — não entra no total. O valor cobrado é a Armazenagem manual acima.</p>
            <table style={S.table}><thead><tr>
              <th style={S.th}>Endereço</th><th style={S.th}>Produto</th><th style={S.th}>Qtd</th><th style={S.th}>Data Entrada</th><th style={S.th}>Dias</th><th style={{...S.th,textAlign:'right'}}>Valor Proporcional</th>
            </tr></thead><tbody>
              {Object.entries(wmsData).filter(([id, cell]) => cell.loja && selClient && cell.loja.trim().toUpperCase() === selClient.trim().toUpperCase()).sort(([a],[b]) => a.localeCompare(b)).map(([id, cell]) => {
                const entryDate = cell.dataEntrada ? new Date(cell.dataEntrada) : null;
                const days = entryDate ? Math.max(1, Math.ceil((new Date() - entryDate) / (1000*60*60*24))) : 30;
                const dailyVal = days * PRICES.pallet_day;
                return (
                  <tr key={id}>
                    <td style={{...S.td,fontFamily:'monospace',color:'#00C896',fontWeight:700,fontSize:12}}>{id}</td>
                    <td style={S.td}>{cell.produtos && cell.produtos[0]?.nome ? cell.produtos.map(p=>p.nome).join(', ') : cell.nome || cell.descricao || '-'}</td>
                    <td style={S.td}>{cell.produtos ? cell.produtos.reduce((s,p)=>s+(parseInt(p.qtd)||0),0) : cell.qtd || '-'}</td>
                    <td style={S.td}>{entryDate ? entryDate.toLocaleDateString('pt-BR') : <span style={{color:'#fbbf24',fontSize:11}}>Sem data</span>}</td>
                    <td style={S.td}>{days}d</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {dailyVal.toFixed(2)}</td>
                  </tr>
                );
              })}
              {Object.entries(wmsData).filter(([id, cell]) => cell.loja && selClient && cell.loja.trim().toUpperCase() === selClient.trim().toUpperCase()).length === 0 && (
                <tr><td colSpan={6} style={{...S.td,textAlign:'center',color:'#8B8D97'}}>Nenhuma posição encontrada para este cliente no WMS.</td></tr>
              )}
            </tbody></table>
          </div>
        )}

        {/* ── Vendas ── */}
        {tab === 'vendas' && (
          <div>
            {/* Form */}
            <div style={{...S.card,marginBottom:16}}>
              <h3 style={{fontSize:14,fontWeight:700,color:'#00C896',marginBottom:4}}>
                {editingSale ? 'Editar Lançamento' : 'Registrar Venda / Serviço'}
              </h3>
              <p style={{fontSize:11,color:'#8B8D97',marginBottom:14}}>Um lançamento pode ter vários produtos no mesmo dia/envio. Os dados do envio abaixo valem para todos os itens.</p>

              {/* Dados do envio — aplicam a todos os itens */}
              <div style={{background:'#0a0c12',borderRadius:8,border:'1px solid #1E2028',padding:'12px 16px',marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Dados do envio</div>
                <div className='bill-form' style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
                  <div><label style={S.label}>Data Venda</label><input type="date" value={newSale.dataVenda} onChange={e=>setNewSale(f=>({...f,dataVenda:e.target.value}))} style={{...S.input,width:140}} /></div>
                  <div><label style={S.label}>Nº Venda/Pedido</label><input value={newSale.numero} onChange={e=>setNewSale(f=>({...f,numero:e.target.value}))} style={{...S.input,width:140}} placeholder="MLB-123..." /></div>
                  <div><label style={S.label}>Nº Envio/Frete</label><input value={newSale.numEnvio} onChange={e=>setNewSale(f=>({...f,numEnvio:e.target.value}))} style={{...S.input,width:140}} placeholder="Nº envio..." /></div>
                  <div><label style={S.label}>Paletes <span style={{textTransform:'none',letterSpacing:0}}>(opc.)</span></label><input type="number" value={newSale.paletes} onChange={e=>setNewSale(f=>({...f,paletes:e.target.value}))} style={{...S.input,width:90}} placeholder="—" min="0" /></div>
                  <div><label style={S.label}>Cx. Master <span style={{textTransform:'none',letterSpacing:0}}>(opc.)</span></label><input type="number" value={newSale.caixasMaster} onChange={e=>setNewSale(f=>({...f,caixasMaster:e.target.value}))} style={{...S.input,width:100}} placeholder="—" min="0" /></div>
                  <div style={{flex:1,minWidth:180}}><label style={S.label}>Obs <span style={{textTransform:'none',letterSpacing:0}}>(opc.)</span></label><input value={newSale.obs} onChange={e=>setNewSale(f=>({...f,obs:e.target.value}))} style={{...S.input,width:'100%'}} placeholder="Observação do lançamento" /></div>
                </div>
              </div>

              {/* Itens */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:'#00C896',textTransform:'uppercase',letterSpacing:1}}>
                  Itens do lançamento ({newSale.itens.length})
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#0a0c12',border:'1.5px solid #00C89640',borderRadius:8,padding:'10px 16px'}}>
                  <span style={{fontSize:11,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1}}>Total do lançamento</span>
                  <span style={{fontSize:20,fontWeight:900,color:'#00C896'}}>R$ {liveTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                </div>
              </div>

              {newSale.itens.map((item, i) => {
                const svc = SERVICE_CONFIG[item.canal];
                const itCol = canalColor(item.canal);
                return (
                  <div key={i} style={{background:'#0a0c12',borderRadius:8,border:'1px solid #1E2028',borderLeft:`3px solid ${itCol.c}`,padding:'12px 16px',marginBottom:10,position:'relative'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
                      <span style={{fontSize:11,fontWeight:800,color:itCol.c,textTransform:'uppercase',letterSpacing:1}}>Item {i+1}</span>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:13,fontWeight:800,color:'#fff'}}>{money(itemTotal(item))}</span>
                        {newSale.itens.length > 1 && (
                          <button onClick={()=>removeItem(i)} title="Remover este item"
                            style={{background:'#dc262620',border:'1px solid #dc262640',borderRadius:5,color:'#fca5a5',fontSize:11,cursor:'pointer',padding:'3px 9px',fontFamily:'inherit'}}>✕</button>
                        )}
                      </div>
                    </div>

                    <div className='bill-form' style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end',marginBottom:10}}>
                      <div><label style={S.label}>SKU</label><input value={item.sku} onChange={e=>patchItem(i,{sku:e.target.value})} style={{...S.input,width:120}} placeholder="EX-001" /></div>
                      <div style={{flex:1,minWidth:180}}><label style={S.label}>Produto / Descrição</label><input value={item.nome} onChange={e=>patchItem(i,{nome:e.target.value})} style={{...S.input,width:'100%'}} placeholder="Nome do produto" /></div>
                      <div>
                        <label style={S.label}>Serviço</label>
                        <select value={item.canal} onChange={e=>handleItemService(i, e.target.value)} style={{...S.input,width:230}}>
                          {Object.entries(SERVICE_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                      <div><label style={S.label}>Qtd</label><input type="number" value={item.qtd} onChange={e=>patchItem(i,{qtd:e.target.value})} style={{...S.input,width:70}} min="1" /></div>
                      <div>
                        <label style={S.label}>Valor Unit. (R$)</label>
                        <input type="number" value={item.valorUnit} onChange={e=>patchItem(i,{valorUnit:e.target.value})} style={{...S.input,width:110}} placeholder="auto" step="0.01" />
                      </div>
                      {item.canal === 'Outros' && (
                        <div><label style={S.label}>Descrição serviço</label><input value={item.descCustom} onChange={e=>patchItem(i,{descCustom:e.target.value})} style={{...S.input,width:180}} placeholder="Descreva o serviço" /></div>
                      )}
                    </div>

                    {/* Adicionais do item */}
                    {(svc?.adicionais || []).length > 0 && (
                      <div style={{background:'#0F1117',borderRadius:8,border:'1px solid #1E2028',padding:'10px 12px'}}>
                        <div style={{fontSize:10,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Adicionais deste item</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                          {svc.adicionais.map(key => {
                            const add = item.adds[key];
                            const cfg = ADICIONAL_CONFIG[key];
                            const unitPr = cfg.priceKey ? PRICES[cfg.priceKey] : null;
                            return (
                              <div key={key} style={{display:'flex',alignItems:'center',gap:6,background:add.active?'#00C89610':'#161820',border:`1px solid ${add.active?'#00C89640':'#1E2028'}`,borderRadius:8,padding:'6px 10px',transition:'background .15s,border .15s'}}>
                                <input type="checkbox" id={`add_${i}_${key}`} checked={add.active} onChange={e => patchItemAdd(i, key, {active:e.target.checked})} style={{accentColor:'#00C896',width:15,height:15,cursor:'pointer',flexShrink:0}} />
                                <label htmlFor={`add_${i}_${key}`} style={{fontSize:12,color:add.active?'#fff':'#8B8D97',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                                  {cfg.label}{unitPr != null ? <span style={{color:'#8B8D97',fontWeight:400}}> R${unitPr.toFixed(2)}/u</span> : ''}
                                </label>
                                {add.active && cfg.type === 'qty' && (
                                  <input type="number" value={add.qtd} onChange={e => patchItemAdd(i, key, {qtd:e.target.value})} style={{...S.input,width:55,padding:'4px 8px',fontSize:12}} min="1" />
                                )}
                                {add.active && cfg.type === 'valor+desc' && (
                                  <input value={add.desc||''} onChange={e => patchItemAdd(i, key, {desc:e.target.value})} style={{...S.input,width:130,padding:'4px 8px',fontSize:12}} placeholder="Descrição" />
                                )}
                                {add.active && (cfg.type === 'valor' || cfg.type === 'valor+desc') && (
                                  <input type="number" value={add.valor||''} onChange={e => patchItemAdd(i, key, {valor:e.target.value})} style={{...S.input,width:85,padding:'4px 8px',fontSize:12}} placeholder="R$ 0,00" step="0.01" />
                                )}
                                {add.active && (
                                  <span style={{fontSize:11,fontWeight:700,color:'#00C896',whiteSpace:'nowrap'}}>
                                    {cfg.type==='qty'&&unitPr!=null
                                      ? `= R$ ${((parseInt(add.qtd)||1)*unitPr).toFixed(2)}`
                                      : `= R$ ${(parseFloat(add.valor)||0).toFixed(2)}`}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button onClick={addItem}
                style={{padding:'9px 18px',background:'transparent',border:'1.5px dashed #00C89660',borderRadius:8,color:'#00C896',fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13,marginBottom:14}}>
                + Adicionar produto
              </button>

              {/* Buttons */}
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={addSale} style={{...S.btnMain,background:editingSale?'#fbbf24':'#00C896'}}>{editingSale ? '✓ Salvar Edição' : '+ Registrar'}</button>
                {editingSale && (
                  <button onClick={() => { setEditingSale(null); setNewSale(defaultForm(newSale.itens[0]?.canal || 'Full ML')); }}
                    style={{padding:'10px 16px',background:'transparent',border:'1px solid #1E2028',borderRadius:8,color:'#8B8D97',cursor:'pointer',fontFamily:'inherit',fontSize:12}}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            {/* Sales list */}
            <div style={S.card}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
                <h3 style={{fontSize:14,fontWeight:700}}>
                  {visibleRows.length} {visibleRows.length === 1 ? 'item' : 'itens'}
                  <span style={{color:'#8B8D97',fontWeight:600}}> em {visibleSaleCount} {visibleSaleCount === 1 ? 'lançamento' : 'lançamentos'}</span>
                  {activeFilter !== 'all' && <span style={{color:'#8B8D97',fontWeight:600}}> · {itemRows.length} itens no mês</span>}
                </h3>
                {sales.length > 0 && (
                  <button onClick={()=>setGroupByCanal(g=>!g)}
                    style={{padding:'7px 14px',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
                      background:groupByCanal?'#00C896':'#161820', color:groupByCanal?'#0F1117':'#C0C2CC',
                      border:`1px solid ${groupByCanal?'#00C896':'#1E2028'}`}}>
                    ☰ Agrupar por serviço{groupByCanal ? ' ✓' : ''}
                  </button>
                )}
              </div>

              {canalGroups.length > 1 && (
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
                  <button onClick={()=>setFilterCanal('all')} style={chipStyle(activeFilter==='all')}>Todos ({itemRows.length})</button>
                  {canalGroups.map(g => (
                    <button key={g.key} onClick={()=>setFilterCanal(g.key)} style={chipStyle(activeFilter===g.key, canalColor(g.key))}>
                      {g.label} ({g.count})
                    </button>
                  ))}
                </div>
              )}

              {sales.length === 0 ? <div style={{color:'#8B8D97',padding:20,textAlign:'center'}}>Nenhuma venda registrada neste mês.</div> : (
                <div className="bill-table-wrap" style={{maxHeight:440,overflowY:'auto'}}>
                  <table style={S.table}>
                    {salesHead}
                    <tbody>
                      {!groupByCanal
                        ? visibleRows.map(itemRowView)
                        : visibleGroups.map(g => {
                            const col = canalColor(g.key);
                            return (
                              <Fragment key={g.key}>
                                <tr>
                                  <td colSpan={SALES_COLS} style={{padding:0,borderBottom:'none'}}>
                                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',
                                      padding:'8px 12px',marginTop:10,background:col.bg,borderLeft:`3px solid ${col.c}`,borderRadius:'0 6px 6px 0'}}>
                                      <span style={{fontSize:13,fontWeight:800,color:col.c}}>
                                        {g.label}
                                        <span style={{color:'#8B8D97',fontWeight:600}}> · {g.count} {g.count === 1 ? 'item' : 'itens'}</span>
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                                {g.rows.map(itemRowView)}
                                <tr>
                                  <td colSpan={SALES_COLS - 2} style={{...S.td,textAlign:'right',fontWeight:700,color:'#8B8D97',fontSize:12,borderTop:`1px solid ${col.c}40`}}>
                                    Subtotal {g.label}
                                  </td>
                                  <td style={{...S.td,textAlign:'right',fontWeight:900,color:col.c,borderTop:`1px solid ${col.c}40`}}>{money(g.total)}</td>
                                  <td style={{...S.td,borderTop:`1px solid ${col.c}40`}}></td>
                                </tr>
                              </Fragment>
                            );
                          })}
                    </tbody>
                  </table>
                  {visibleRows.length === 0 && (
                    <div style={{color:'#8B8D97',padding:20,textAlign:'center',fontSize:13}}>Nenhum lançamento deste tipo neste mês.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Pallets ── */}
        {tab === 'pallets' && (
          <div>
            <div style={{...S.card,marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <h3 style={{fontSize:14,fontWeight:700,color:'#00C896'}}>Controle de Pallets — {selClient}</h3>
                  <p style={{fontSize:12,color:'#8B8D97',marginTop:4}}>R$ {PRICES.pallet_day.toFixed(2)}/dia por pallet · referência de conferência — a Armazenagem cobrada é o valor manual do Resumo</p>
                </div>
                <button onClick={addPallet} style={S.btnMain}>+ Entrada de Pallet</button>
              </div>
            </div>
            <div style={S.card}>
              {pallets.length === 0 ? <div style={{color:'#8B8D97',padding:20,textAlign:'center'}}>Nenhum pallet registrado neste mês.</div> : (
                <table style={S.table}><thead><tr>
                  <th style={S.th}>Pallet</th><th style={S.th}>Entrada</th><th style={S.th}>Saída</th><th style={{...S.th,textAlign:'right'}}>Dias</th><th style={{...S.th,textAlign:'right'}}>Valor</th><th style={S.th}>Status</th><th style={S.th}></th>
                </tr></thead><tbody>
                  {pallets.map((p,i) => {
                    const days = palletDays(p);
                    const val = days * PRICES.pallet_day;
                    const active = !p.saida;
                    return (
                      <tr key={p.id}>
                        <td style={{...S.td,fontWeight:700}}>#{i+1}</td>
                        <td style={{...S.td,fontSize:12}}>{new Date(p.entrada).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                        <td style={{...S.td,fontSize:12}}>{p.saida ? new Date(p.saida).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-'}</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:700}}>{days}</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:700,color:'#00C896'}}>R$ {val.toFixed(2)}</td>
                        <td style={S.td}>{active ? <span style={{color:'#00C896',fontWeight:700,fontSize:12}}>● Ativo</span> : <span style={{color:'#8B8D97',fontSize:12}}>Encerrado</span>}</td>
                        <td style={S.td}>
                          <div style={{display:'flex',gap:4}}>
                            {active && <button onClick={()=>closePallet(p.id)} style={{padding:'4px 10px',background:'#1e3a5f',border:'none',borderRadius:4,color:'#93c5fd',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>Encerrar</button>}
                            <button onClick={()=>removePallet(p.id)} style={S.btnDel}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody></table>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && <div style={{position:'fixed',bottom:24,right:24,padding:'14px 24px',background:'#00C896',color:'#2E2C3A',fontWeight:700,borderRadius:10,fontSize:14,zIndex:300}}>{toast}</div>}
    </div>
  );
}

const S = {
  page: {minHeight:'100vh',background:'#08090D',fontFamily:'Outfit, sans-serif',color:'#fff'},
  loadPage: {minHeight:'100vh',background:'#08090D',display:'flex',alignItems:'center',justifyContent:'center'},
  header: {background:'#0a0c12ee',backdropFilter:'blur(16px)',borderBottom:'1px solid #1E2028',padding:'14px 28px',display:'flex',alignItems:'center',justifyContent:'space-between'},
  logoText: {fontSize:17,fontWeight:800,color:'#fff'},
  navBtn: {padding:'6px 14px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#C0C2CC',fontSize:12,fontWeight:600,textDecoration:'none'},
  main: {maxWidth:1200,margin:'0 auto',padding:24},
  controls: {display:'flex',gap:20,alignItems:'flex-end',marginBottom:24,flexWrap:'wrap'},
  label: {display:'block',fontSize:11,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:4},
  input: {padding:'10px 14px',background:'#161820',border:'1.5px solid #1E2028',borderRadius:8,color:'#fff',fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'},
  select: {padding:'10px 14px',background:'#161820',border:'1.5px solid #1E2028',borderRadius:8,color:'#fff',fontSize:14,fontFamily:'inherit',outline:'none',minWidth:160},
  kpiRow: {display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'},
  kpi: {flex:1,minWidth:180,background:'#0F1117',border:'1px solid #1E2028',borderRadius:12,padding:'16px 20px'},
  kpiL: {fontSize:11,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1},
  kpiV: {fontSize:22,fontWeight:900,marginTop:4},
  tabs: {display:'flex',gap:4,marginBottom:16,background:'#0F1117',padding:4,borderRadius:8,border:'1px solid #1E2028'},
  tab: {padding:'8px 20px',fontFamily:'inherit',fontSize:13,fontWeight:600,border:'none',borderRadius:6,cursor:'pointer',background:'transparent',color:'#8B8D97',transition:'.15s'},
  card: {background:'#0F1117',border:'1px solid #1E2028',borderRadius:12,padding:'20px 24px'},
  table: {width:'100%',borderCollapse:'collapse',fontSize:13},
  th: {textAlign:'left',padding:'10px 12px',borderBottom:'1px solid #1E2028',fontSize:11,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:.5},
  td: {padding:'10px 12px',borderBottom:'1px solid #1E202880'},
  btnMain: {padding:'10px 20px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13},
  btnDel: {padding:'4px 8px',background:'#dc262610',border:'1px solid #dc262630',borderRadius:4,color:'#fca5a5',fontSize:11,cursor:'pointer',fontFamily:'inherit'},
};
