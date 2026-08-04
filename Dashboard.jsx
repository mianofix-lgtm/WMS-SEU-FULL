import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { LOGO_ICON } from './logo.js';
import { db, getWmsData, getPricing, getMonthCosts, saveMonthCosts, copyCostsFromPreviousMonth, sumCostItems, resolveCostItemValue, parseNumberBR, checkPerm } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const newId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 5);

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [billingDocs, setBillingDocs] = useState([]);
  const [wmsData, setWmsData] = useState({});
  const [pricing, setPricing] = useState({});
  const [coletaHistory, setColetaHistory] = useState([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });

  // Operating costs — per competência (month), loaded from custos_operacionais/{YYYY-MM}
  const [costItems, setCostItems] = useState([]);
  const [costsFechado, setCostsFechado] = useState(false);
  const [costDocExists, setCostDocExists] = useState(false);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ nome: '', tipo: 'fixo', valor: '' });
  const [newCostDraft, setNewCostDraft] = useState({ nome: '', tipo: 'fixo', valor: '' });

  const [insumos, setInsumos] = useState([]);

  const canEditCosts = checkPerm(user, 'dashboard.editar_custos');
  const isAdmin = user?.role === 'diretor';

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadInsumos(); loadMonthCosts(); }, [month]);

  async function loadAll() {
    setLoading(true);
    try {
      const [wms, pr, snap, coletaDoc] = await Promise.all([
        getWmsData(),
        getPricing(),
        getDocs(collection(db, 'billing')),
        getDoc(doc(db, 'wms', 'coletas')).catch(()=>null),
      ]);
      setWmsData(wms || {});
      setPricing(pr);
      if (coletaDoc?.exists?.() && coletaDoc.data().history) setColetaHistory(JSON.parse(coletaDoc.data().history));
      const docs = [];
      snap.forEach(d => docs.push({id: d.id, ...d.data()}));
      setBillingDocs(docs);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function loadInsumos() {
    try {
      const d = await getDoc(doc(db, 'insumos', month));
      if (d.exists() && d.data().items) setInsumos(JSON.parse(d.data().items));
      else setInsumos([]);
    } catch(e) { setInsumos([]); }
  }

  async function loadMonthCosts() {
    setLoadingCosts(true);
    setEditingId(null);
    try {
      const res = await getMonthCosts(month);
      setCostItems(res.itens);
      setCostsFechado(res.fechado);
      setCostDocExists(res.exists);
    } catch(e) {
      console.error(e);
      setCostItems([]); setCostsFechado(false); setCostDocExists(false);
    }
    setLoadingCosts(false);
  }

  // Persist the current month's items. Never touches any other month.
  async function persistItems(nextItems, fechadoVal = costsFechado) {
    setCostItems(nextItems);
    setCostDocExists(true);
    try { await saveMonthCosts(month, nextItems, fechadoVal); }
    catch(e) { console.error(e); }
  }

  function startEdit(item) {
    if (costsFechado || !canEditCosts) return;
    setEditingId(item.id);
    setEditDraft({ nome: item.nome, tipo: item.tipo || 'fixo', valor: String(item.valor ?? '') });
  }
  function commitEdit() {
    const next = costItems.map(it => it.id === editingId
      ? { ...it, nome: editDraft.nome.trim() || it.nome, tipo: editDraft.tipo, valor: parseNumberBR(editDraft.valor) }
      : it);
    setEditingId(null);
    persistItems(next);
  }
  function deleteItem(id) {
    setEditingId(null);
    persistItems(costItems.filter(it => it.id !== id));
  }
  function addItem() {
    const nome = newCostDraft.nome.trim();
    if (!nome) return;
    const item = { id: newId(), nome, tipo: newCostDraft.tipo, valor: parseNumberBR(newCostDraft.valor) };
    setNewCostDraft({ nome: '', tipo: 'fixo', valor: '' });
    persistItems([...costItems, item]);
  }
  async function handleCopyPrev() {
    setLoadingCosts(true);
    try {
      const itens = await copyCostsFromPreviousMonth(month);
      setCostItems(itens);
      setCostDocExists(true);
      setCostsFechado(false);
      await saveMonthCosts(month, itens, false);
    } catch(e) { console.error(e); }
    setLoadingCosts(false);
  }
  async function toggleFechado() {
    const next = !costsFechado;
    if (next && !canEditCosts) return;
    if (!next && !isAdmin) return; // only admin reopens a closed month
    setCostsFechado(next);
    try { await saveMonthCosts(month, costItems, next); } catch(e) { console.error(e); }
  }

  async function saveInsumos(items) {
    try {
      await setDoc(doc(db, 'insumos', month), { items: JSON.stringify(items), month, updatedAt: new Date().toISOString() });
    } catch(e) { console.error(e); }
  }

  function addInsumo() {
    if (!newInsumo.nome) return;
    const next = [...insumos, {id: Date.now().toString(36), ...newInsumo, precoUnit: parseFloat(newInsumo.precoUnit)||0, usado: parseFloat(newInsumo.usado)||0}];
    setInsumos(next);
    saveInsumos(next);
    setNewInsumo({nome:'',unidade:'un',precoUnit:'',usado:'',periodo:month});
  }

  function updateInsumo(id, field, value) {
    const next = insumos.map(i => i.id === id ? {...i, [field]: value} : i);
    setInsumos(next);
    saveInsumos(next);
  }

  function removeInsumo(id) {
    const next = insumos.filter(i => i.id !== id);
    setInsumos(next);
    saveInsumos(next);
  }

  // Parse billing docs into structured data
  const billingByMonth = useMemo(() => {
    const byMonth = {};
    billingDocs.forEach(d => {
      if (!d.month || !d.client) return;
      if (!byMonth[d.month]) byMonth[d.month] = { clients: {}, totalSales: 0, totalSalesCount: 0 };
      const sales = d.sales ? JSON.parse(d.sales) : [];
      const salesTotal = sales.reduce((s,v) => s + (v.valor||0), 0);
      byMonth[d.month].clients[d.client] = { sales, salesTotal, salesCount: sales.length };
      byMonth[d.month].totalSales += salesTotal;
      byMonth[d.month].totalSalesCount += sales.length;
    });
    return byMonth;
  }, [billingDocs]);

  // Current month data
  const currentMonth = useMemo(() => {
    const data = billingByMonth[month] || { clients: {}, totalSales: 0, totalSalesCount: 0 };
    
    // Count positions per client from WMS
    const positionsByClient = {};
    let totalPositions = 0;
    Object.values(wmsData).forEach(c => {
      if (c.loja) {
        const key = c.loja.trim();
        if (!positionsByClient[key]) positionsByClient[key] = 0;
        positionsByClient[key]++;
        totalPositions++;
      }
    });

    // Calculate revenue
    const palletPrice = pricing.pallet_month || 350;
    const wmsPrice = pricing.wms || 2000;
    const minMonthly = pricing.min_monthly || 1500;
    
    const clientBreakdown = {};
    const allClients = new Set([...Object.keys(data.clients), ...Object.keys(positionsByClient)]);
    
    allClients.forEach(client => {
      const positions = positionsByClient[client] || 0;
      const palletRevenue = Math.max(positions * palletPrice, minMonthly);
      const salesData = data.clients[client] || { salesTotal: 0, salesCount: 0 };
      const wmsRevenue = wmsPrice;
      const total = palletRevenue + salesData.salesTotal + wmsRevenue;
      
      clientBreakdown[client] = {
        positions,
        palletRevenue,
        wmsRevenue,
        salesRevenue: salesData.salesTotal,
        salesCount: salesData.salesCount,
        total,
      };
    });

    const totalClients = Object.keys(clientBreakdown).length;
    const totalPalletRevenue = Object.values(clientBreakdown).reduce((s,c) => s + c.palletRevenue, 0);
    const totalWmsRevenue = totalClients * wmsPrice;
    const totalSalesRevenue = data.totalSales;
    const totalRevenue = totalPalletRevenue + totalWmsRevenue + totalSalesRevenue;

    return {
      clients: clientBreakdown,
      totalClients,
      totalPositions,
      totalPalletRevenue,
      totalWmsRevenue,
      totalSalesRevenue,
      totalRevenue,
      salesCount: data.totalSalesCount,
    };
  }, [billingByMonth, month, wmsData, pricing]);

  // ─── Costs / result / margin derive from the SELECTED month's items ───
  // Percentual items resolve against the month's total revenue, so any
  // revenue change cascades to total cost, result and margin in real time.
  const totalRevenue = currentMonth.totalRevenue;
  const insumosTotal = useMemo(
    () => insumos.reduce((s,i) => s + ((parseFloat(i.precoUnit)||0) * (parseFloat(i.usado)||0)), 0),
    [insumos]
  );
  const costItemsTotal = useMemo(() => sumCostItems(costItems, totalRevenue), [costItems, totalRevenue]);
  const totalCosts = costItemsTotal + insumosTotal;
  const profit = totalRevenue - totalCosts;
  const margin = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0;

  // Monthly trend (last 6 months)
  const trend = useMemo(() => {
    const months = [];
    const d = new Date(month + '-15');
    for (let i = 5; i >= 0; i--) {
      const md = new Date(d);
      md.setMonth(md.getMonth() - i);
      const key = `${md.getFullYear()}-${String(md.getMonth()+1).padStart(2,'0')}`;
      const data = billingByMonth[key];
      months.push({
        month: key,
        label: md.toLocaleDateString('pt-BR', {month:'short'}).replace('.',''),
        sales: data?.totalSales || 0,
        count: data?.totalSalesCount || 0,
      });
    }
    return months;
  }, [billingByMonth, month]);

  // Coleta stats for current month
  const coletaStats = useMemo(() => {
    const mStart = month + '-01', mEnd = month + '-31';
    let totalItems = 0, totalColetas = 0;
    coletaHistory.forEach(h => {
      const d = h.date?.substring(0,10);
      if (d >= mStart && d <= mEnd) {
        totalColetas++;
        totalItems += (h.items||[]).reduce((s,it) => s + (parseInt(it.qtd)||0), 0);
      }
    });
    return { totalItems, totalColetas };
  }, [coletaHistory, month]);

  if (loading) return <div style={{minHeight:'100vh',background:'#08090D',display:'flex',alignItems:'center',justifyContent:'center',color:'#00C896',fontFamily:'Outfit',fontSize:16}}>Carregando dashboard...</div>;

  const maxSales = Math.max(...trend.map(t=>t.sales), 1);

  return (
    <div style={{minHeight:'100vh',background:'#08090D',fontFamily:'Outfit, sans-serif',color:'#fff'}}>
      <style>{`.db-bar{transition:height .5s ease;}`}</style>
      
      {/* Header */}
      <header style={{background:'#0a0c12ee',backdropFilter:'blur(16px)',borderBottom:'1px solid #1E2028',padding:'14px 28px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <Link to="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <img src={LOGO_ICON} alt="Seu Full" style={{width:32,height:32,borderRadius:8}} />
            <div style={{fontSize:17,fontWeight:800,color:'#fff'}}>Dashboard <span style={{color:'#00C896'}}>Financeiro</span></div>
          </Link>
        </div>
        <div style={{display:'flex',gap:12}}>
          <Link to="/billing" style={S.nav}>Faturamento</Link>
          <Link to="/wms" style={S.nav}>WMS</Link>
          <Link to="/admin" style={{...S.nav,color:'#fbbf24'}}>Admin</Link>
        </div>
      </header>

      <div style={{maxWidth:1280,margin:'0 auto',padding:24}}>
        {/* Month selector */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <h1 style={{fontSize:24,fontWeight:800}}>P&L — Seu Full Particular</h1>
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={S.input} />
        </div>

        {/* Big KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          <div style={{...S.kpi,borderColor:'#00C89640'}}>
            <div style={S.kpiL}>Receita</div>
            <div style={{fontSize:28,fontWeight:900,color:'#00C896',marginTop:4}}>R$ {currentMonth.totalRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</div>
          </div>
          <div style={{...S.kpi,borderColor:'#dc262640'}}>
            <div style={S.kpiL}>Custos</div>
            <div style={{fontSize:28,fontWeight:900,color:'#dc2626',marginTop:4}}>{fmtBRL(totalCosts)}</div>
          </div>
          <div style={{...S.kpi,borderColor:profit>=0?'#00C89640':'#dc262640'}}>
            <div style={S.kpiL}>Resultado</div>
            <div style={{fontSize:28,fontWeight:900,color:profit>=0?'#00C896':'#dc2626',marginTop:4}}>{fmtBRL(profit)}</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiL}>Margem</div>
            <div style={{fontSize:28,fontWeight:900,color:margin>=20?'#00C896':margin>=0?'#fbbf24':'#dc2626',marginTop:4}}>{margin.toFixed(1)}%</div>
          </div>
        </div>

        {/* Secondary KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:24}}>
          {[
            ['Clientes', currentMonth.totalClients, '#fff'],
            ['Posições', currentMonth.totalPositions, '#00C896'],
            ['Lançamentos', currentMonth.salesCount, '#3b82f6'],
            ['Coletas', coletaStats.totalColetas, '#f97316'],
            ['Itens Coletados', coletaStats.totalItems.toLocaleString('pt-BR'), '#7c3aed'],
          ].map(([l,v,color]) => (
            <div key={l} style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:10,padding:'12px 16px'}}>
              <div style={{fontSize:10,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1}}>{l}</div>
              <div style={{fontSize:22,fontWeight:900,color,marginTop:2}}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20,marginBottom:24}}>
          {/* Revenue breakdown */}
          <div style={S.card}>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:16}}>Composição da Receita</h3>
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              {[
                ['Armazenagem', currentMonth.totalPalletRevenue, '#00C896'],
                ['WMS', currentMonth.totalWmsRevenue, '#3b82f6'],
                ['Serviços', currentMonth.totalSalesRevenue, '#f97316'],
              ].map(([l,v,color]) => {
                const pct = currentMonth.totalRevenue > 0 ? (v/currentMonth.totalRevenue*100) : 0;
                return (
                  <div key={l} style={{flex:1,background:'#161820',borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1}}>{l}</div>
                    <div style={{fontSize:20,fontWeight:900,color,marginTop:4}}>R$ {v.toLocaleString('pt-BR',{minimumFractionDigits:0})}</div>
                    <div style={{marginTop:6,height:4,background:'#1E2028',borderRadius:2}}><div style={{height:4,borderRadius:2,background:color,width:`${pct}%`,transition:'width .5s'}}></div></div>
                    <div style={{fontSize:11,color:'#8B8D97',marginTop:4}}>{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>

            {/* Revenue bar chart */}
            <h3 style={{fontSize:13,fontWeight:700,color:'#8B8D97',marginBottom:12}}>Serviços — Últimos 6 meses</h3>
            <div style={{display:'flex',alignItems:'flex-end',gap:8,height:120}}>
              {trend.map(t => (
                <div key={t.month} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#00C896',marginBottom:4}}>R$ {(t.sales/1000).toFixed(0)}k</div>
                  <div className="db-bar" style={{width:'100%',background:t.month===month?'#00C896':'#1e3a5f',borderRadius:'4px 4px 0 0',height:`${Math.max(4,t.sales/maxSales*100)}px`}}></div>
                  <div style={{fontSize:10,color:'#8B8D97',marginTop:4,fontWeight:600}}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Costs breakdown — per competência, inline-editable */}
          <div style={S.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <h3 style={{fontSize:15,fontWeight:700}}>Custos Operacionais</h3>
              {costsFechado
                ? (<span style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:'#fbbf24',background:'#fbbf2418',border:'1px solid #fbbf2440',borderRadius:4,padding:'3px 8px'}}>🔒 Mês fechado</span>
                    {isAdmin && <button onClick={toggleFechado} style={{padding:'4px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#8B8D97',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Reabrir</button>}
                   </span>)
                : (canEditCosts && costDocExists && <button onClick={toggleFechado} style={{padding:'4px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#8B8D97',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Fechar mês</button>)}
            </div>
            <p style={{fontSize:11,color:'#8B8D97',marginBottom:12}}>{new Date(month+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</p>

            {loadingCosts ? (
              <div style={{padding:'20px 0',textAlign:'center',color:'#8B8D97',fontSize:13}}>Carregando custos...</div>
            ) : (!costDocExists && costItems.length === 0) ? (
              <div style={{padding:'16px 0',textAlign:'center'}}>
                <div style={{fontSize:13,color:'#8B8D97',marginBottom:12}}>Nenhum custo cadastrado para este mês.</div>
                {canEditCosts && (
                  <button onClick={handleCopyPrev} style={{padding:'8px 16px',background:'#1e3a5f',border:'1px solid #3b82f640',borderRadius:6,color:'#93c5fd',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>📋 Copiar custos do mês anterior</button>
                )}
              </div>
            ) : (
              <>
                {costItems.map(item => {
                  const isPct = item.tipo === 'percentual';
                  const resolved = resolveCostItemValue(item, totalRevenue);
                  const color = isPct ? '#f97316' : '#dc2626';
                  if (editingId === item.id) {
                    return (
                      <div key={item.id} style={{display:'flex',gap:6,alignItems:'center',padding:'6px 0',borderBottom:'1px solid #1E2028'}}>
                        <input autoFocus value={editDraft.nome} onChange={e=>setEditDraft(d=>({...d,nome:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditingId(null);}} style={{flex:1,minWidth:0,padding:'4px 8px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#fff',fontSize:12,fontFamily:'inherit',outline:'none'}} />
                        <select value={editDraft.tipo} onChange={e=>setEditDraft(d=>({...d,tipo:e.target.value}))} style={{padding:'4px 4px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#C0C2CC',fontSize:11,fontFamily:'inherit',outline:'none'}}>
                          <option value="fixo">R$</option>
                          <option value="percentual">%</option>
                        </select>
                        <input value={editDraft.valor} onChange={e=>setEditDraft(d=>({...d,valor:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')setEditingId(null);}} placeholder={editDraft.tipo==='percentual'?'%':'R$'} style={{width:76,padding:'4px 8px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:color,fontSize:13,fontWeight:700,textAlign:'right',fontFamily:'inherit',outline:'none'}} />
                        <button title="Salvar" onClick={commitEdit} style={{background:'none',border:'none',color:'#00C896',cursor:'pointer',fontSize:15}}>✓</button>
                        <button title="Cancelar" onClick={()=>setEditingId(null)} style={{background:'none',border:'none',color:'#8B8D97',cursor:'pointer',fontSize:14}}>✕</button>
                        <button title="Excluir" onClick={()=>deleteItem(item.id)} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14}}>🗑</button>
                      </div>
                    );
                  }
                  return (
                    <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #1E2028'}}>
                      <span style={{fontSize:13,color:'#C0C2CC'}}>{item.nome}</span>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span
                          onClick={()=>startEdit(item)}
                          style={{fontSize:14,fontWeight:700,color,cursor:(canEditCosts&&!costsFechado)?'pointer':'default'}}
                          title={isPct?`${parseNumberBR(item.valor).toLocaleString('pt-BR')}% da receita`:''}
                        >
                          {isPct
                            ? `${parseNumberBR(item.valor).toLocaleString('pt-BR')}% (${fmtBRL(resolved)})`
                            : fmtBRL(resolved)}
                        </span>
                        {canEditCosts && !costsFechado && (
                          <button title="Editar" onClick={()=>startEdit(item)} style={{background:'none',border:'none',color:'#8B8D97',cursor:'pointer',fontSize:12,padding:0}}>✎</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Insumos (read-only, computed from WMS) */}
                {insumos.length > 0 && (
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #1E2028'}}>
                    <span style={{fontSize:13,color:'#7c3aed'}}>Insumos ({insumos.length} itens)</span>
                    <span style={{fontSize:14,fontWeight:700,color:'#7c3aed'}}>{fmtBRL(insumosTotal)}</span>
                  </div>
                )}

                {/* Add new item */}
                {canEditCosts && !costsFechado && (
                  <div style={{marginTop:8,display:'flex',gap:6}}>
                    <input value={newCostDraft.nome} onChange={e=>setNewCostDraft(p=>({...p,nome:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')addItem();}} placeholder="Nome do custo" style={{flex:1,minWidth:0,padding:'6px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#fff',fontSize:12,fontFamily:'inherit',outline:'none'}} />
                    <select value={newCostDraft.tipo} onChange={e=>setNewCostDraft(p=>({...p,tipo:e.target.value}))} style={{padding:'6px 4px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#C0C2CC',fontSize:11,fontFamily:'inherit',outline:'none'}}>
                      <option value="fixo">R$</option>
                      <option value="percentual">%</option>
                    </select>
                    <input value={newCostDraft.valor} onChange={e=>setNewCostDraft(p=>({...p,valor:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')addItem();}} placeholder={newCostDraft.tipo==='percentual'?'%':'Valor'} style={{width:80,padding:'6px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#fff',fontSize:12,fontFamily:'inherit',outline:'none',textAlign:'right'}} />
                    <button onClick={addItem} style={{padding:'6px 12px',background:'#1e3a5f',border:'none',borderRadius:4,color:'#93c5fd',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>+</button>
                  </div>
                )}
              </>
            )}

            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',marginTop:4}}>
              <span style={{fontSize:14,fontWeight:800}}>Total</span>
              <span style={{fontSize:18,fontWeight:900,color:'#dc2626'}}>{fmtBRL(totalCosts)}</span>
            </div>
          </div>
        </div>

        {/* Client breakdown table */}
        <div style={S.card}>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:16}}>Receita por Cliente — {new Date(month+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h3>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>
              <th style={S.th}>Cliente</th>
              <th style={{...S.th,textAlign:'right'}}>Posições</th>
              <th style={{...S.th,textAlign:'right'}}>Armazenagem</th>
              <th style={{...S.th,textAlign:'right'}}>WMS</th>
              <th style={{...S.th,textAlign:'right'}}>Serviços</th>
              <th style={{...S.th,textAlign:'right'}}>Lançamentos</th>
              <th style={{...S.th,textAlign:'right'}}>Total</th>
            </tr></thead>
            <tbody>
              {Object.entries(currentMonth.clients).sort(([,a],[,b])=>b.total-a.total).map(([client,data]) => (
                <tr key={client}>
                  <td style={{...S.td,fontWeight:700}}>{client}</td>
                  <td style={{...S.td,textAlign:'right'}}>{data.positions}</td>
                  <td style={{...S.td,textAlign:'right'}}>R$ {data.palletRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                  <td style={{...S.td,textAlign:'right'}}>R$ {data.wmsRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                  <td style={{...S.td,textAlign:'right'}}>R$ {data.salesRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                  <td style={{...S.td,textAlign:'right',color:'#8B8D97'}}>{data.salesCount}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:800,color:'#00C896'}}>R$ {data.total.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                </tr>
              ))}
              <tr style={{background:'#00C89610'}}>
                <td style={{...S.td,fontWeight:900}}>TOTAL</td>
                <td style={{...S.td,textAlign:'right',fontWeight:800}}>{currentMonth.totalPositions}</td>
                <td style={{...S.td,textAlign:'right',fontWeight:800}}>R$ {currentMonth.totalPalletRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                <td style={{...S.td,textAlign:'right',fontWeight:800}}>R$ {currentMonth.totalWmsRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                <td style={{...S.td,textAlign:'right',fontWeight:800}}>R$ {currentMonth.totalSalesRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
                <td style={{...S.td,textAlign:'right',fontWeight:800}}>{currentMonth.salesCount}</td>
                <td style={{...S.td,textAlign:'right',fontWeight:900,fontSize:16,color:'#00C896'}}>R$ {currentMonth.totalRevenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* ─── INSUMOS (read-only from WMS) ─── */}
        <div style={{...S.card,marginTop:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div>
              <h3 style={{fontSize:15,fontWeight:700}}>Insumos — {new Date(month+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h3>
              <p style={{fontSize:12,color:'#8B8D97'}}>Registrado pela logística no WMS. Custo incluído no P&L.</p>
            </div>
            <Link to="/wms" style={{padding:'6px 14px',background:'#7c3aed20',border:'1px solid #7c3aed40',borderRadius:6,color:'#7c3aed',fontSize:12,fontWeight:600,textDecoration:'none'}}>Gerenciar no WMS →</Link>
          </div>
          {insumos.length === 0 ? (
            <div style={{textAlign:'center',color:'#8B8D97',padding:20,fontSize:13}}>Nenhum insumo registrado este mês. A equipe de logística registra no WMS → aba Insumos.</div>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                {Object.entries(insumos.reduce((acc,i) => {
                  const key = i.nome === 'Outro' ? (i.obs||'Outro') : i.nome;
                  if (!acc[key]) acc[key] = {qtd:0,custo:0,retiradas:0};
                  acc[key].qtd += parseFloat(i.usado)||0;
                  acc[key].custo += (parseFloat(i.precoUnit)||0) * (parseFloat(i.usado)||0);
                  acc[key].retiradas++;
                  return acc;
                }, {})).sort(([,a],[,b])=>b.custo-a.custo).map(([nome,data]) => (
                  <div key={nome} style={{background:'#161820',borderRadius:8,padding:'10px 14px',minWidth:140,flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#C0C2CC'}}>{nome}</div>
                    <div style={{fontSize:11,color:'#8B8D97',marginTop:2}}>{data.retiradas} retiradas · {data.qtd} un</div>
                    <div style={{fontSize:16,fontWeight:900,color:'#7c3aed',marginTop:2}}>R$ {data.custo.toFixed(2)}</div>
                    <div style={{fontSize:10,color:'#8B8D97'}}>R$ {(data.custo/(currentMonth.salesCount||1)).toFixed(3)}/pedido</div>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderTop:'1px solid #1E2028'}}>
                <span style={{fontWeight:800}}>Total Insumos</span>
                <span style={{fontSize:18,fontWeight:900,color:'#7c3aed'}}>R$ {insumos.reduce((s,i)=>(s+(parseFloat(i.precoUnit)||0)*(parseFloat(i.usado)||0)),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  nav: {padding:'6px 14px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#C0C2CC',fontSize:12,fontWeight:600,textDecoration:'none'},
  input: {padding:'10px 14px',background:'#161820',border:'1.5px solid #1E2028',borderRadius:8,color:'#fff',fontSize:14,fontFamily:'inherit',outline:'none'},
  kpi: {background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,padding:'18px 22px'},
  kpiL: {fontSize:11,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1},
  card: {background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,padding:'20px 24px'},
  th: {textAlign:'left',padding:'10px 14px',borderBottom:'1px solid #1E2028',fontSize:11,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:.5},
  td: {padding:'10px 14px',borderBottom:'1px solid #1E202880'},
};
