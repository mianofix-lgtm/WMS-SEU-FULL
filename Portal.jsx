import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { LOGO_ICON } from './logo.js';
import { logout, getWmsData, getPerms, db } from './firebase.js';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const WAREHOUSE = {
  ruas: [
    { id:"R1", label:"RUA 1", vaos:4, tipo:"seufull" },
    { id:"R2", label:"RUA 2", vaos:10, tipo:"seufull" },
    { id:"R3", label:"RUA 3", vaos:10, tipo:"mianofix" },
    { id:"R4", label:"RUA 4", vaos:10, tipo:"mianofix" },
    { id:"R5", label:"RUA 5", vaos:10, tipo:"mianofix" },
  ],
};
const LADOS = ["A","B"];
function cellId(r,v,l,a){ return `${r}-P${String(v).padStart(2,"0")}${l}-A${a}`; }
function cellHasClient(cell, loja) { return cell?.loja && loja && cell.loja.trim().toUpperCase() === loja.trim().toUpperCase(); }
function cellDisplay(c) {
  if (!c) return null;
  if (c.produtos?.length > 0 && c.produtos[0].nome) {
    const totalQtd = c.produtos.reduce((s,p) => s + (parseInt(p.qtd)||0), 0);
    return { nome: c.produtos[0].nome, qtd: totalQtd, count: c.produtos.filter(p=>p.nome).length, loja: c.loja, produtos: c.produtos };
  }
  if (c.nome || c.sku) return { nome: c.nome, qtd: parseInt(c.qtd)||0, count: 1, loja: c.loja, produtos: [{nome:c.nome,sku:c.sku,qtd:c.qtd,curva:c.curva,valorUnit:c.valorUnit}] };
  if (c.descricao || c.loja) return { nome: c.descricao, qtd: parseInt(c.qtd)||0, count: 1, loja: c.loja, produtos: [{nome:c.descricao,sku:'',qtd:c.qtd,curva:''}] };
  return null;
}

