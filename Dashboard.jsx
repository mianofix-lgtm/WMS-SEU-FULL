import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { LOGO_ICON } from './logo.js';
import { db, getWmsData, getPricing } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [billingDocs, setBillingDocs] = useState([]);
  const [wmsData, setWmsData] = useState({});
  const [pricing, setPricing] = useState({});
  const [coletaHistory, setColetaHistory] = useState([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });

  // Costs (editable)
  const [costs, setCosts] = useState({
    aluguel: 65000, caucao: 2550, folha: 130000, etiquetas: 8000, energia: 5000, outros: 5000
  });

  const [showCostEditor, setShowCostEditor] = useState(false);
  const [customCosts, setCustomCosts] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [newCost, setNewCost] = useState({nome:'',valor:''});
  const [newInsumo, setNewInsumo] = useState({nome:'',unidade:'un',precoUnit:'',usado:'',periodo:month});
  const [savingCosts, setSavingCosts] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadInsumos(); }, [month]);

  async function loadAll() {
    setLoading(true);
    try {
      const [wms, pr, snap, coletaDoc, costsDoc] = await Promise.all([
        getWmsData(),
        getPricing(),
        getDocs(collection(db, 'billing')),
        getDoc(doc(db, 'wms', 'coletas')).catch(()=>null),
        getDoc(doc(db, 'config', 'costs')).catch(()=>null),
      ]);
      setWmsData(wms || {});
      setPricing(pr);
      if (coletaDoc?.exists?.() && coletaDoc.data().history) setColetaHistory(JSON.parse(coletaDoc.data().history));
      if (costsDoc?.exists?.()) {
        const cd = costsDoc.data();
        setCosts(c => ({...c, ...cd}));
        if (cd.custom) setCustomCosts(JSON.parse(cd.custom));
      }
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

  async function saveCosts() {
    setSavingCosts(true);
    try {
      await setDoc(doc(db, 'config', 'costs'), { ...costs, custom: JSON.stringify(customCosts), updatedAt: new Date().toISOString() });
    } catch(e) { console.error(e); }
    setSavingCosts(false);
  }

  async function saveInsumos(items) {
    try {
      await setDoc(doc(db, 'insumos', month), { items: JSON.stringify(items), month, updatedAt: new Date().toISOString() });
    } catch(e) { console.error(e); }
  }

  function addCustomCost() {
    if (!newCost.nome) return;
    const next = [...customCosts, {id: Date.now().toString(36), nome: newCost.nome, valor: parseFloat(newCost.valor)||0}];
    setCustomCosts(next);
    setNewCost({nome:'',valor:''});
  }

  function removeCustomCost(id) {
    setCustomCosts(customCosts.filter(c => c.id !== id));
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

    const baseCosts = Object.values(costs).reduce((s,v) => s + (typeof v === 'number' || typeof v === 'string' ? parseFloat(v)||0 : 0), 0);
    const customTotal = customCosts.reduce((s,c) => s + (parseFloat(c.valor)||0), 0);
    const insumosTotal = insumos.reduce((s,i) => s + ((parseFloat(i.precoUnit)||0) * (parseFloat(i.usado)||0)), 0);
    const totalCosts = baseCosts + customTotal + insumosTotal;
    const profit = totalRevenue - totalCosts;
    const margin = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0;

    return {
      clients: clientBreakdown,
      totalClients,
      totalPositions,
      totalPalletRevenue,
      totalWmsRevenue,
      totalSalesRevenue,
      totalRevenue,
      totalCosts,
      profit,
      margin,
      salesCount: data.totalSalesCount,
    };
  }, [billingByMonth, month, wmsData, pricing, costs]);

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
            <div style={{fontSize:28,fontWeight:900,color:'#dc2626',marginTop:4}}>R$ {currentMonth.totalCosts.toLocaleString('pt-BR',{minimumFractionDigits:0})}</div>
          </div>
          <div style={{...S.kpi,borderColor:currentMonth.profit>=0?'#00C89640':'#dc262640'}}>
            <div style={S.kpiL}>Resultado</div>
            <div style={{fontSize:28,fontWeight:900,color:currentMonth.profit>=0?'#00C896':'#dc2626',marginTop:4}}>R$ {currentMonth.profit.toLocaleString('pt-BR',{minimumFractionDigits:0})}</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiL}>Margem</div>
            <div style={{fontSize:28,fontWeight:900,color:currentMonth.margin>=20?'#00C896':currentMonth.margin>=0?'#fbbf24':'#dc2626',marginTop:4}}>{currentMonth.margin.toFixed(1)}%</div>
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

          {/* Costs breakdown - EDITABLE */}
          <div style={S.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h3 style={{fontSize:15,fontWeight:700}}>Custos Operacionais</h3>
              <button onClick={()=>setShowCostEditor(!showCostEditor)} style={{padding:'4px 12px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#8B8D97',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>{showCostEditor?'Fechar':'Editar'}</button>
            </div>
            {[
              ['Aluguel galpão','aluguel'],
              ['Caução (oport.)','caucao'],
              ['Folha pagamento','folha'],
              ['Etiquetas/embalagens','etiquetas'],
              ['Energia/utilidades','energia'],
              ['Outros fixos','outros'],
            ].map(([label,key]) => (
              <div key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #1E2028'}}>
                <span style={{fontSize:13,color:'#C0C2CC'}}>{label}</span>
                {showCostEditor ? (
                  <input type="number" value={costs[key]||''} onChange={e=>setCosts(p=>({...p,[key]:e.target.value}))} style={{width:110,padding:'4px 8px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#dc2626',fontSize:14,fontWeight:700,textAlign:'right',fontFamily:'inherit',outline:'none'}} />
                ) : (
                  <span style={{fontSize:14,fontWeight:700,color:'#dc2626'}}>R$ {(parseFloat(costs[key])||0).toLocaleString('pt-BR',{minimumFractionDigits:0})}</span>
                )}
              </div>
            ))}
            {/* Custom costs */}
            {customCosts.map(cc => (
              <div key={cc.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #1E2028'}}>
                <span style={{fontSize:13,color:'#f97316'}}>{cc.nome}</span>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  {showCostEditor ? (
                    <>
                      <input type="number" value={cc.valor} onChange={e=>{const next=customCosts.map(c=>c.id===cc.id?{...c,valor:e.target.value}:c);setCustomCosts(next);}} style={{width:100,padding:'4px 8px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#f97316',fontSize:14,fontWeight:700,textAlign:'right',fontFamily:'inherit',outline:'none'}} />
                      <button onClick={()=>removeCustomCost(cc.id)} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:14}}>✕</button>
                    </>
                  ) : (
                    <span style={{fontSize:14,fontWeight:700,color:'#f97316'}}>R$ {(parseFloat(cc.valor)||0).toLocaleString('pt-BR',{minimumFractionDigits:0})}</span>
                  )}
                </div>
              </div>
            ))}
            {/* Insumos total */}
            {insumos.length > 0 && (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #1E2028'}}>
                <span style={{fontSize:13,color:'#7c3aed'}}>Insumos ({insumos.length} itens)</span>
                <span style={{fontSize:14,fontWeight:700,color:'#7c3aed'}}>R$ {insumos.reduce((s,i)=>(s+(parseFloat(i.precoUnit)||0)*(parseFloat(i.usado)||0)),0).toLocaleString('pt-BR',{minimumFractionDigits:0})}</span>
              </div>
            )}
            {showCostEditor && (
              <div style={{marginTop:8,display:'flex',gap:6}}>
                <input value={newCost.nome} onChange={e=>setNewCost(p=>({...p,nome:e.target.value}))} placeholder="Nome do custo" style={{flex:1,padding:'6px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#fff',fontSize:12,fontFamily:'inherit',outline:'none'}} />
                <input type="number" value={newCost.valor} onChange={e=>setNewCost(p=>({...p,valor:e.target.value}))} placeholder="Valor" style={{width:90,padding:'6px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#fff',fontSize:12,fontFamily:'inherit',outline:'none',textAlign:'right'}} />
                <button onClick={addCustomCost} style={{padding:'6px 12px',background:'#1e3a5f',border:'none',borderRadius:4,color:'#93c5fd',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>+</button>
              </div>
            )}
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',marginTop:4}}>
              <span style={{fontSize:14,fontWeight:800}}>Total</span>
              <span style={{fontSize:18,fontWeight:900,color:'#dc2626'}}>R$ {currentMonth.totalCosts.toLocaleString('pt-BR',{minimumFractionDigits:0})}</span>
            </div>
            {showCostEditor && <button onClick={saveCosts} disabled={savingCosts} style={{width:'100%',padding:'8px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:12,marginTop:4}}>{savingCosts?'Salvando...':'Salvar Custos'}</button>}
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
        {/* ─── INSUMOS ─── */}
        <div style={{...S.card,marginTop:20}}>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:4}}>Controle de Insumos — {new Date(month+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h3>
          <p style={{fontSize:12,color:'#8B8D97',marginBottom:16}}>Registre o consumo de materiais e compare com o volume produzido. Perdas aparecem em vermelho.</p>
          
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>
              <th style={S.th}>Insumo</th>
              <th style={S.th}>Unidade</th>
              <th style={{...S.th,textAlign:'right'}}>Preço Unit.</th>
              <th style={{...S.th,textAlign:'right'}}>Usado</th>
              <th style={{...S.th,textAlign:'right'}}>Custo Total</th>
              <th style={{...S.th,textAlign:'right'}}>Custo/Pedido</th>
              <th style={S.th}></th>
            </tr></thead>
            <tbody>
              {insumos.length === 0 ? (
                <tr><td colSpan={7} style={{...S.td,textAlign:'center',color:'#8B8D97',padding:20}}>Nenhum insumo registrado. Adicione rolos de etiqueta, fitas, stretch, etc.</td></tr>
              ) : insumos.map(i => {
                const custoTotal = (parseFloat(i.precoUnit)||0) * (parseFloat(i.usado)||0);
                const totalPedidos = currentMonth.salesCount || 1;
                const custoPorPedido = custoTotal / totalPedidos;
                return (
                  <tr key={i.id}>
                    <td style={{...S.td,fontWeight:600}}>{i.nome}</td>
                    <td style={S.td}>{i.unidade}</td>
                    <td style={{...S.td,textAlign:'right'}}><input type="number" value={i.precoUnit} onChange={e=>updateInsumo(i.id,'precoUnit',e.target.value)} style={{width:80,padding:'3px 6px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#fff',fontSize:13,textAlign:'right',fontFamily:'inherit',outline:'none'}} step="0.01" /></td>
                    <td style={{...S.td,textAlign:'right'}}><input type="number" value={i.usado} onChange={e=>updateInsumo(i.id,'usado',e.target.value)} style={{width:80,padding:'3px 6px',background:'#161820',border:'1px solid #1E2028',borderRadius:4,color:'#fff',fontSize:13,textAlign:'right',fontFamily:'inherit',outline:'none'}} /></td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700,color:'#7c3aed'}}>R$ {custoTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                    <td style={{...S.td,textAlign:'right',fontSize:12,color:'#8B8D97'}}>R$ {custoPorPedido.toFixed(2)}/ped</td>
                    <td style={S.td}><button onClick={()=>removeInsumo(i.id)} style={{background:'none',border:'none',color:'#dc2626',cursor:'pointer',fontSize:13}}>✕</button></td>
                  </tr>
                );
              })}
              {insumos.length > 0 && (
                <tr style={{background:'#7c3aed10'}}>
                  <td style={{...S.td,fontWeight:800}} colSpan={4}>Total Insumos</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:900,color:'#7c3aed'}}>R$ {insumos.reduce((s,i)=>(s+(parseFloat(i.precoUnit)||0)*(parseFloat(i.usado)||0)),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                  <td style={{...S.td,textAlign:'right',fontSize:12,color:'#8B8D97'}}>R$ {(insumos.reduce((s,i)=>(s+(parseFloat(i.precoUnit)||0)*(parseFloat(i.usado)||0)),0)/(currentMonth.salesCount||1)).toFixed(2)}/ped</td>
                  <td style={S.td}></td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Add insumo form */}
          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div><div style={{fontSize:10,color:'#8B8D97',marginBottom:2}}>NOME</div><input value={newInsumo.nome} onChange={e=>setNewInsumo(p=>({...p,nome:e.target.value}))} placeholder="Ex: Rolo etiqueta" style={{padding:'8px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#fff',fontSize:13,fontFamily:'inherit',outline:'none',width:160}} /></div>
            <div><div style={{fontSize:10,color:'#8B8D97',marginBottom:2}}>UNIDADE</div><select value={newInsumo.unidade} onChange={e=>setNewInsumo(p=>({...p,unidade:e.target.value}))} style={{padding:'8px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#fff',fontSize:13,fontFamily:'inherit',outline:'none'}}>
              <option value="un">Unidade</option><option value="rolo">Rolo</option><option value="cx">Caixa</option><option value="m">Metro</option><option value="kg">Kg</option><option value="L">Litro</option>
            </select></div>
            <div><div style={{fontSize:10,color:'#8B8D97',marginBottom:2}}>PREÇO UNIT.</div><input type="number" value={newInsumo.precoUnit} onChange={e=>setNewInsumo(p=>({...p,precoUnit:e.target.value}))} placeholder="0.00" step="0.01" style={{padding:'8px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#fff',fontSize:13,fontFamily:'inherit',outline:'none',width:100}} /></div>
            <div><div style={{fontSize:10,color:'#8B8D97',marginBottom:2}}>QTD USADA</div><input type="number" value={newInsumo.usado} onChange={e=>setNewInsumo(p=>({...p,usado:e.target.value}))} placeholder="0" style={{padding:'8px 10px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#fff',fontSize:13,fontFamily:'inherit',outline:'none',width:80}} /></div>
            <button onClick={addInsumo} style={{padding:'8px 20px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13}}>+ Adicionar</button>
          </div>
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
