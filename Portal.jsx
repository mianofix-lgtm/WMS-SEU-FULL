import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { LOGO_ICON } from './logo.js';
import { logout, getWmsData, getPerms, db } from './firebase.js';
import { doc, getDoc } from 'firebase/firestore';

const WAREHOUSE = {
  ruas: [
    { id: "R1", label: "RUA 1", vaos: 4, tipo: "seufull" },
    { id: "R2", label: "RUA 2", vaos: 10, tipo: "seufull" },
    { id: "R3", label: "RUA 3", vaos: 10, tipo: "mianofix" },
    { id: "R4", label: "RUA 4", vaos: 10, tipo: "mianofix" },
    { id: "R5", label: "RUA 5", vaos: 10, tipo: "mianofix" },
  ],
};
const LADOS = ["A","B"];
function cellId(r,v,l,a){ return `${r}-P${String(v).padStart(2,"0")}${l}-A${a}`; }

function cellHasClient(cell, clientLoja) {
  if (!cell || !clientLoja) return false;
  return cell.loja && cell.loja.trim().toUpperCase() === clientLoja.trim().toUpperCase();
}

function cellDisplay(c) {
  if (!c) return null;
  if (c.produtos && c.produtos.length > 0 && c.produtos[0].nome) {
    const first = c.produtos[0];
    const totalQtd = c.produtos.reduce((s,p) => s + (parseInt(p.qtd)||0), 0);
    return { nome: first.nome, curva: first.curva||'', qtd: totalQtd, count: c.produtos.filter(p=>p.nome).length, loja: c.loja };
  }
  if (c.nome || c.sku) return { nome: c.nome, curva: c.curva||'', qtd: parseInt(c.qtd)||0, count: 1, loja: c.loja };
  if (c.descricao || c.loja) return { nome: c.descricao, curva: '', qtd: parseInt(c.qtd)||0, count: 1, loja: c.loja };
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

  const isInternal = user?.role === 'diretor' || user?.role === 'gerente' || user?.role === 'comercial' || user?.role === 'financeiro';
  const perms = getPerms(user?.role);
  const clientLoja = user?.loja || '';

  useEffect(() => {
    loadStock();
    const interval = setInterval(loadStock, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tab === 'faturamento' && clientLoja) loadBilling();
  }, [tab, billingMonth]);

  async function loadStock() {
    try { setCells(await getWmsData() || {}); setLastSync(new Date()); } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadBilling() {
    try {
      const key = `billing_${clientLoja}_${billingMonth}`.replace(/\s/g,'_');
      const d = await getDoc(doc(db, 'billing', key));
      if (d.exists()) {
        const data = d.data();
        setBillingData({ sales: data.sales ? JSON.parse(data.sales) : [], pallets: data.pallets ? JSON.parse(data.pallets) : [] });
      } else {
        setBillingData({ sales: [], pallets: [] });
      }
    } catch(e) { setBillingData({ sales: [], pallets: [] }); }
  }

  const stockItems = useMemo(() => {
    const items = [];
    for (const [id, cell] of Object.entries(cells)) {
      if (!cell) continue;
      const prods = cell.produtos && cell.produtos.length > 0 && cell.produtos[0].nome
        ? cell.produtos.filter(p => p.nome || p.sku)
        : cell.nome ? [{sku: cell.sku, nome: cell.nome, qtd: cell.qtd, valorUnit: cell.valorUnit, curva: cell.curva}]
        : cell.descricao ? [{sku: '', nome: cell.descricao, qtd: cell.qtd, valorUnit: cell.valorUnit, curva: ''}]
        : [];
      if (prods.length === 0) continue;
      if (!isInternal && clientLoja && !cell.loja?.trim().toUpperCase().includes(clientLoja.trim().toUpperCase())) continue;
      for (const prod of prods) {
        if (search && !(prod.nome||'').toLowerCase().includes(search.toLowerCase()) && !(prod.sku||'').toLowerCase().includes(search.toLowerCase())) continue;
        items.push({ id, loja: cell.loja, ...prod });
      }
    }
    return items.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [cells, search, isInternal, clientLoja]);

  const totalQtd = stockItems.reduce((s, i) => s + (parseInt(i.qtd) || 0), 0);
  const totalSkus = new Set(stockItems.map(i => i.sku).filter(Boolean)).size;

  const clientPositions = useMemo(() => {
    let count = 0;
    Object.values(cells).forEach(c => {
      if (isInternal || cellHasClient(c, clientLoja)) {
        const cd = cellDisplay(c);
        if (cd) count++;
      }
    });
    return count;
  }, [cells, clientLoja, isInternal]);

  async function handleLogout() { await logout(); setUser(null); nav('/login'); }

  if (loading) return <div style={S.loadingPage}><div style={{color:'#00C896',fontFamily:'Outfit',fontSize:16}}>Carregando...</div></div>;

  return (
    <div style={S.page}>
      <style>{MAP_CSS}</style>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <Link to="/" style={S.logoLink}>
            <img src={LOGO_ICON} alt="Seu Full" style={{width:36,height:36,borderRadius:9}} />
            <div style={S.logoText}>Seu<span style={{color:'#00C896'}}>Full</span></div>
          </Link>
          <div style={S.headerBadge}>Portal do Cliente</div>
        </div>
        <div style={S.headerRight}>
          <div style={S.userInfo}>
            <div style={S.userName}>{user?.nome || user?.email}</div>
            <div style={S.userRole}>{user?.role === 'cliente' ? user?.loja : user?.role}</div>
          </div>
          {user?.role === 'diretor' && <Link to="/admin" style={{...S.navLink, color:'#fbbf24'}}>Admin</Link>}
          {(user?.role === 'diretor' || user?.role === 'comercial') && <Link to="/billing" style={{...S.navLink, color:'#f97316'}}>Faturamento</Link>}
          {perms.canEdit && <Link to="/wms" style={S.navLink}>WMS</Link>}
          <button onClick={handleLogout} style={S.logoutBtn}>Sair</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.welcome}>
          <h1 style={S.welcomeTitle}>Bem-vindo{user?.nome ? `, ${user.nome.split(' ')[0]}` : ''}</h1>
          <p style={S.welcomeSub}>
            {isInternal ? 'Visão geral do estoque' : `${clientLoja}`}
            {lastSync && <span style={{color:'#8B8D97',fontSize:13}}> · Atualizado {lastSync.toLocaleTimeString('pt-BR')}</span>}
          </p>
        </div>

        {/* KPIs */}
        <div style={S.kpiRow}>
          <div style={S.kpi}><div style={S.kpiLabel}>SKUs</div><div style={S.kpiValue}>{totalSkus}</div></div>
          <div style={S.kpi}><div style={S.kpiLabel}>Unidades</div><div style={S.kpiValue}>{totalQtd.toLocaleString('pt-BR')}</div></div>
          <div style={S.kpi}><div style={S.kpiLabel}>Posições</div><div style={S.kpiValue}>{clientPositions}</div></div>
          <div style={S.kpi}><div style={S.kpiLabel}>Produtos</div><div style={S.kpiValue}>{stockItems.length}</div></div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {['estoque','mapa','faturamento'].map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{...S.tabBtn,...(tab===t?{background:'#fff',color:'#0F1117'}:{})}}>{
              t === 'estoque' ? 'Estoque' : t === 'mapa' ? 'Mapa do Galpão' : 'Faturamento'
            }</button>
          ))}
        </div>

        {/* ─── ESTOQUE ─── */}
        {tab === 'estoque' && (
          <div>
            <div style={S.searchRow}>
              <input style={S.searchInput} placeholder="Buscar por nome ou SKU..." value={search} onChange={e => setSearch(e.target.value)} />
              <button onClick={loadStock} style={S.refreshBtn}>↻ Atualizar</button>
            </div>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Endereço</th><th style={S.th}>SKU</th><th style={S.th}>Produto</th><th style={S.th}>Curva</th>
                  {isInternal && <th style={S.th}>Loja</th>}
                  <th style={{...S.th,textAlign:'right'}}>Qtd</th>
                </tr></thead>
                <tbody>
                  {stockItems.length === 0 ? (
                    <tr><td colSpan={6} style={{...S.td,textAlign:'center',color:'#8B8D97',padding:'40px 16px'}}>
                      {search ? 'Nenhum produto encontrado.' : 'Nenhum produto em estoque.'}
                    </td></tr>
                  ) : stockItems.map((item, i) => (
                    <tr key={`${item.id}-${i}`} style={{background:i%2===0?'transparent':'#0F111708'}}>
                      <td style={{...S.td,fontWeight:700,color:'#00C896',fontFamily:'monospace',fontSize:12}}>{item.id}</td>
                      <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{item.sku||'-'}</td>
                      <td style={{...S.td,maxWidth:300}}>{item.nome||'-'}</td>
                      <td style={S.td}>{item.curva && <span style={{padding:'3px 10px',borderRadius:6,fontSize:12,fontWeight:700,background:item.curva==='A'?'#dc262620':item.curva==='B'?'#d9770620':'#16a34a20',color:item.curva==='A'?'#fca5a5':item.curva==='B'?'#fcd34d':'#86efac'}}>{item.curva}</span>}</td>
                      {isInternal && <td style={{...S.td,fontSize:13}}>{item.loja||'-'}</td>}
                      <td style={{...S.td,textAlign:'right',fontWeight:700}}>{parseInt(item.qtd||0).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── MAPA ─── */}
        {tab === 'mapa' && (
          <div>
            <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,padding:'14px 20px',marginBottom:16,display:'flex',gap:20,alignItems:'center',flexWrap:'wrap',fontSize:13}}>
              <span><span style={{display:'inline-block',width:14,height:14,background:'#00C896',borderRadius:3,verticalAlign:'middle',marginRight:6}}></span> {isInternal ? 'Ocupado' : `Suas posições (${clientLoja})`}</span>
              <span><span style={{display:'inline-block',width:14,height:14,background:'#1E2028',borderRadius:3,verticalAlign:'middle',marginRight:6}}></span> {isInternal ? '-' : 'Outras lojas'}</span>
              <span><span style={{display:'inline-block',width:14,height:14,background:'#111318',border:'1px solid #1a1c22',borderRadius:3,verticalAlign:'middle',marginRight:6}}></span> Vazio</span>
            </div>

            <div className="pm-map">
              <div className="pm-label">PAREDE</div>

              {WAREHOUSE.ruas.map((rua, ri) => {
                const showCorredor = ri === 0 || ri === 2;
                const showCostas = ri === 1 || ri === 3;
                return (
                  <div key={rua.id}>
                    <div className="pm-rua">
                      <div className="pm-rua-name">{rua.label}</div>
                      <div className="pm-grid">
                        <div className="pm-row">
                          <span className="pm-ah"></span>
                          {Array.from({length:rua.vaos},(_,i)=>i+1).map(v=><span key={v} className="pm-ph">P{String(v).padStart(2,'0')}</span>)}
                        </div>
                        {(rua.id === "R2" || rua.id === "R4" ? [1,2,3,4] : [4,3,2,1]).map(a => (
                          <div key={a} className="pm-row">
                            <span className="pm-ah">A{a}</span>
                            {Array.from({length:rua.vaos},(_,i)=>i+1).map(v => (
                              <div key={v} className="pm-vao">
                                {LADOS.map(l => {
                                  if (rua.vaos === 10 && v === rua.vaos && (a===1||a===2)) return <div key={l} className="pm-cell pm-blocked">✕</div>;
                                  const id = cellId(rua.id,v,l,a);
                                  const c = cells[id];
                                  const cd = cellDisplay(c);
                                  const isMine = isInternal ? !!cd : cellHasClient(c, clientLoja);
                                  const hasContent = !!cd;
                                  return (
                                    <div key={l} className={`pm-cell ${isMine?'pm-mine':hasContent?'pm-other':'pm-empty'}`}
                                      title={isMine && cd ? `${cd.loja||''} — ${cd.nome||''} (${cd.qtd} un)` : hasContent ? 'Outra loja' : 'Vazio'}>
                                      <span className="pm-cell-l">{l}</span>
                                      {isMine && cd && <span className="pm-cell-name">{cd.count > 1 ? `${cd.count}SKU` : (cd.nome||'').substring(0,5)}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                    {showCostas && <div className="pm-costas">COSTAS</div>}
                    {showCorredor && <div className="pm-corredor">CORREDOR</div>}
                  </div>
                );
              })}

              <div className="pm-corredor">CORREDOR</div>

              <div style={{display:'flex',gap:12,marginTop:12}}>
                <div className="pm-area">
                  <div className="pm-area-title" style={{background:'#00C896',color:'#2E2C3A'}}>Estoque Flex (60)</div>
                  <div className="pm-area-grid">
                    {Array.from({length:60},(_,i)=>`FLEX-${i+1}`).map(s => {
                      const c = cells[s]; const cd = cellDisplay(c);
                      const isMine = isInternal ? !!cd : cellHasClient(c, clientLoja);
                      return <div key={s} className={`pm-area-slot ${isMine?'pm-mine':cd?'pm-other':'pm-empty'}`} title={isMine && cd?`${cd.loja} — ${cd.nome} (${cd.qtd})`:s}>
                        {isMine && cd && <span style={{fontSize:7,color:'#fff',fontWeight:700}}>{(cd.nome||'').substring(0,4)}</span>}
                      </div>;
                    })}
                  </div>
                </div>
                <div className="pm-area" style={{flex:1}}>
                  <div className="pm-area-title" style={{background:'#1e3a5f',color:'#fff'}}>Full Pronto (40)</div>
                  <div className="pm-area-grid" style={{gridTemplateColumns:'repeat(8,1fr)'}}>
                    {Array.from({length:40},(_,i)=>`FULL-${i+1}`).map(s => {
                      const c = cells[s]; const cd = cellDisplay(c);
                      const isMine = isInternal ? !!cd : cellHasClient(c, clientLoja);
                      return <div key={s} className={`pm-area-slot ${isMine?'pm-mine':cd?'pm-other':'pm-empty'}`} style={{height:36}} title={isMine && cd?`${cd.loja} — ${cd.nome} (${cd.qtd})`:s}>
                        {isMine && cd && <span style={{fontSize:7,color:'#fff',fontWeight:700}}>{(cd.loja||'').substring(0,4)}</span>}
                      </div>;
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── FATURAMENTO ─── */}
        {tab === 'faturamento' && (
          <div>
            <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:20}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',marginBottom:4}}>Mês de referência</div>
                <input type="month" value={billingMonth} onChange={e=>setBillingMonth(e.target.value)} style={S.monthInput} />
              </div>
              <div style={{marginLeft:'auto',textAlign:'right'}}>
                <div style={{fontSize:11,color:'#8B8D97'}}>Posições ocupadas</div>
                <div style={{fontSize:24,fontWeight:900,color:'#00C896'}}>{clientPositions}</div>
              </div>
            </div>

            {!billingData ? (
              <div style={{textAlign:'center',color:'#8B8D97',padding:40}}>Carregando faturamento...</div>
            ) : (
              <div style={S.tableWrap}>
                <div style={{padding:24}}>
                  <h3 style={{fontSize:18,fontWeight:800,marginBottom:20}}>Fatura — {clientLoja || 'Todos'} — {new Date(billingMonth+'-15').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h3>
                  
                  <div style={{fontSize:13,fontWeight:700,color:'#00C896',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Armazenagem — Posições Ocupadas</div>
                  <table style={S.table}>
                    <thead><tr>
                      <th style={S.th}>Endereço</th><th style={S.th}>Produto</th><th style={{...S.th,textAlign:'right'}}>Qtd</th><th style={S.th}>Entrada</th>
                    </tr></thead>
                    <tbody>
                      {Object.entries(cells).filter(([, cell]) => isInternal ? cellDisplay(cell) : cellHasClient(cell, clientLoja)).sort(([a],[b])=>a.localeCompare(b)).map(([id, cell]) => {
                        const dt = cell.dataEntrada ? new Date(cell.dataEntrada+'T00:00:00').toLocaleDateString('pt-BR') : '-';
                        return (
                          <tr key={id}>
                            <td style={{...S.td,fontFamily:'monospace',color:'#00C896',fontWeight:700,fontSize:12}}>{id}</td>
                            <td style={S.td}>{cell.produtos && cell.produtos[0]?.nome ? cell.produtos.map(p=>`${p.nome} (${p.qtd||0})`).join(', ') : cell.nome || cell.descricao || '-'}</td>
                            <td style={{...S.td,textAlign:'right',fontWeight:700}}>{cell.produtos ? cell.produtos.reduce((s,p)=>s+(parseInt(p.qtd)||0),0) : cell.qtd || '-'}</td>
                            <td style={{...S.td,fontSize:12,color:'#8B8D97'}}>{dt}</td>
                          </tr>
                        );
                      })}
                      <tr style={{background:'#00C89610'}}>
                        <td style={{...S.td,fontWeight:800}} colSpan={2}>Total: {clientPositions} posições</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:800}}>{totalQtd.toLocaleString('pt-BR')} un</td>
                        <td style={S.td}></td>
                      </tr>
                    </tbody>
                  </table>

                  {billingData.sales.length > 0 && <>
                    <div style={{fontSize:13,fontWeight:700,color:'#00C896',textTransform:'uppercase',letterSpacing:1,marginBottom:10,marginTop:28}}>Serviços Prestados</div>
                    <table style={S.table}>
                      <thead><tr>
                        <th style={S.th}>Data</th><th style={S.th}>Nº Venda</th><th style={S.th}>Serviço</th><th style={S.th}>Produto</th><th style={{...S.th,textAlign:'right'}}>Qtd</th><th style={{...S.th,textAlign:'right'}}>Valor</th>
                      </tr></thead>
                      <tbody>
                        {billingData.sales.map((s,i) => (
                          <tr key={i}>
                            <td style={{...S.td,fontSize:12,color:'#8B8D97'}}>{new Date(s.data).toLocaleDateString('pt-BR')}</td>
                            <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{s.numero||'-'}</td>
                            <td style={S.td}><span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,background:'#00C89620',color:'#00C896'}}>{s.canal}</span></td>
                            <td style={S.td}>{s.produto||'-'}</td>
                            <td style={{...S.td,textAlign:'right'}}>{s.qtd}</td>
                            <td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {(s.valor||0).toFixed(2)}</td>
                          </tr>
                        ))}
                        <tr style={{background:'#00C89610'}}>
                          <td style={{...S.td,fontWeight:800}} colSpan={5}>Total Serviços</td>
                          <td style={{...S.td,textAlign:'right',fontWeight:800,color:'#00C896'}}>R$ {billingData.sales.reduce((s,v)=>s+(v.valor||0),0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                        </tr>
                      </tbody>
                    </table>
                  </>}

                  {billingData.sales.length === 0 && (
                    <div style={{textAlign:'center',color:'#8B8D97',padding:'24px',fontSize:14,marginTop:16}}>Nenhum serviço registrado neste mês.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const MAP_CSS = `
.pm-map{background:#0F1117;border:1px solid #1E2028;border-radius:14px;padding:16px;overflow-x:auto;}
.pm-map > *{min-width:900px;}
.pm-label{text-align:center;font-size:10px;font-weight:700;color:#8B8D97;letter-spacing:2px;padding:4px;background:#1E2028;border-radius:4px;margin-bottom:8px;}
.pm-corredor{text-align:center;font-size:10px;font-weight:700;color:#3b82f6;letter-spacing:2px;padding:6px;background:#1e3a5f15;border:1px dashed #3b82f640;border-radius:4px;margin:6px 0;}
.pm-costas{text-align:center;font-size:9px;color:#8B8D97;padding:2px;letter-spacing:1px;}
.pm-rua{background:#0a0c12;border:1px solid #1E2028;border-radius:8px;padding:8px;margin:4px 0;}
.pm-rua-name{font-size:11px;font-weight:700;color:#8B8D97;margin-bottom:4px;padding-left:30px;}
.pm-grid{overflow-x:auto;}
.pm-row{display:flex;gap:1px;margin-bottom:1px;}
.pm-ah{min-width:28px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#8B8D97;}
.pm-ph{min-width:57px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:600;color:#555;}
.pm-vao{display:flex;gap:1px;}
.pm-cell{width:28px;height:24px;border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;}
.pm-mine{background:#00C896;border:1px solid #00C896;}
.pm-other{background:#1E2028;border:1px solid #2a2d38;}
.pm-empty{background:#111318;border:1px solid #1a1c22;}
.pm-blocked{background:#0a0a0a;color:#333;font-size:6px;border:1px solid #1a1c22;}
.pm-cell-l{font-size:6px;color:rgba(255,255,255,0.4);font-weight:600;line-height:1;}
.pm-cell-name{color:#fff;font-weight:700;font-size:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:24px;line-height:1;}
.pm-area{background:#0a0c12;border:1px solid #1E2028;border-radius:8px;overflow:hidden;min-width:200px;}
.pm-area-title{padding:6px 12px;font-size:12px;font-weight:700;}
.pm-area-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;padding:6px;}
.pm-area-slot{height:28px;border-radius:3px;display:flex;align-items:center;justify-content:center;}
`;

const S = {
  page: { minHeight:'100vh', background:'#08090D', fontFamily:'Outfit, sans-serif', color:'#fff' },
  loadingPage: { minHeight:'100vh', background:'#08090D', display:'flex', alignItems:'center', justifyContent:'center' },
  header: { position:'sticky', top:0, zIndex:50, background:'#08090Dee', backdropFilter:'blur(20px)', borderBottom:'1px solid #1E2028', padding:'14px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 },
  headerLeft: { display:'flex', alignItems:'center', gap:16 },
  logoLink: { display:'flex', alignItems:'center', gap:10, textDecoration:'none' },
  logoText: { fontSize:20, fontWeight:800, color:'#fff', letterSpacing:-0.5 },
  headerBadge: { padding:'6px 14px', background:'#00C89620', border:'1px solid #00C89633', borderRadius:100, fontSize:12, fontWeight:600, color:'#00C896' },
  headerRight: { display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' },
  userInfo: { textAlign:'right', marginRight:8 },
  userName: { fontSize:14, fontWeight:600, color:'#fff' },
  userRole: { fontSize:12, color:'#8B8D97', textTransform:'capitalize' },
  navLink: { padding:'6px 14px', background:'#161820', border:'1px solid #1E2028', borderRadius:6, color:'#00C896', fontSize:12, fontWeight:600, textDecoration:'none' },
  logoutBtn: { padding:'6px 14px', background:'transparent', border:'1px solid #1E2028', borderRadius:6, color:'#8B8D97', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit' },
  main: { maxWidth:1280, margin:'0 auto', padding:'24px 32px' },
  welcome: { marginBottom:20 },
  welcomeTitle: { fontSize:26, fontWeight:800, letterSpacing:-0.5, marginBottom:6 },
  welcomeSub: { fontSize:15, color:'#C0C2CC' },
  kpiRow: { display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' },
  kpi: { flex:1, minWidth:130, background:'#0F1117', border:'1px solid #1E2028', borderRadius:14, padding:'14px 18px' },
  kpiLabel: { fontSize:11, fontWeight:600, color:'#8B8D97', textTransform:'uppercase', letterSpacing:1 },
  kpiValue: { fontSize:26, fontWeight:900, marginTop:4, letterSpacing:-1 },
  tabs: { display:'flex', gap:4, marginBottom:20, background:'#0F1117', padding:4, borderRadius:10, border:'1px solid #1E2028' },
  tabBtn: { padding:'10px 24px', fontFamily:'inherit', fontSize:14, fontWeight:600, border:'none', borderRadius:8, cursor:'pointer', background:'transparent', color:'#8B8D97', transition:'.15s' },
  searchRow: { display:'flex', gap:12, marginBottom:20 },
  searchInput: { flex:1, padding:'12px 18px', background:'#0F1117', border:'1.5px solid #1E2028', borderRadius:10, color:'#fff', fontSize:14, fontFamily:'inherit', outline:'none' },
  refreshBtn: { padding:'12px 20px', background:'#161820', border:'1px solid #1E2028', borderRadius:10, color:'#00C896', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' },
  monthInput: { padding:'10px 14px', background:'#161820', border:'1.5px solid #1E2028', borderRadius:8, color:'#fff', fontSize:14, fontFamily:'inherit', outline:'none' },
  tableWrap: { background:'#0F1117', border:'1px solid #1E2028', borderRadius:14, overflow:'auto' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:14 },
  th: { textAlign:'left', padding:'12px 16px', borderBottom:'1px solid #1E2028', fontSize:11, fontWeight:700, color:'#8B8D97', textTransform:'uppercase', letterSpacing:.5, whiteSpace:'nowrap' },
  td: { padding:'10px 16px', borderBottom:'1px solid #1E202880', whiteSpace:'nowrap' },
};