export default function Portal() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [cells, setCells] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [tab, setTab] = useState('estoque');
  const [billingData, setBillingData] = useState(null);
  const [billingMonth, setBillingMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [billingHistory, setBillingHistory] = useState([]);
  const [selectedPos, setSelectedPos] = useState(null);
  const [profile, setProfile] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [coletaHistory, setColetaHistory] = useState([]);

  const isInternal = ['diretor','gerente','comercial','financeiro'].includes(user?.role);
  const perms = getPerms(user?.role);
  const clientLoja = user?.loja || '';

  useEffect(() => { loadAll(); const iv = setInterval(()=>loadStock(), 30000); return ()=>clearInterval(iv); }, []);
  useEffect(() => { if (tab === 'faturamento') loadBilling(); }, [tab, billingMonth]);
  useEffect(() => { if (tab === 'conta') loadProfile(); }, [tab]);

  async function loadAll() {
    setLoading(true);
    try {
      const [wms, coletaDoc] = await Promise.all([
        getWmsData(),
        getDoc(doc(db, 'wms', 'coletas')).catch(()=>null),
      ]);
      setCells(wms || {});
      if (coletaDoc?.exists?.() && coletaDoc.data().history) setColetaHistory(JSON.parse(coletaDoc.data().history));
      setLastSync(new Date());
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function loadStock() {
    try { setCells(await getWmsData() || {}); setLastSync(new Date()); } catch(e) {}
  }

  async function loadBilling() {
    try {
      const loja = isInternal ? clientLoja : clientLoja;
      if (!loja) return;
      const key = `billing_${loja}_${billingMonth}`.replace(/\s/g,'_');
      const d = await getDoc(doc(db, 'billing', key));
      if (d.exists()) {
        const data = d.data();
        setBillingData({ sales: data.sales ? JSON.parse(data.sales) : [], pallets: data.pallets ? JSON.parse(data.pallets) : [] });
      } else {
        setBillingData({ sales: [], pallets: [] });
      }
      // Load history of all months
      const snap = await getDocs(collection(db, 'billing'));
      const hist = [];
      snap.forEach(d => {
        if (d.id.startsWith(`billing_${loja}_`)) {
          const data = d.data();
          const sales = data.sales ? JSON.parse(data.sales) : [];
          hist.push({ month: data.month, total: sales.reduce((s,v)=>s+(v.valor||0),0), count: sales.length, updatedAt: data.updatedAt });
        }
      });
      setBillingHistory(hist.sort((a,b) => b.month?.localeCompare(a.month)));
    } catch(e) { setBillingData({ sales: [], pallets: [] }); }
  }

  async function loadProfile() {
    if (!user?.uid) return;
    try {
      const d = await getDoc(doc(db, 'users', user.uid));
      if (d.exists()) setProfile(d.data());
    } catch(e) {}
  }

  async function saveProfile() {
    if (!user?.uid) return;
    setProfileSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { ...profile, updatedAt: new Date().toISOString() }, { merge: true });
      setProfileMsg('Dados atualizados!');
      setTimeout(()=>setProfileMsg(''), 3000);
    } catch(e) { setProfileMsg('Erro ao salvar'); }
    setProfileSaving(false);
  }

  // Stock items
  const stockItems = useMemo(() => {
    const items = [];
    for (const [id, cell] of Object.entries(cells)) {
      if (!cell) continue;
      const prods = cell.produtos?.length > 0 && cell.produtos[0].nome
        ? cell.produtos.filter(p => p.nome || p.sku)
        : cell.nome ? [{sku:cell.sku, nome:cell.nome, qtd:cell.qtd, valorUnit:cell.valorUnit, curva:cell.curva}]
        : cell.descricao ? [{sku:'', nome:cell.descricao, qtd:cell.qtd, valorUnit:cell.valorUnit, curva:''}]
        : [];
      if (prods.length === 0) continue;
      if (!isInternal && clientLoja && !cell.loja?.trim().toUpperCase().includes(clientLoja.trim().toUpperCase())) continue;
      for (const prod of prods) {
        if (search && !(prod.nome||'').toLowerCase().includes(search.toLowerCase()) && !(prod.sku||'').toLowerCase().includes(search.toLowerCase())) continue;
        items.push({ id, loja: cell.loja, dataEntrada: cell.dataEntrada, ...prod });
      }
    }
    return items.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [cells, search, isInternal, clientLoja]);

  const totalQtd = stockItems.reduce((s,i) => s + (parseInt(i.qtd)||0), 0);
  const totalSkus = new Set(stockItems.map(i=>i.sku).filter(Boolean)).size;
  const clientPositions = useMemo(() => {
    let n = 0;
    Object.values(cells).forEach(c => { if ((isInternal || cellHasClient(c, clientLoja)) && cellDisplay(c)) n++; });
    return n;
  }, [cells, clientLoja, isInternal]);

  // Monthly activity from coleta history
  const monthlyActivity = useMemo(() => {
    const act = { full: 0, fullItems: 0 };
    const mStart = billingMonth + '-01';
    const mEnd = billingMonth + '-31';
    coletaHistory.forEach(h => {
      const d = h.date?.substring(0,10);
      if (d >= mStart && d <= mEnd) {
        (h.items||[]).forEach(it => {
          if (!clientLoja || (it.loja && it.loja.trim().toUpperCase() === clientLoja.trim().toUpperCase())) {
            act.full++;
            act.fullItems += parseInt(it.qtd)||0;
          }
        });
      }
    });
    if (billingData?.sales) {
      const byChannel = {};
      billingData.sales.forEach(s => {
        if (!byChannel[s.canal]) byChannel[s.canal] = { count: 0, units: 0, valor: 0 };
        byChannel[s.canal].count++;
        byChannel[s.canal].units += s.qtd||1;
        byChannel[s.canal].valor += s.valor||0;
      });
      act.channels = byChannel;
    }
    return act;
  }, [coletaHistory, billingData, billingMonth, clientLoja]);

  async function handleLogout() { await logout(); setUser(null); nav('/login'); }

  if (loading) return <div style={S.loadPage}><div style={{color:'#00C896',fontSize:16}}>Carregando...</div></div>;

  return (
    <div style={S.page}>
      <style>{CSS}</style>
      {/* Header */}
      <header style={S.header}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <Link to="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <img src={LOGO_ICON} alt="Seu Full" style={{width:36,height:36,borderRadius:9}} />
            <div style={{fontSize:20,fontWeight:800,color:'#fff'}}>Seu<span style={{color:'#00C896'}}>Full</span></div>
          </Link>
          <div style={{padding:'5px 14px',background:'#00C89620',border:'1px solid #00C89633',borderRadius:100,fontSize:12,fontWeight:600,color:'#00C896'}}>Portal</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div style={{textAlign:'right',marginRight:4}}>
            <div style={{fontSize:14,fontWeight:600}}>{user?.nome||user?.email}</div>
            <div style={{fontSize:12,color:'#8B8D97'}}>{user?.role==='cliente'?clientLoja:user?.role}</div>
          </div>
          {user?.role==='diretor' && <Link to="/admin" className="p-nav" style={{color:'#fbbf24'}}>Admin</Link>}
          {(user?.role==='diretor'||user?.role==='comercial') && <Link to="/billing" className="p-nav" style={{color:'#f97316'}}>Billing</Link>}
          {perms.canEdit && <Link to="/wms" className="p-nav">WMS</Link>}
          <button onClick={handleLogout} className="p-nav" style={{color:'#8B8D97',cursor:'pointer'}}>Sair</button>
        </div>
      </header>

      <main style={{maxWidth:1280,margin:'0 auto',padding:'20px 28px'}}>
        {/* KPIs */}
        <div className="p-kpis">
          <div className="p-kpi"><div className="p-kpi-l">SKUs</div><div className="p-kpi-v">{totalSkus}</div></div>
          <div className="p-kpi"><div className="p-kpi-l">Unidades</div><div className="p-kpi-v">{totalQtd.toLocaleString('pt-BR')}</div></div>
          <div className="p-kpi"><div className="p-kpi-l">Posições</div><div className="p-kpi-v">{clientPositions}</div></div>
          <div className="p-kpi"><div className="p-kpi-l">Produtos</div><div className="p-kpi-v">{stockItems.length}</div></div>
        </div>

        {/* Tabs */}
        <div className="p-tabs">
          {[['estoque','Estoque'],['mapa','Mapa'],['faturamento','Faturamento'],['conta','Minha Conta']].map(([k,l]) => (
            <button key={k} className={`p-tab ${tab===k?'on':''}`} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* ─── ESTOQUE ─── */}
        {tab === 'estoque' && (<div>
          <div style={{display:'flex',gap:12,marginBottom:16}}>
            <input className="p-input" style={{flex:1}} placeholder="Buscar por nome ou SKU..." value={search} onChange={e=>setSearch(e.target.value)} />
            <button onClick={loadStock} className="p-btn-sec">↻ Atualizar</button>
          </div>
          <div className="p-card">
            <table className="p-table"><thead><tr>
              <th>Endereço</th><th>SKU</th><th>Produto</th><th>Curva</th>{isInternal && <th>Loja</th>}<th style={{textAlign:'right'}}>Qtd</th><th>Entrada</th>
            </tr></thead><tbody>
              {stockItems.length === 0 ? <tr><td colSpan={7} style={{textAlign:'center',color:'#8B8D97',padding:40}}>{search ? 'Nenhum resultado.' : 'Nenhum produto.'}</td></tr>
              : stockItems.map((item,i) => (
                <tr key={`${item.id}-${i}`} onClick={()=>setSelectedPos({id:item.id, cell:cells[item.id]})} style={{cursor:'pointer'}}>
                  <td style={{fontWeight:700,color:'#00C896',fontFamily:'monospace',fontSize:12}}>{item.id}</td>
                  <td style={{fontFamily:'monospace',fontSize:12}}>{item.sku||'-'}</td>
                  <td style={{maxWidth:300}}>{item.nome||'-'}</td>
                  <td>{item.curva && <span className={`p-curva p-curva-${item.curva}`}>{item.curva}</span>}</td>
                  {isInternal && <td style={{fontSize:13}}>{item.loja||'-'}</td>}
                  <td style={{textAlign:'right',fontWeight:700}}>{parseInt(item.qtd||0).toLocaleString('pt-BR')}</td>
                  <td style={{fontSize:12,color:'#8B8D97'}}>{item.dataEntrada ? new Date(item.dataEntrada+'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>)}

        {/* ─── MAPA ─── */}
        {tab === 'mapa' && (<div>
          <div className="p-card" style={{padding:'12px 16px',marginBottom:12,display:'flex',gap:20,fontSize:13,flexWrap:'wrap'}}>
            <span><span className="p-dot" style={{background:'#00C896'}}></span> {isInternal?'Ocupado':`${clientLoja}`}</span>
            <span><span className="p-dot" style={{background:'#1E2028'}}></span> {isInternal?'-':'Outra loja'}</span>
            <span><span className="p-dot" style={{background:'#111318',border:'1px solid #1a1c22'}}></span> Vazio</span>
          </div>
          <div className="pm-map">
            <div className="pm-label">PAREDE</div>
            {WAREHOUSE.ruas.map((rua,ri) => (
              <div key={rua.id}>
                <div className="pm-rua">
                  <div className="pm-rua-name">{rua.label}</div>
                  <div className="pm-grid">
                    <div className="pm-row"><span className="pm-ah"></span>{Array.from({length:rua.vaos},(_,i)=>i+1).map(v=><span key={v} className="pm-ph">P{String(v).padStart(2,'0')}</span>)}</div>
                    {(rua.id==="R2"||rua.id==="R4"?[1,2,3,4]:[4,3,2,1]).map(a => (
                      <div key={a} className="pm-row"><span className="pm-ah">A{a}</span>
                        {Array.from({length:rua.vaos},(_,i)=>i+1).map(v => (
                          <div key={v} className="pm-vao">{LADOS.map(l => {
                            if (rua.vaos===10 && v===rua.vaos && (a===1||a===2)) return <div key={l} className="pm-cell pm-blocked">✕</div>;
                            const id = cellId(rua.id,v,l,a), c = cells[id], cd = cellDisplay(c);
                            const mine = isInternal ? !!cd : cellHasClient(c,clientLoja);
                            return <div key={l} className={`pm-cell ${mine?'pm-mine':cd?'pm-other':'pm-empty'}`}
                              onClick={mine&&cd?()=>setSelectedPos({id,cell:c}):undefined}
                              style={{cursor:mine&&cd?'pointer':'default'}}
                              title={mine&&cd?`${cd.loja} — ${cd.nome} (${cd.qtd})`:''}
                            ><span className="pm-cl">{l}</span>{mine&&cd&&<span className="pm-cn">{cd.count>1?`${cd.count}`:''}</span>}</div>;
                          })}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {(ri===1||ri===3) && <div className="pm-costas">COSTAS</div>}
                {(ri===0||ri===2) && <div className="pm-corredor">CORREDOR</div>}
              </div>
            ))}
            <div className="pm-corredor">CORREDOR</div>
            <div style={{display:'flex',gap:12,marginTop:12}}>
              <div className="pm-area"><div className="pm-at" style={{background:'#00C896',color:'#2E2C3A'}}>Flex (60)</div>
                <div className="pm-ag">{Array.from({length:60},(_,i)=>`FLEX-${i+1}`).map(s => {
                  const c=cells[s],cd=cellDisplay(c),mine=isInternal?!!cd:cellHasClient(c,clientLoja);
                  return <div key={s} className={`pm-as ${mine?'pm-mine':cd?'pm-other':'pm-empty'}`} onClick={mine&&cd?()=>setSelectedPos({id:s,cell:c}):undefined} style={{cursor:mine&&cd?'pointer':'default'}}></div>;
                })}</div>
              </div>
              <div className="pm-area" style={{flex:1}}><div className="pm-at" style={{background:'#1e3a5f',color:'#fff'}}>Full (40)</div>
                <div className="pm-ag" style={{gridTemplateColumns:'repeat(8,1fr)'}}>{Array.from({length:40},(_,i)=>`FULL-${i+1}`).map(s => {
                  const c=cells[s],cd=cellDisplay(c),mine=isInternal?!!cd:cellHasClient(c,clientLoja);
                  return <div key={s} className={`pm-as ${mine?'pm-mine':cd?'pm-other':'pm-empty'}`} style={{height:34,cursor:mine&&cd?'pointer':'default'}} onClick={mine&&cd?()=>setSelectedPos({id:s,cell:c}):undefined}></div>;
                })}</div>
              </div>
            </div>
          </div>
        </div>)}

        {/* ─── FATURAMENTO ─── */}
        {tab === 'faturamento' && (<div>
          <div style={{display:'flex',gap:16,alignItems:'flex-end',marginBottom:20,flexWrap:'wrap'}}>
            <div><div className="p-label">Mês</div><input type="month" value={billingMonth} onChange={e=>setBillingMonth(e.target.value)} className="p-input" /></div>
            <div style={{marginLeft:'auto',textAlign:'right'}}><div className="p-label">Posições</div><div style={{fontSize:24,fontWeight:900,color:'#00C896'}}>{clientPositions}</div></div>
          </div>

          {/* Monthly activity cards */}
          <div className="p-kpis" style={{marginBottom:16}}>
            <div className="p-kpi" style={{borderColor:'#00C89640'}}><div className="p-kpi-l">Full ML</div><div className="p-kpi-v" style={{color:'#00C896'}}>{monthlyActivity.channels?.['Full ML']?.units||0}</div><div style={{fontSize:11,color:'#8B8D97'}}>{monthlyActivity.channels?.['Full ML']?.count||0} lanç · R$ {(monthlyActivity.channels?.['Full ML']?.valor||0).toFixed(2)}</div></div>
            <div className="p-kpi" style={{borderColor:'#3b82f640'}}><div className="p-kpi-l">Flex</div><div className="p-kpi-v" style={{color:'#3b82f6'}}>{monthlyActivity.channels?.['Flex']?.units||0}</div><div style={{fontSize:11,color:'#8B8D97'}}>R$ {(monthlyActivity.channels?.['Flex']?.valor||0).toFixed(2)}</div></div>
            <div className="p-kpi" style={{borderColor:'#f9731640'}}><div className="p-kpi-l">Correios/Places</div><div className="p-kpi-v" style={{color:'#f97316'}}>{(monthlyActivity.channels?.['Correios']?.units||0)+(monthlyActivity.channels?.['Places']?.units||0)}</div><div style={{fontSize:11,color:'#8B8D97'}}>R$ {((monthlyActivity.channels?.['Correios']?.valor||0)+(monthlyActivity.channels?.['Places']?.valor||0)).toFixed(2)}</div></div>
            <div className="p-kpi" style={{borderColor:'#7c3aed40'}}><div className="p-kpi-l">Kits</div><div className="p-kpi-v" style={{color:'#7c3aed'}}>{monthlyActivity.channels?.['Kit']?.units||0}</div><div style={{fontSize:11,color:'#8B8D97'}}>R$ {(monthlyActivity.channels?.['Kit']?.valor||0).toFixed(2)}</div></div>
          </div>

          {billingData && (<div className="p-card" style={{padding:24}}>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:16}}>Detalhamento — {new Date(billingMonth+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h3>
            
            <div style={{fontSize:13,fontWeight:700,color:'#00C896',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Posições Ocupadas</div>
            <table className="p-table"><thead><tr><th>Endereço</th><th>Produto</th><th style={{textAlign:'right'}}>Qtd</th><th>Entrada</th></tr></thead><tbody>
              {Object.entries(cells).filter(([,c])=>isInternal?cellDisplay(c):cellHasClient(c,clientLoja)).sort(([a],[b])=>a.localeCompare(b)).map(([id,cell]) => (
                <tr key={id} onClick={()=>setSelectedPos({id,cell})} style={{cursor:'pointer'}}>
                  <td style={{fontFamily:'monospace',color:'#00C896',fontWeight:700,fontSize:12}}>{id}</td>
                  <td>{cell.produtos?.[0]?.nome ? cell.produtos.map(p=>`${p.nome} (${p.qtd||0})`).join(', ') : cell.nome||cell.descricao||'-'}</td>
                  <td style={{textAlign:'right',fontWeight:700}}>{cell.produtos?cell.produtos.reduce((s,p)=>s+(parseInt(p.qtd)||0),0):cell.qtd||'-'}</td>
                  <td style={{fontSize:12,color:'#8B8D97'}}>{cell.dataEntrada?new Date(cell.dataEntrada+'T00:00:00').toLocaleDateString('pt-BR'):'-'}</td>
                </tr>
              ))}
            </tbody></table>

            {billingData.sales.length > 0 && <>
              <div style={{fontSize:13,fontWeight:700,color:'#00C896',textTransform:'uppercase',letterSpacing:1,marginBottom:8,marginTop:24}}>Serviços</div>
              <table className="p-table"><thead><tr><th>Data</th><th>Nº</th><th>Canal</th><th>Produto</th><th style={{textAlign:'right'}}>Qtd</th><th style={{textAlign:'right'}}>Valor</th></tr></thead><tbody>
                {billingData.sales.map((s,i) => (
                  <tr key={i}><td style={{fontSize:12,color:'#8B8D97'}}>{new Date(s.data).toLocaleDateString('pt-BR')}</td><td style={{fontFamily:'monospace',fontSize:12}}>{s.numero||'-'}</td><td><span className="p-badge">{s.canal}</span></td><td>{s.produto||'-'}</td><td style={{textAlign:'right'}}>{s.qtd}</td><td style={{textAlign:'right',fontWeight:700}}>R$ {(s.valor||0).toFixed(2)}</td></tr>
                ))}
                <tr style={{background:'#00C89610'}}><td colSpan={5} style={{fontWeight:800}}>Total</td><td style={{textAlign:'right',fontWeight:800,color:'#00C896'}}>R$ {billingData.sales.reduce((s,v)=>s+(v.valor||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
              </tbody></table>
            </>}
          </div>)}

          {/* Billing history */}
          {billingHistory.length > 0 && (
            <div className="p-card" style={{padding:20,marginTop:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Faturas Anteriores</div>
              {billingHistory.map((h,i) => (
                <div key={i} onClick={()=>setBillingMonth(h.month)} style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:h.month===billingMonth?'#00C89610':'#161820',borderRadius:8,marginBottom:4,cursor:'pointer',border:h.month===billingMonth?'1px solid #00C89640':'1px solid transparent'}}>
                  <span style={{fontWeight:600}}>{new Date(h.month+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</span>
                  <div style={{display:'flex',gap:16}}>
                    <span style={{color:'#8B8D97',fontSize:13}}>{h.count} serviços</span>
                    <span style={{fontWeight:700,color:'#00C896'}}>R$ {h.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>)}

        {/* ─── MINHA CONTA ─── */}
        {tab === 'conta' && (<div>
          <div className="p-card" style={{padding:28,maxWidth:600}}>
            <h3 style={{fontSize:18,fontWeight:800,marginBottom:20}}>Dados da Conta</h3>
            {[
              ['Nome da Empresa','nome','text'],
              ['CNPJ','cnpj','text'],
              ['Telefone','telefone','text'],
              ['Responsável','responsavel','text'],
              ['E-mail','email','email'],
              ['Endereço','endereco','text'],
              ['Cidade','cidade','text'],
              ['Estado','estado','text'],
            ].map(([label,key,type]) => (
              <div key={key} style={{marginBottom:14}}>
                <div className="p-label">{label}</div>
                <input type={type} value={profile[key]||''} onChange={e=>setProfile(p=>({...p,[key]:e.target.value}))} className="p-input" style={{width:'100%'}} />
              </div>
            ))}
            <div style={{display:'flex',gap:12,alignItems:'center',marginTop:20}}>
              <button onClick={saveProfile} disabled={profileSaving} style={{padding:'12px 32px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:14}}>{profileSaving?'Salvando...':'Salvar Alterações'}</button>
              {profileMsg && <span style={{color:'#00C896',fontWeight:600,fontSize:13}}>{profileMsg}</span>}
            </div>
          </div>

          <div className="p-card" style={{padding:20,marginTop:16,maxWidth:600}}>
            <h3 style={{fontSize:14,fontWeight:700,color:'#8B8D97',marginBottom:8}}>Informações do Acesso</h3>
            <div style={{fontSize:13,color:'#C0C2CC'}}>E-mail: {user?.email}</div>
            <div style={{fontSize:13,color:'#C0C2CC'}}>Perfil: {user?.role}</div>
            <div style={{fontSize:13,color:'#C0C2CC'}}>Loja: {clientLoja}</div>
          </div>
        </div>)}
      </main>

      {/* ─── MODAL DETALHE POSIÇÃO ─── */}
      {selectedPos && (
        <div className="p-overlay" onClick={()=>setSelectedPos(null)}>
          <div className="p-modal" onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h3 style={{fontSize:18,fontWeight:800,color:'#00C896',fontFamily:'monospace'}}>{selectedPos.id}</h3>
              <button onClick={()=>setSelectedPos(null)} style={{background:'none',border:'none',color:'#8B8D97',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>
            {selectedPos.cell && (() => {
              const cd = cellDisplay(selectedPos.cell);
              if (!cd) return <p style={{color:'#8B8D97'}}>Posição vazia</p>;
              return (<div>
                <div style={{fontSize:13,color:'#8B8D97',marginBottom:12}}>Loja: <span style={{color:'#fff',fontWeight:700}}>{cd.loja||'-'}</span></div>
                {selectedPos.cell.dataEntrada && <div style={{fontSize:13,color:'#8B8D97',marginBottom:12}}>Entrada: <span style={{color:'#fbbf24',fontWeight:700}}>{new Date(selectedPos.cell.dataEntrada+'T00:00:00').toLocaleDateString('pt-BR')}</span></div>}
                <div style={{fontSize:12,fontWeight:700,color:'#00C896',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Produtos ({cd.count})</div>
                <table className="p-table"><thead><tr><th>SKU</th><th>Produto</th><th>Curva</th><th style={{textAlign:'right'}}>Qtd</th></tr></thead><tbody>
                  {(cd.produtos||[]).filter(p=>p.nome).map((p,i) => (
                    <tr key={i}>
                      <td style={{fontFamily:'monospace',fontSize:12}}>{p.sku||'-'}</td>
                      <td style={{fontWeight:600}}>{p.nome}</td>
                      <td>{p.curva && <span className={`p-curva p-curva-${p.curva}`}>{p.curva}</span>}</td>
                      <td style={{textAlign:'right',fontWeight:700,fontSize:16}}>{parseInt(p.qtd||0).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody></table>
                {selectedPos.cell.obs && <div style={{marginTop:12,fontSize:12,color:'#8B8D97'}}>Obs: {selectedPos.cell.obs}</div>}
              </div>);
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.p-nav{padding:5px 12px;background:#161820;border:1px solid #1E2028;border-radius:6px;color:#00C896;font-size:12px;font-weight:600;text-decoration:none;font-family:inherit;}
.p-kpis{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
.p-kpi{flex:1;min-width:120px;background:#0F1117;border:1px solid #1E2028;border-radius:12px;padding:14px 16px;}
.p-kpi-l{font-size:11px;font-weight:600;color:#8B8D97;text-transform:uppercase;letter-spacing:1px;}
.p-kpi-v{font-size:24px;font-weight:900;margin-top:2px;letter-spacing:-1px;}
.p-tabs{display:flex;gap:4px;margin-bottom:16px;background:#0F1117;padding:4px;border-radius:10px;border:1px solid #1E2028;}
.p-tab{padding:9px 22px;font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:7px;cursor:pointer;background:transparent;color:#8B8D97;transition:.15s;}
.p-tab.on{background:#fff;color:#0F1117;}
.p-card{background:#0F1117;border:1px solid #1E2028;border-radius:12px;overflow:auto;}
.p-input{padding:10px 14px;background:#161820;border:1.5px solid #1E2028;border-radius:8px;color:#fff;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;}
.p-btn-sec{padding:10px 18px;background:#161820;border:1px solid #1E2028;border-radius:8px;color:#00C896;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
.p-label{font-size:11px;font-weight:600;color:#8B8D97;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;}
.p-table{width:100%;border-collapse:collapse;font-size:13px;}
.p-table th{text-align:left;padding:10px 14px;border-bottom:1px solid #1E2028;font-size:11px;font-weight:700;color:#8B8D97;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
.p-table td{padding:9px 14px;border-bottom:1px solid #1E202880;white-space:nowrap;}
.p-table tr:hover{background:#ffffff05;}
.p-badge{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#00C89620;color:#00C896;}
.p-curva{padding:3px 10px;border-radius:6px;font-size:12px;font-weight:700;}
.p-curva-A{background:#dc262620;color:#fca5a5;}.p-curva-B{background:#d9770620;color:#fcd34d;}.p-curva-C{background:#16a34a20;color:#86efac;}
.p-dot{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:middle;margin-right:6px;}
.p-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;}
.p-modal{background:#0F1117;border:1px solid #1E2028;border-radius:16px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;}
.pm-map{background:#0F1117;border:1px solid #1E2028;border-radius:14px;padding:14px;overflow-x:auto;}
.pm-map>*{min-width:850px;}
.pm-label{text-align:center;font-size:10px;font-weight:700;color:#8B8D97;letter-spacing:2px;padding:4px;background:#1E2028;border-radius:4px;margin-bottom:6px;}
.pm-corredor{text-align:center;font-size:10px;font-weight:700;color:#3b82f6;letter-spacing:2px;padding:5px;background:#1e3a5f15;border:1px dashed #3b82f640;border-radius:4px;margin:5px 0;}
.pm-costas{text-align:center;font-size:9px;color:#8B8D97;padding:2px;letter-spacing:1px;}
.pm-rua{background:#0a0c12;border:1px solid #1E2028;border-radius:8px;padding:6px;margin:3px 0;}
.pm-rua-name{font-size:10px;font-weight:700;color:#8B8D97;margin-bottom:3px;padding-left:30px;}
.pm-grid{}
.pm-row{display:flex;gap:1px;margin-bottom:1px;}
.pm-ah{min-width:28px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#8B8D97;}
.pm-ph{min-width:57px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:600;color:#555;}
.pm-vao{display:flex;gap:1px;}
.pm-cell{width:28px;height:22px;border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.pm-mine{background:#00C896;border:1px solid #00C896;}
.pm-other{background:#1E2028;border:1px solid #2a2d38;}
.pm-empty{background:#111318;border:1px solid #1a1c22;}
.pm-blocked{background:#0a0a0a;color:#333;font-size:6px;border:1px solid #1a1c22;}
.pm-cl{font-size:6px;color:rgba(255,255,255,0.3);font-weight:600;line-height:1;}
.pm-cn{font-size:6px;color:#fff;font-weight:700;line-height:1;}
.pm-area{background:#0a0c12;border:1px solid #1E2028;border-radius:8px;overflow:hidden;min-width:180px;}
.pm-at{padding:5px 10px;font-size:11px;font-weight:700;}
.pm-ag{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;padding:5px;}
.pm-as{height:26px;border-radius:3px;display:flex;align-items:center;justify-content:center;}
`;

const S = {
  page:{minHeight:'100vh',background:'#08090D',fontFamily:'Outfit, sans-serif',color:'#fff'},
  loadPage:{minHeight:'100vh',background:'#08090D',display:'flex',alignItems:'center',justifyContent:'center'},
  header:{position:'sticky',top:0,zIndex:50,background:'#08090Dee',backdropFilter:'blur(20px)',borderBottom:'1px solid #1E2028',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10},
};
