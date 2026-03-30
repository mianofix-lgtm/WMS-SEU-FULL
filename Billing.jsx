import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { db, getWmsData } from './firebase.js';
import { LOGO_ICON } from './logo.js';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

// Pricing
const PRICES = {
  pallet_day: 350 / 30, // ~R$11.67/dia
  pallet_month: 350,
  wms: 2000,
  min_pallets: 2,
  flex: 16,
  correios_places: 3.00,
  full_unit: 1.20,
  etiq_full: 0.30,
  etiq_receb: 0.20,
  receb_caixa: 1.50,
  kit_small: 0.50,
  kit_medium: 1.50,
  kit_large: 4.00,
  devolucao: 2.00,
};

const CHANNELS = ['Full ML','Flex','Correios','Places','Kit'];

export default function Billing() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [selClient, setSelClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [pallets, setPallets] = useState([]);
  const [newSale, setNewSale] = useState({numero:'',produto:'',canal:'Full ML',qtd:'1',kitTier:'small'});
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [toast, setToast] = useState('');
  const [wmsData, setWmsData] = useState({});
  const [tab, setTab] = useState('resumo');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Load clients from users collection
      const snap = await getDocs(collection(db, 'users'));
      const allUsers = [];
      snap.forEach(d => allUsers.push({uid:d.id,...d.data()}));
      // All unique lojas from WMS + clients
      const wms = await getWmsData();
      setWmsData(wms);
      // Deduplicate lojas - normalize to title case
      const lojaMap = {};
      const addLoja = (name) => {
        if (!name) return;
        const key = name.trim().toUpperCase();
        if (!lojaMap[key]) lojaMap[key] = name.trim();
      };
      Object.values(wms).forEach(c => addLoja(c.loja));
      allUsers.filter(u => u.role === 'cliente' && u.loja).forEach(u => addLoja(u.loja));
      ['Iscali','Mianofix','Gama','PocianaX'].forEach(l => addLoja(l));
      const uniqueLojas = Object.values(lojaMap).sort();
      setClients(uniqueLojas);
      if (uniqueLojas.length > 0 && !selClient) setSelClient(uniqueLojas[0]);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  // Load sales and pallets for selected client + month
  useEffect(() => {
    if (selClient && month) loadClientData();
  }, [selClient, month]);

  async function loadClientData() {
    try {
      const key = `billing_${selClient}_${month}`.replace(/\s/g,'_');
      const d = await getDoc(doc(db, 'billing', key));
      if (d.exists()) {
        const data = d.data();
        setSales(data.sales ? JSON.parse(data.sales) : []);
        setPallets(data.pallets ? JSON.parse(data.pallets) : []);
      } else {
        setSales([]);
        setPallets([]);
      }
    } catch(e) { console.error(e); setSales([]); setPallets([]); }
  }

  async function saveClientData(newSales, newPallets) {
    const key = `billing_${selClient}_${month}`.replace(/\s/g,'_');
    await setDoc(doc(db, 'billing', key), {
      client: selClient,
      month,
      sales: JSON.stringify(newSales || sales),
      pallets: JSON.stringify(newPallets || pallets),
      updatedAt: new Date().toISOString(),
    });
  }

  function showToast(m) { setToast(m); setTimeout(()=>setToast(''),3000); }

  // ─── Sales ───
  async function addSale() {
    if (!newSale.numero || !newSale.produto) { showToast('Preencha número e produto'); return; }
    const sale = {
      id: Date.now().toString(36),
      numero: newSale.numero,
      produto: newSale.produto,
      canal: newSale.canal,
      qtd: parseInt(newSale.qtd) || 1,
      kitTier: newSale.canal === 'Kit' ? newSale.kitTier : null,
      data: new Date().toISOString(),
      valor: calcSaleValue(newSale),
    };
    const next = [sale, ...sales];
    setSales(next);
    await saveClientData(next, pallets);
    setNewSale({numero:'',produto:'',canal:newSale.canal,qtd:'1',kitTier:'small'});
    showToast('Venda registrada!');
  }

  function calcSaleValue(s) {
    const q = parseInt(s.qtd) || 1;
    if (s.canal === 'Full ML') return q * PRICES.full_unit;
    if (s.canal === 'Flex') return PRICES.flex;
    if (s.canal === 'Correios' || s.canal === 'Places') return PRICES.correios_places;
    if (s.canal === 'Kit') {
      const tier = s.kitTier === 'large' ? PRICES.kit_large : s.kitTier === 'medium' ? PRICES.kit_medium : PRICES.kit_small;
      return q * tier;
    }
    return 0;
  }

  async function removeSale(id) {
    const next = sales.filter(s => s.id !== id);
    setSales(next);
    await saveClientData(next, pallets);
    showToast('Venda removida');
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

  function palletDays(p) {
    const start = new Date(p.entrada);
    const end = p.saida ? new Date(p.saida) : new Date();
    return Math.max(1, Math.ceil((end - start) / (1000*60*60*24)));
  }

  // ─── WMS positions for this client ───
  const clientPositions = useMemo(() => {
    let count = 0;
    Object.values(wmsData).forEach(c => {
      if (c.loja && selClient && c.loja.trim().toUpperCase() === selClient.trim().toUpperCase()) count++;
    });
    return count;
  }, [wmsData, selClient]);

  // ─── Totals ───
  const totals = useMemo(() => {
    const salesByChannel = {};
    CHANNELS.forEach(ch => { salesByChannel[ch] = { count: 0, units: 0, valor: 0 }; });
    sales.forEach(s => {
      if (salesByChannel[s.canal]) {
        salesByChannel[s.canal].count++;
        salesByChannel[s.canal].units += s.qtd || 1;
        salesByChannel[s.canal].valor += s.valor || 0;
      }
    });

    // Count WMS positions for this client (auto-detected)
    const wmsPositions = clientPositions;
    
    // Manual pallets with daily tracking
    const manualPalletCost = pallets.reduce((sum, p) => sum + palletDays(p) * PRICES.pallet_day, 0);
    
    // WMS-based: positions * monthly rate
    const wmsPalletCost = wmsPositions * PRICES.pallet_month;
    
    // Use the higher of manual tracking or WMS count
    const palletCost = Math.max(manualPalletCost, wmsPalletCost);
    
    // Minimum: 2 pallets (R$ 700). If usage > minimum, charge usage
    const minPalletCost = PRICES.min_pallets * PRICES.pallet_month;
    const finalPalletCost = Math.max(palletCost, minPalletCost);

    const salesTotal = sales.reduce((sum, s) => sum + (s.valor || 0), 0);
    const wms = PRICES.wms;
    const total = finalPalletCost + salesTotal + wms;

    return { salesByChannel, palletCost, minPalletCost, finalPalletCost, salesTotal, wms, total, activePallets: pallets.filter(p => !p.saida).length };
  }, [sales, pallets]);

  if (loading) return <div style={S.loadPage}><div style={{color:'#00C896',fontSize:16}}>Carregando...</div></div>;

  return (
    <div style={S.page}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}`}</style>

      {/* Header */}
      <header style={S.header}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <Link to="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <img src={LOGO_ICON} alt="Seu Full" style={{width:32,height:32,borderRadius:8}} />
            <div style={S.logoText}>Faturamento <span style={{color:'#00C896'}}>Seu Full</span></div>
          </Link>
        </div>
        <div style={{display:'flex',gap:12}}>
          <Link to="/wms" style={S.navBtn}>WMS</Link>
          <Link to="/admin" style={{...S.navBtn,color:'#fbbf24'}}>Admin</Link>
          <Link to="/portal" style={S.navBtn}>Portal</Link>
        </div>
      </header>

      <div style={S.main}>
        {/* Client selector + month */}
        <div style={S.controls}>
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

        {/* KPIs */}
        <div style={S.kpiRow}>
          <div style={S.kpi}>
            <div style={S.kpiL}>Pallets (proporcional)</div>
            <div style={S.kpiV}>R$ {totals.finalPalletCost.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
            <div style={{fontSize:10,color:'#8B8D97',marginTop:4}}>{clientPositions} posições WMS · Mín R$ {totals.minPalletCost.toLocaleString('pt-BR',{minimumFractionDigits:0})}</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiL}>Vendas / Serviços</div>
            <div style={S.kpiV}>R$ {totals.salesTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
            <div style={{fontSize:10,color:'#8B8D97',marginTop:4}}>{sales.length} lançamentos</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiL}>WMS Fixo</div>
            <div style={S.kpiV}>R$ {totals.wms.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          </div>
          <div style={{...S.kpi,background:'#00C89610',borderColor:'#00C89640'}}>
            <div style={S.kpiL}>TOTAL MÊS</div>
            <div style={{fontSize:28,fontWeight:900,color:'#00C896',marginTop:4}}>R$ {totals.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {['resumo','vendas','pallets'].map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{...S.tab, ...(tab===t?{background:'#fff',color:'#0F1117'}:{})}}>{t === 'resumo' ? 'Resumo' : t === 'vendas' ? 'Vendas / Serviços' : 'Pallets'}</button>
          ))}
        </div>

        {/* Resumo */}
        {tab === 'resumo' && (
          <div style={S.card}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:16}}>Resumo — {selClient} — {month}</h3>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Serviço</th><th style={{...S.th,textAlign:'right'}}>Qtd</th><th style={{...S.th,textAlign:'right'}}>Valor Unit.</th><th style={{...S.th,textAlign:'right'}}>Total</th>
              </tr></thead>
              <tbody>
                <tr><td style={S.td}>WMS + Portal</td><td style={{...S.td,textAlign:'right'}}>1</td><td style={{...S.td,textAlign:'right'}}>R$ 2.000,00</td><td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {totals.wms.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
                <tr><td style={S.td}>Armazenagem ({clientPositions} posições no WMS{totals.finalPalletCost <= totals.minPalletCost ? ' — mínimo aplicado' : ''})</td><td style={{...S.td,textAlign:'right'}}>{clientPositions} posições</td><td style={{...S.td,textAlign:'right'}}>R$ {PRICES.pallet_month.toFixed(2)}/mês</td><td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {totals.finalPalletCost.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
                {CHANNELS.map(ch => {
                  const d = totals.salesByChannel[ch];
                  if (!d || d.count === 0) return null;
                  return <tr key={ch}><td style={S.td}>{ch}</td><td style={{...S.td,textAlign:'right'}}>{d.units} unid / {d.count} lanç.</td><td style={{...S.td,textAlign:'right'}}>-</td><td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {d.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>;
                })}
                <tr style={{background:'#00C89610'}}><td style={{...S.td,fontWeight:900,fontSize:15}} colSpan={3}>TOTAL</td><td style={{...S.td,textAlign:'right',fontWeight:900,fontSize:18,color:'#00C896'}}>R$ {totals.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Vendas */}
        {tab === 'vendas' && (
          <div>
            {/* Add sale form */}
            <div style={{...S.card,marginBottom:16}}>
              <h3 style={{fontSize:14,fontWeight:700,color:'#00C896',marginBottom:12}}>Registrar Venda / Serviço</h3>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
                <div><label style={S.label}>Nº Venda</label><input value={newSale.numero} onChange={e=>setNewSale(f=>({...f,numero:e.target.value}))} style={{...S.input,width:130}} placeholder="MLB-123..." /></div>
                <div><label style={S.label}>Produto</label><input value={newSale.produto} onChange={e=>setNewSale(f=>({...f,produto:e.target.value}))} style={{...S.input,width:200}} placeholder="Nome do produto" /></div>
                <div><label style={S.label}>Canal</label><select value={newSale.canal} onChange={e=>setNewSale(f=>({...f,canal:e.target.value}))} style={{...S.input,width:120}}>{CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={S.label}>Qtd</label><input type="number" value={newSale.qtd} onChange={e=>setNewSale(f=>({...f,qtd:e.target.value}))} style={{...S.input,width:70}} min="1" /></div>
                {newSale.canal === 'Kit' && <div><label style={S.label}>Tier Kit</label><select value={newSale.kitTier} onChange={e=>setNewSale(f=>({...f,kitTier:e.target.value}))} style={{...S.input,width:140}}>
                  <option value="small">Pequeno (R$0,50/u)</option>
                  <option value="medium">Médio (R$1,50/u)</option>
                  <option value="large">Grande (R$4,00/u)</option>
                </select></div>}
                <button onClick={addSale} style={S.btnMain}>+ Registrar</button>
              </div>
            </div>

            {/* Sales list */}
            <div style={S.card}>
              <h3 style={{fontSize:14,fontWeight:700,marginBottom:12}}>{sales.length} lançamentos</h3>
              {sales.length === 0 ? <div style={{color:'#8B8D97',padding:20,textAlign:'center'}}>Nenhuma venda registrada neste mês.</div> : (
                <div style={{maxHeight:400,overflowY:'auto'}}>
                  <table style={S.table}><thead><tr>
                    <th style={S.th}>Data</th><th style={S.th}>Nº Venda</th><th style={S.th}>Produto</th><th style={S.th}>Canal</th><th style={{...S.th,textAlign:'right'}}>Qtd</th><th style={{...S.th,textAlign:'right'}}>Valor</th><th style={S.th}></th>
                  </tr></thead><tbody>
                    {sales.map(s => (
                      <tr key={s.id}>
                        <td style={{...S.td,fontSize:12,color:'#8B8D97'}}>{new Date(s.data).toLocaleDateString('pt-BR')}</td>
                        <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{s.numero}</td>
                        <td style={S.td}>{s.produto}</td>
                        <td style={S.td}><span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,background: s.canal==='Full ML'?'#00C89620':s.canal==='Flex'?'#3b82f620':s.canal==='Kit'?'#7c3aed20':'#f9731620',color:s.canal==='Full ML'?'#00C896':s.canal==='Flex'?'#3b82f6':s.canal==='Kit'?'#7c3aed':'#f97316'}}>{s.canal}</span></td>
                        <td style={{...S.td,textAlign:'right'}}>{s.qtd}</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {(s.valor||0).toFixed(2)}</td>
                        <td style={S.td}><button onClick={()=>removeSale(s.id)} style={S.btnDel}>✕</button></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pallets */}
        {tab === 'pallets' && (
          <div>
            <div style={{...S.card,marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <h3 style={{fontSize:14,fontWeight:700,color:'#00C896'}}>Controle de Pallets — {selClient}</h3>
                  <p style={{fontSize:12,color:'#8B8D97',marginTop:4}}>R$ {PRICES.pallet_day.toFixed(2)}/dia por pallet · Mín. {PRICES.min_pallets} pallets (R$ {(PRICES.min_pallets * PRICES.pallet_month).toLocaleString('pt-BR')})</p>
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
  logoIcon: {width:32,height:32,background:'#00C896',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:16,color:'#2E2C3A'},
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
