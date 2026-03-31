import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./App.jsx";
import { getPerms, logout, getWmsData, saveWmsData, db } from "./firebase.js";
import { LOGO_ICON } from "./logo.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

const CURVA_COLORS = { A: "#dc2626", B: "#d97706", C: "#16a34a", "": "#94a3b8" };
const WAREHOUSE = {
  ruas: [
    { id: "R1", label: "RUA 1", vaos: 4,  andares: 4, tipo: "seufull"  },
    { id: "R2", label: "RUA 2", vaos: 10, andares: 4, tipo: "seufull"  },
    { id: "R3", label: "RUA 3", vaos: 10, andares: 4, tipo: "mianofix" },
    { id: "R4", label: "RUA 4", vaos: 10, andares: 4, tipo: "mianofix" },
    { id: "R5", label: "RUA 5", vaos: 10, andares: 4, tipo: "mianofix" },
  ],
};
const LADOS = ["A","B"];
const EMPTY = { sku:"", nome:"", qtd:"", valorUnit:"", curva:"", loja:"", obs:"" };
const EMPTY_AREA = { descricao:"", loja:"", qtd:"", valorUnit:"", obs:"", paletes:"", dataEntrada:"" };
const fullSlots = Array.from({length:40},(_,i)=>`FULL-${i+1}`);
const flexSlots = Array.from({length:60},(_,i)=>`FLEX-${i+1}`);
const prodSlots = Array.from({length:30},(_,i)=>`PROD-${i+1}`);
const recebSlots = Array.from({length:30},(_,i)=>`RECEB-${i+1}`);

function cellId(r,v,l,a){ return `${r}-P${String(v).padStart(2,"0")}${l}-A${a}`; }

export default function Wms() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [cells, setCells] = useState({});
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [areaForm, setAreaForm] = useState(EMPTY_AREA);
  const [selType, setSelType] = useState(null); // 'rua','full','flex'
  const [tab, setTab] = useState("mapa");
  const [toast, setToast] = useState(null);
  const [cloudStatus, setCloudStatus] = useState("loading");
  const [search, setSearch] = useState("");
  const [coletaHistory, setColetaHistory] = useState([]);
  const [selectedColeta, setSelectedColeta] = useState(new Set());

  // Permissions
  const perms = getPerms(user?.role);
  const canDelete = perms.canDelete;
  const canSeeValues = perms.canSeeValues;
  const canEdit = perms.canEdit;
  const canEditValues = perms.canEditValues;

  // Load from Firebase
  useEffect(() => {
    loadCloud();
    loadColetaHistory();
  }, []);

  async function loadColetaHistory() {
    try {
      const d = await getDoc(doc(db, 'wms', 'coletas'));
      if (d.exists() && d.data().history) setColetaHistory(JSON.parse(d.data().history));
    } catch(e) { console.error(e); }
  }

  function toggleColetaItem(slot) {
    setSelectedColeta(prev => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot); else next.add(slot);
      return next;
    });
  }

  function selectAllForColeta() {
    const all = fullSlots.filter(s => { const c = cells[s]; return c && (c.descricao || c.loja); });
    setSelectedColeta(new Set(all));
  }

  async function arquivarColeta() {
    const items = [...selectedColeta].filter(s => cells[s] && (cells[s].descricao || cells[s].loja));
    if (items.length === 0) { showToast("Selecione itens para coletar", "warn"); return; }
    if (!confirm(`Arquivar ${items.length} posições como coletadas?`)) return;
    const pal = items.reduce((s,slot) => s + (parseInt(cells[slot]?.paletes)||1), 0);
    const val = items.reduce((s,slot) => { const c=cells[slot]; return s + (parseInt(c?.qtd)||0)*(parseFloat(c?.valorUnit)||0); }, 0);
    const archived = { date: new Date().toISOString(), items: items.map(s => ({slot: s, ...cells[s]})), paletes: pal, valor: val };
    const next = {...cells};
    items.forEach(s => delete next[s]);
    setCells(next);
    setSelectedColeta(new Set());
    const newHistory = [archived, ...coletaHistory].slice(0, 50);
    setColetaHistory(newHistory);
    try {
      await saveWmsData(next);
      await setDoc(doc(db, 'wms', 'coletas'), { history: JSON.stringify(newHistory), updatedAt: new Date().toISOString() });
      showToast(`${items.length} posições coletadas!`);
    } catch(e) { showToast("Erro ao arquivar", "warn"); }
  }

  async function loadCloud() {
    try {
      const data = await getWmsData();
      if (data && Object.keys(data).length > 0) {
        setCells(data);
      }
      setCloudStatus("ok");
    } catch (e) {
      console.error(e);
      setCloudStatus("error");
    }
  }

  function showToast(msg, type="ok") {
    setToast({msg, type});
    setTimeout(()=>setToast(null), 3000);
  }

  function openCell(id, type="rua") {
    setSelType(type);
    setSel(id);
    if (type === "rua") {
      setForm(cells[id] ? {...EMPTY, ...cells[id]} : {...EMPTY});
    } else {
      setAreaForm(cells[id] ? {...EMPTY_AREA, ...cells[id]} : {...EMPTY_AREA});
    }
  }

  async function saveCell() {
    const data = selType === "rua" ? form : areaForm;
    const next = {...cells, [sel]: data};
    setCells(next);
    try {
      await saveWmsData(next);
      showToast("Salvo na nuvem ☁️");
    } catch(e) {
      showToast("Erro ao salvar", "warn");
    }
    setSel(null);
  }

  async function clearCell() {
    if (!canDelete) { showToast("Sem permissão para apagar", "warn"); return; }
    if (!confirm("Tem certeza que deseja limpar esta posição?")) return;
    const next = {...cells};
    delete next[sel];
    setCells(next);
    try {
      await saveWmsData(next);
      showToast("Posição limpa");
    } catch(e) {
      showToast("Erro ao limpar", "warn");
    }
    setSel(null);
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    nav('/login');
  }

  // Stats
  const stats = useMemo(() => {
    let skus=0, items=0, value=0;
    Object.values(cells).forEach(c => {
      if (c.nome || c.descricao) {
        skus++;
        const q = parseInt(c.qtd)||0;
        items += q;
        value += q * (parseFloat(c.valorUnit)||0);
      }
    });
    return { skus, items, value };
  }, [cells]);

  // Inventory list
  const inventory = useMemo(() => {
    return Object.entries(cells)
      .filter(([,c]) => c.nome || c.descricao)
      .filter(([id, c]) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (c.nome||'').toLowerCase().includes(s) || (c.sku||'').toLowerCase().includes(s) || (c.descricao||'').toLowerCase().includes(s) || id.toLowerCase().includes(s);
      })
      .sort(([a],[b]) => a.localeCompare(b));
  }, [cells, search]);

  // Full Pronto stats
  const fullStats = useMemo(() => {
    let paletes=0, valor=0, occupied=0;
    const byDate = {};
    fullSlots.forEach(s => {
      const c = cells[s];
      if (c && (c.descricao || c.loja)) {
        occupied++;
        const p = parseInt(c.paletes)||1;
        const v = (parseInt(c.qtd)||0) * (parseFloat(c.valorUnit)||0);
        paletes += p;
        valor += v;
        const dt = c.dataEntrada || 'sem-data';
        if (!byDate[dt]) byDate[dt] = {paletes:0, valor:0, items:[]};
        byDate[dt].paletes += p;
        byDate[dt].valor += v;
        byDate[dt].items.push({slot: s, loja: c.loja, descricao: c.descricao, qtd: c.qtd, valorUnit: c.valorUnit, paletes: p, valor: v, dataEntrada: c.dataEntrada});
      }
    });
    return { paletes, valor, occupied, byDate };
  }, [cells]);

  return (
    <>
      <style>{WMS_CSS}</style>
      <div className="wms">
        {/* Header */}
        <header className="wms-header">
          <div className="wms-header-left">
            <Link to="/" className="wms-logo-link">
              <img src={LOGO_ICON} alt="Seu Full" className="wms-logo-icon" style={{width:32,height:32,borderRadius:8}} />
              <div className="wms-logo-text">WMS <span>SEU FULL</span></div>
            </Link>
            <div className="wms-cloud" data-status={cloudStatus}>
              {cloudStatus==="ok"?"☁ Conectado":cloudStatus==="error"?"⚠ Erro":"⏳ Conectando..."}
            </div>
          </div>
          <div className="wms-header-right">
            <div className="wms-user">
              <span className="wms-user-name">{user?.nome || user?.email}</span>
              <span className="wms-user-role">{user?.role}</span>
            </div>
            {user?.role === "diretor" && <Link to="/admin" className="wms-portal-link" style={{color:"#fbbf24"}}>Admin</Link>}
            {(user?.role === "diretor" || user?.role === "comercial") && <Link to="/billing" className="wms-portal-link" style={{color:"#f97316"}}>Faturamento</Link>}
            <Link to="/portal" className="wms-portal-link">Portal</Link>
            <button onClick={handleLogout} className="wms-logout">Sair</button>
          </div>
        </header>

        {/* Tabs */}
        <div className="wms-tabs">
          <button className={`wms-tab ${tab==="mapa"?"on":""}`} onClick={()=>setTab("mapa")}>Mapa</button>
          <button className={`wms-tab ${tab==="inventario"?"on":""}`} onClick={()=>setTab("inventario")}>Inventário</button>
          {canSeeValues && <button className={`wms-tab ${tab==="financeiro"?"on":""}`} onClick={()=>setTab("financeiro")}>Financeiro</button>}
          <div className="wms-kpis">
            <div className="wms-kpi"><span className="wms-kpi-l">SKUs</span><span className="wms-kpi-v">{stats.skus}</span></div>
            <div className="wms-kpi"><span className="wms-kpi-l">Itens</span><span className="wms-kpi-v">{stats.items.toLocaleString("pt-BR")}</span></div>
            {canSeeValues && <div className="wms-kpi"><span className="wms-kpi-l">Valor</span><span className="wms-kpi-v" style={{color:'#00C896'}}>R$ {stats.value.toLocaleString("pt-BR",{minimumFractionDigits:2})}</span></div>}
          </div>
        </div>

        {/* Map Tab */}
        {tab === "mapa" && (
          <div className="wms-map">
            <div className="wms-map-inner">
            <div className="wms-map-label">PAREDE</div>

            {/* Row 1: Produção + Rua 1 */}
            <div className="wms-map-row">
              <div className="wms-area-box" style={{minWidth:280}}>
                <div className="wms-area-title" style={{background:'#7c3aed',color:'#fff'}}>Produção <span>({prodSlots.length})</span></div>
                <div className="wms-flex-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
                  {prodSlots.map(s => {
                    const c = cells[s]; const has = c && (c.descricao || c.loja);
                    return (
                      <div key={s} className={`wms-flex-slot ${has?"filled":""}`} style={has?{background:'#7c3aed15',borderColor:'#7c3aed'}:{}} onClick={()=>openCell(s,"flex")} title={has?`${c.loja} - ${c.descricao}`:s}>
                        <span className="wms-flex-num">{s.replace("PROD-","P")}</span>
                        {has ? <span className="wms-flex-loja" style={{color:'#c4b5fd'}}>{c.loja||c.descricao||"-"}</span> : <span style={{color:'#c4b5fd'}}>+</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Rua 1 */}
              {(() => { const rua = WAREHOUSE.ruas[0]; return (
                <div className="wms-rua-block" style={{flex:1}}>
                  <div className="wms-rua-label" data-tipo={rua.tipo}>{rua.label} <span>(Clientes Seu Full)</span></div>
                  <div className="wms-rua-grid">
                    <div className="wms-rua-head"><span></span>{Array.from({length:rua.vaos},(_,i)=>i+1).map(v=><span key={v} className="wms-col-head">P{String(v).padStart(2,"0")}</span>)}</div>
                    {[4,3,2,1].map(a => (
                      <div key={a} className="wms-rua-row"><span className="wms-row-head">A{a}</span>
                        {Array.from({length:rua.vaos},(_,i)=>i+1).map(v => (
                          <div key={v} className="wms-vao">{LADOS.map(l => {
                            const id = cellId(rua.id,v,l,a); const c = cells[id]; const has = c && (c.nome||c.sku); const curva = c?.curva||"";
                            return <div key={l} className={`wms-cell ${has?"wms-cell-filled":"wms-cell-empty"}`} data-curva={curva} onClick={()=>openCell(id,"rua")} title={has?`${c.nome} (${c.qtd})`:id}><span className="wms-cell-lado">{l}</span>{has?<span className="wms-cell-name">{c.nome?.substring(0,8)}</span>:<span className="wms-cell-plus">+</span>}</div>;
                          })}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );})()}
            </div>

            <div className="wms-corredor">CORREDOR</div>

            {/* Ruas 2-5 */}
            {WAREHOUSE.ruas.slice(1).map((rua, ri) => {
              const showCostas = ri === 0 || ri === 2;
              const showCorredor = ri === 1;
              return (
                <div key={rua.id}>
                  <div className="wms-rua-block">
                    <div className="wms-rua-label" data-tipo={rua.tipo}>{rua.label} <span>({rua.tipo === "seufull" ? "Clientes Seu Full" : "Mianofix / Iscali"})</span></div>
                    <div className="wms-rua-grid">
                      <div className="wms-rua-head"><span></span>{Array.from({length:rua.vaos},(_,i)=>i+1).map(v=><span key={v} className="wms-col-head">P{String(v).padStart(2,"0")}</span>)}</div>
                      {(rua.id === "R2" || rua.id === "R4" ? [1,2,3,4] : [4,3,2,1]).map(a => (
                        <div key={a} className="wms-rua-row"><span className="wms-row-head">A{a}</span>
                          {Array.from({length:rua.vaos},(_,i)=>i+1).map(v => (
                            <div key={v} className="wms-vao">{LADOS.map(l => {
                              if (rua.vaos === 10 && v === rua.vaos && (a === 1 || a === 2)) return <div key={l} className="wms-cell wms-cell-blocked" title="Sem longarina">✕</div>;
                              const id = cellId(rua.id,v,l,a); const c = cells[id]; const has = c && (c.nome||c.sku); const curva = c?.curva||"";
                              return <div key={l} className={`wms-cell ${has?"wms-cell-filled":"wms-cell-empty"}`} data-curva={curva} onClick={()=>openCell(id,"rua")} title={has?`${c.nome} (${c.qtd})`:id}><span className="wms-cell-lado">{l}</span>{has?<span className="wms-cell-name">{c.nome?.substring(0,8)}</span>:<span className="wms-cell-plus">+</span>}</div>;
                            })}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  {showCostas && <div className="wms-costas">COSTAS</div>}
                  {showCorredor && <div className="wms-corredor">CORREDOR</div>}
                </div>
              );
            })}

            <div className="wms-corredor">CORREDOR</div>

            {/* Row bottom: Recebimento + Flex + Full */}
            <div className="wms-map-row" style={{marginTop:12}}>
              <div className="wms-area-box" style={{minWidth:260}}>
                <div className="wms-area-title" style={{background:'#0891b2',color:'#fff'}}>Recebimento <span>({recebSlots.length})</span></div>
                <div className="wms-flex-grid" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
                  {recebSlots.map(s => {
                    const c = cells[s]; const has = c && (c.descricao || c.loja);
                    return (
                      <div key={s} className={`wms-flex-slot ${has?"filled":""}`} style={has?{background:'#0891b215',borderColor:'#0891b2'}:{}} onClick={()=>openCell(s,"flex")} title={has?`${c.loja} - ${c.descricao}`:s}>
                        <span className="wms-flex-num">{s.replace("RECEB-","R")}</span>
                        {has ? <span className="wms-flex-loja" style={{color:'#67e8f9'}}>{c.loja||c.descricao||"-"}</span> : <span style={{color:'#67e8f9'}}>+</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="wms-area-box" style={{flex:1}}>
                <div className="wms-area-title" style={{background:'#00C896',color:'#2E2C3A'}}>Estoque Flex <span>({flexSlots.length} gavetas)</span></div>
                <div className="wms-flex-grid">
                  {flexSlots.map(s => {
                    const c = cells[s]; const has = c && (c.descricao || c.loja);
                    return (
                      <div key={s} className={`wms-flex-slot ${has?"filled":""}`} onClick={()=>openCell(s,"flex")} title={has?`${c.loja} - ${c.descricao}`:s}>
                        <span className="wms-flex-num">{s.replace("FLEX-","")}</span>
                        {has ? <span className="wms-flex-loja">{c.loja||"-"}</span> : <span style={{color:'#86efac'}}>+</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Full Pronto in same row */}
              <div className="wms-area-box" style={{flex:1}}>
                <div className="wms-area-title" style={{background:'#1e3a5f',color:'#fff'}}>
                  Full Pronto <span>({fullStats.paletes}/28 paletes)</span>
                </div>
                {canSeeValues && (
                  <div className="wms-full-dash">
                    <div className="wms-full-stat">
                      <div className="wms-full-stat-l">Paletes</div>
                      <div className="wms-full-stat-v">{fullStats.paletes}/28</div>
                      <div className="wms-full-bar"><div style={{width:`${Math.min(100,fullStats.paletes/28*100)}%`,background:fullStats.paletes>24?'#dc2626':'#00C896'}}></div></div>
                    </div>
                    <div className="wms-full-stat">
                      <div className="wms-full-stat-l">Valor Total</div>
                      <div className="wms-full-stat-v" style={{color:fullStats.valor>900000?'#fbbf24':'#00C896'}}>R$ {fullStats.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                      <div className="wms-full-bar"><div style={{width:`${Math.min(100,fullStats.valor/1000000*100)}%`,background:fullStats.valor>900000?'#fbbf24':'#00C896'}}></div></div>
                    </div>
                    <div className="wms-full-stat">
                      <div className="wms-full-stat-l">SKUs no Full</div>
                      <div className="wms-full-stat-v">{fullStats.occupied}</div>
                    </div>
                    <div className="wms-full-stat">
                      <div className="wms-full-stat-l">Limite Restante</div>
                      <div className="wms-full-stat-v" style={{fontSize:14,color:'#C0C2CC'}}>R$ {(1000000-fullStats.valor).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                    </div>
                  </div>
                )}
                {/* Coleta schedule */}
                <div style={{display:'flex',gap:8,padding:'6px 12px',flexWrap:'wrap'}}>
                  {(() => {
                    const now = new Date();
                    const getNext = (day) => { const d = new Date(now); d.setDate(d.getDate()+((day-d.getDay()+7)%7)||7); return d; };
                    const nextSeg = getNext(1);
                    const nextSex = getNext(5);
                    const fmt = (d) => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
                    const diffDays = (d) => Math.ceil((d-now)/(1000*60*60*24));
                    return (
                      <>
                        <div style={{flex:1,background:'#161820',borderRadius:8,padding:'8px 12px',fontSize:11}}>
                          <span style={{color:'#8B8D97'}}>Próx. Coleta SEG</span>
                          <div style={{color:'#3b82f6',fontWeight:700,fontSize:14}}>{fmt(nextSeg)} <span style={{color:'#8B8D97',fontWeight:400}}>({diffDays(nextSeg)}d)</span></div>
                        </div>
                        <div style={{flex:1,background:'#161820',borderRadius:8,padding:'8px 12px',fontSize:11}}>
                          <span style={{color:'#8B8D97'}}>Próx. Coleta SEX</span>
                          <div style={{color:'#f97316',fontWeight:700,fontSize:14}}>{fmt(nextSex)} <span style={{color:'#8B8D97',fontWeight:400}}>({diffDays(nextSex)}d)</span></div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {/* Breakdown by DATE */}
                {Object.keys(fullStats.byDate).length > 0 && (
                  <div style={{padding:'6px 12px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1}}>Detalhamento por Data de Entrada</div>
                      {canDelete && <button onClick={selectAllForColeta} style={{padding:'4px 12px',background:'#1e3a5f',border:'none',borderRadius:4,color:'#93c5fd',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Selecionar Todos</button>}
                    </div>
                    {Object.entries(fullStats.byDate).sort(([a],[b])=>a.localeCompare(b)).map(([dt, data]) => {
                      const dtLabel = dt === 'sem-data' ? 'Sem data' : new Date(dt+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',weekday:'short'});
                      return (
                        <div key={dt} style={{background:'#161820',borderRadius:8,padding:'10px 12px',marginBottom:8,border:'1px solid #1E2028'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                            <span style={{fontSize:14,fontWeight:800,color:'#fbbf24'}}>{dtLabel}</span>
                            <span style={{fontSize:12,color:'#C0C2CC'}}>{data.paletes} pal{canSeeValues ? ` · R$ ${data.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''}</span>
                          </div>
                          {data.items.map((item,j) => (
                            <div key={j} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:j<data.items.length-1?'1px solid #1E2028':'none'}}>
                              {canDelete && <input type="checkbox" checked={selectedColeta.has(item.slot)} onChange={()=>toggleColetaItem(item.slot)} style={{accentColor:'#00C896',width:16,height:16,cursor:'pointer'}} />}
                              <div style={{flex:1,fontSize:11}}>
                                <span style={{color:'#93c5fd',fontWeight:700}}>{item.loja||'-'}</span>
                                <span style={{color:'#8B8D97',marginLeft:6}}>{item.slot}</span>
                                <span style={{color:'#C0C2CC',marginLeft:6}}>{item.descricao||'-'} ({item.qtd||0} un)</span>
                              </div>
                              {canSeeValues && <span style={{fontSize:11,color:'#C0C2CC',fontWeight:600}}>R$ {item.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Archive selected */}
                {canDelete && <div style={{padding:'6px 12px'}}>
                  <button onClick={arquivarColeta} style={{width:'100%',padding:'12px',background:selectedColeta.size>0?'#dc2626':'#dc262620',border:'1px solid #dc262640',borderRadius:8,color:selectedColeta.size>0?'#fff':'#fca5a5',fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13}}>
                    📦 {selectedColeta.size > 0 ? `Coletar ${selectedColeta.size} selecionados` : 'Selecione itens para coletar'}
                  </button>
                </div>}
                {/* Coleta history */}
                <div style={{padding:'6px 12px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Histórico de Coletas ({coletaHistory.length})</div>
                  {coletaHistory.length === 0 ? (
                    <div style={{fontSize:11,color:'#8B8D97',padding:'12px',background:'#161820',borderRadius:6,textAlign:'center'}}>Nenhuma coleta arquivada ainda.</div>
                  ) : (
                    <div style={{maxHeight:350,overflowY:'auto'}}>
                      {coletaHistory.slice(0,20).map((h,i) => {
                        const d = new Date(h.date);
                        const lojaGroups = {};
                        (h.items||[]).forEach(it => {
                          const lj = it.loja||'Sem Loja';
                          if (!lojaGroups[lj]) lojaGroups[lj] = [];
                          lojaGroups[lj].push(it);
                        });
                        return (
                          <div key={i} style={{background:'#0a1628',borderRadius:10,padding:'14px',marginBottom:10,border:'1px solid #1e3a5f'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,paddingBottom:8,borderBottom:'1px solid #1e3a5f'}}>
                              <div>
                                <div style={{fontSize:15,fontWeight:900,color:'#00C896'}}>Coleta — {d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</div>
                                <div style={{fontSize:11,color:'#8B8D97',marginTop:2}}>Registrada às {d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}h</div>
                              </div>
                              <div style={{textAlign:'right'}}>
                                <div style={{fontSize:16,fontWeight:900,color:'#93c5fd'}}>{h.paletes||h.items?.length||0} paletes</div>
                                {canSeeValues && <div style={{fontSize:13,fontWeight:700,color:'#00C896'}}>R$ {(h.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>}
                              </div>
                            </div>
                            {Object.entries(lojaGroups).sort(([a],[b])=>a.localeCompare(b)).map(([loja, items]) => (
                              <div key={loja} style={{marginBottom:8}}>
                                <div style={{fontSize:12,fontWeight:700,color:'#fbbf24',marginBottom:4}}>{loja} — {items.length} posições</div>
                                {items.map((it,j) => (
                                  <div key={j} style={{fontSize:11,color:'#C0C2CC',paddingLeft:16,display:'flex',justifyContent:'space-between',padding:'3px 0 3px 16px',borderLeft:'2px solid #1e3a5f'}}>
                                    <span><span style={{color:'#93c5fd',fontFamily:'monospace'}}>{it.slot}</span> — {it.descricao||'-'} ({it.qtd||0} un) {it.dataEntrada ? <span style={{color:'#8B8D97',fontSize:10}}>entrada {new Date(it.dataEntrada+'T00:00:00').toLocaleDateString('pt-BR')}</span> : ''}</span>
                                    {canSeeValues && <span style={{fontWeight:600}}>R$ {((parseInt(it.qtd)||0)*(parseFloat(it.valorUnit)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="wms-full-grid">
                  {fullSlots.map(s => {
                    const c = cells[s]; const has = c && (c.descricao || c.loja);
                    const dt = c?.dataEntrada ? new Date(c.dataEntrada+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : null;
                    return (
                      <div key={s} className={`wms-full-slot ${has?"filled":""}`} onClick={()=>openCell(s,"full")} title={has?`${c.loja} - ${c.descricao} (${c.qtd||0} un) - Entrada: ${dt||'sem data'}`:s}>
                        <span className="wms-full-num">{s.replace("FULL-","")}</span>
                        {has ? <>
                          <span className="wms-full-loja">{c.loja||"-"}</span>
                          <span className="wms-full-desc">{c.descricao||""}</span>
                          {dt && <span style={{fontSize:7,color:'#8B8D97',marginTop:1}}>{dt}</span>}
                        </> : <span style={{color:'#93c5fd'}}>+</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
        {tab === "inventario" && (
          <div className="wms-inv">
            <input className="wms-search" placeholder="Buscar por nome, SKU ou endereço..." value={search} onChange={e=>setSearch(e.target.value)} />
            <div className="wms-inv-table-wrap">
              <table className="wms-inv-table">
                <thead><tr>
                  <th>Endereço</th><th>SKU</th><th>Produto</th><th>Curva</th><th>Loja</th><th style={{textAlign:'right'}}>Qtd</th>
                  {canSeeValues && <th style={{textAlign:'right'}}>Val.Unit</th>}
                  {canSeeValues && <th style={{textAlign:'right'}}>Total</th>}
                </tr></thead>
                <tbody>
                  {inventory.map(([id,c]) => (
                    <tr key={id} onClick={()=>openCell(id, id.startsWith("FULL")?"full":id.startsWith("FLEX")?"flex":"rua")} style={{cursor:'pointer'}}>
                      <td style={{fontWeight:700,color:'#00C896',fontFamily:'monospace'}}>{id}</td>
                      <td style={{fontFamily:'monospace'}}>{c.sku||"-"}</td>
                      <td>{c.nome || c.descricao || "-"}</td>
                      <td>{c.curva && <span style={{padding:'2px 8px',borderRadius:4,fontSize:12,fontWeight:700,background:c.curva==='A'?'#dc262620':c.curva==='B'?'#d9770620':'#16a34a20',color:c.curva==='A'?'#fca5a5':c.curva==='B'?'#fcd34d':'#86efac'}}>{c.curva}</span>}</td>
                      <td>{c.loja||"-"}</td>
                      <td style={{textAlign:'right',fontWeight:700}}>{parseInt(c.qtd||0).toLocaleString("pt-BR")}</td>
                      {canSeeValues && <td style={{textAlign:'right'}}>R$ {parseFloat(c.valorUnit||0).toFixed(2)}</td>}
                      {canSeeValues && <td style={{textAlign:'right',fontWeight:600}}>R$ {((parseInt(c.qtd)||0)*(parseFloat(c.valorUnit)||0)).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Financial Tab */}
        {tab === "financeiro" && canSeeValues && (
          <div className="wms-fin">
            <div className="wms-fin-grid">
              <div className="wms-fin-card">
                <div className="wms-fin-card-l">Total em Estoque</div>
                <div className="wms-fin-card-v" style={{color:'#00C896'}}>R$ {stats.value.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
              </div>
              <div className="wms-fin-card">
                <div className="wms-fin-card-l">SKUs Cadastrados</div>
                <div className="wms-fin-card-v">{stats.skus}</div>
              </div>
              <div className="wms-fin-card">
                <div className="wms-fin-card-l">Unidades em Estoque</div>
                <div className="wms-fin-card-v">{stats.items.toLocaleString("pt-BR")}</div>
              </div>
              <div className="wms-fin-card">
                <div className="wms-fin-card-l">Full Pronto — Valor</div>
                <div className="wms-fin-card-v" style={{color:fullStats.valor>900000?'#fbbf24':'#00C896'}}>R$ {fullStats.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        {sel && (
          <div className="wms-modal-overlay" onClick={()=>setSel(null)}>
            <div className="wms-modal" onClick={e=>e.stopPropagation()}>
              <div className="wms-modal-header">
                <h3>{sel}</h3>
                <button onClick={()=>setSel(null)} className="wms-modal-close">✕</button>
              </div>
              <div className="wms-modal-body">
                {selType === "rua" ? (
                  <>
                    <div className="wms-form-row">
                      <div className="wms-field"><label>SKU</label><input value={form.sku} onChange={e=>setForm(f=>({...f,sku:e.target.value}))} placeholder="EX-001"/></div>
                      <div className="wms-field"><label>Curva ABC</label><select value={form.curva} onChange={e=>setForm(f=>({...f,curva:e.target.value}))}><option value="">Selecionar</option><option value="A">A — Alto giro</option><option value="B">B — Médio</option><option value="C">C — Baixo</option></select></div>
                    </div>
                    <div className="wms-field"><label>Nome do Produto</label><input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Descrição completa"/></div>
                    <div className="wms-form-row">
                      <div className="wms-field"><label>Quantidade</label><input type="number" value={form.qtd} onChange={e=>setForm(f=>({...f,qtd:e.target.value}))} placeholder="0"/></div>
                      {canSeeValues && <div className="wms-field"><label>Valor Unit. (R$)</label><input type="number" value={form.valorUnit} onChange={e=>setForm(f=>({...f,valorUnit:e.target.value}))} placeholder="0.00"/></div>}
                    </div>
                    <div className="wms-field"><label>Loja</label><input value={form.loja} onChange={e=>setForm(f=>({...f,loja:e.target.value}))} placeholder="Nome da loja"/></div>
                    <div className="wms-field"><label>Observação</label><input value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} placeholder="Notas"/></div>
                  </>
                ) : (
                  <>
                    <div className="wms-field"><label>Descrição</label><input value={areaForm.descricao} onChange={e=>setAreaForm(f=>({...f,descricao:e.target.value}))} placeholder="Produto/carga"/></div>
                    <div className="wms-field"><label>Loja</label><input value={areaForm.loja} onChange={e=>setAreaForm(f=>({...f,loja:e.target.value}))} placeholder="Nome da loja"/></div>
                    <div className="wms-form-row">
                      <div className="wms-field"><label>Quantidade</label><input type="number" value={areaForm.qtd} onChange={e=>setAreaForm(f=>({...f,qtd:e.target.value}))} placeholder="0"/></div>
                      {canSeeValues && <div className="wms-field"><label>Valor Unit.</label><input type="number" value={areaForm.valorUnit} onChange={e=>setAreaForm(f=>({...f,valorUnit:e.target.value}))} placeholder="0.00"/></div>}
                    </div>
                    {selType === "full" && <div className="wms-form-row">
                      <div className="wms-field"><label>Nº Paletes</label><input type="number" value={areaForm.paletes} onChange={e=>setAreaForm(f=>({...f,paletes:e.target.value}))} placeholder="1" min="1"/></div>
                      <div className="wms-field"><label>Data Entrada</label><input type="date" value={areaForm.dataEntrada} onChange={e=>setAreaForm(f=>({...f,dataEntrada:e.target.value}))}/></div>
                    </div>}
                    <div className="wms-field"><label>Observação</label><input value={areaForm.obs} onChange={e=>setAreaForm(f=>({...f,obs:e.target.value}))} placeholder="Notas"/></div>
                  </>
                )}
              </div>
              <div className="wms-modal-foot">
                {canDelete && <button className="wms-btn-danger" onClick={clearCell}>🗑 Limpar</button>}
                <button className="wms-btn-ghost" onClick={()=>setSel(null)}>Cancelar</button>
                <button className="wms-btn-save" onClick={saveCell}>✓ Salvar na Nuvem</button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className={`wms-toast ${toast.type}`}>{toast.msg}</div>}
      </div>
    </>
  );
}

const WMS_CSS = `
.wms{min-height:100vh;background:#08090D;font-family:'Outfit',sans-serif;color:#fff;}

.wms-header{position:sticky;top:0;z-index:50;background:#0a0c12ee;backdrop-filter:blur(16px);border-bottom:1px solid #1E2028;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;}
.wms-header-left{display:flex;align-items:center;gap:16px;}
.wms-logo-link{display:flex;align-items:center;gap:10px;text-decoration:none;}
.wms-logo-icon{width:32px;height:32px;background:#00C896;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;color:#2E2C3A;}
.wms-logo-text{font-size:17px;font-weight:800;color:#fff;letter-spacing:-.3px;}
.wms-logo-text span{color:#00C896;}
.wms-cloud{font-size:12px;padding:4px 12px;border-radius:20px;font-weight:600;}
.wms-cloud[data-status="ok"]{background:#00C89620;color:#00C896;}
.wms-cloud[data-status="error"]{background:#dc262620;color:#fca5a5;}
.wms-cloud[data-status="loading"]{background:#d9770620;color:#fcd34d;}
.wms-header-right{display:flex;align-items:center;gap:12px;}
.wms-user{text-align:right;}
.wms-user-name{display:block;font-size:13px;font-weight:600;color:#fff;}
.wms-user-role{display:block;font-size:11px;color:#8B8D97;text-transform:capitalize;}
.wms-portal-link{padding:6px 14px;background:#161820;border:1px solid #1E2028;border-radius:6px;color:#00C896;font-size:12px;font-weight:600;text-decoration:none;}
.wms-logout{padding:6px 14px;background:transparent;border:1px solid #1E2028;border-radius:6px;color:#8B8D97;font-size:12px;cursor:pointer;font-family:inherit;}

.wms-tabs{display:flex;align-items:center;padding:8px 24px;background:#0F1117;border-bottom:1px solid #1E2028;gap:6px;}
.wms-tab{padding:8px 20px;font-family:inherit;font-size:13px;font-weight:600;border:none;border-radius:6px;cursor:pointer;background:transparent;color:#8B8D97;transition:.15s;}
.wms-tab.on{background:#fff;color:#0F1117;}
.wms-tab:hover:not(.on){color:#fff;background:#1E2028;}
.wms-kpis{margin-left:auto;display:flex;gap:16px;}
.wms-kpi{display:flex;align-items:center;gap:6px;}
.wms-kpi-l{font-size:11px;color:#8B8D97;font-weight:600;text-transform:uppercase;}
.wms-kpi-v{font-size:16px;font-weight:800;}

/* Map */
.wms-map{padding:24px;overflow-x:auto;overflow-y:visible;}
.wms-map-inner{min-width:1400px;}
.wms-map-label{text-align:center;font-size:11px;font-weight:700;color:#8B8D97;letter-spacing:2px;padding:6px;background:#1E2028;border-radius:4px;margin-bottom:12px;}
.wms-map-row{display:flex;gap:16px;align-items:stretch;}
.wms-corredor{text-align:center;font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:2px;padding:8px;background:#1e3a5f20;border:1.5px dashed #3b82f6;border-radius:6px;margin:10px 0;}
.wms-costas{text-align:center;font-size:10px;color:#8B8D97;padding:2px;letter-spacing:1px;}

.wms-rua-block{background:#0F1117;border:1px solid #1E2028;border-radius:10px;padding:12px;margin:6px 0;}
.wms-rua-label{font-size:13px;font-weight:700;margin-bottom:8px;padding:4px 8px;}
.wms-rua-label span{font-weight:400;color:#8B8D97;font-size:11px;}
.wms-rua-label[data-tipo="seufull"]{color:#00C896;}
.wms-rua-label[data-tipo="mianofix"]{color:#fbbf24;}

.wms-rua-grid{overflow-x:auto;}
.wms-rua-head{display:flex;gap:2px;margin-bottom:4px;}
.wms-rua-head span{min-width:36px;text-align:center;font-size:10px;color:#8B8D97;font-weight:600;}
.wms-col-head{min-width:72px!important;}
.wms-rua-row{display:flex;gap:2px;margin-bottom:2px;}
.wms-row-head{min-width:36px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#8B8D97;}

.wms-vao{display:flex;gap:1px;min-width:72px;}
.wms-cell{flex:1;min-width:35px;height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;font-size:10px;transition:.15s;border:1px solid transparent;}
.wms-cell-empty{background:#1E2028;color:#8B8D97;}
.wms-cell-empty:hover{background:#2a2d38;border-color:#00C896;}
.wms-cell-filled{border:1.5px solid;}
.wms-cell-filled[data-curva="A"]{background:#dc262615;border-color:#dc2626;color:#fca5a5;}
.wms-cell-filled[data-curva="B"]{background:#d9770615;border-color:#d97706;color:#fcd34d;}
.wms-cell-filled[data-curva="C"]{background:#16a34a15;border-color:#16a34a;color:#86efac;}
.wms-cell-filled[data-curva=""]{background:#94a3b815;border-color:#94a3b8;color:#C0C2CC;}
.wms-cell-blocked{background:#0a0a0a;color:#333;cursor:default;font-size:8px;}
.wms-cell-lado{position:absolute;top:1px;left:3px;font-size:7px;opacity:.5;}
.wms-cell-name{font-size:8px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:30px;}
.wms-cell-plus{font-size:14px;color:#8B8D97;}

/* Areas */
.wms-areas{display:grid;grid-template-columns:2fr 3fr;gap:16px;margin-top:12px;}
.wms-area-box{background:#0F1117;border:1px solid #1E2028;border-radius:10px;overflow:hidden;}
.wms-area-title{padding:10px 16px;font-size:14px;font-weight:700;}
.wms-area-title span{font-weight:400;font-size:12px;opacity:.7;}

.wms-flex-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;padding:8px;}
.wms-flex-slot{height:40px;background:#1E2028;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:9px;transition:.15s;}
.wms-flex-slot.filled{background:#16a34a15;border:1px solid #16a34a;}
.wms-flex-slot:hover{background:#2a2d38;}
.wms-flex-num{font-size:8px;color:#8B8D97;}
.wms-flex-loja{font-size:8px;font-weight:600;color:#86efac;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40px;}

.wms-full-dash{display:flex;gap:12px;padding:8px 12px;}
.wms-full-stat{flex:1;background:#161820;border-radius:8px;padding:10px 12px;}
.wms-full-stat-l{font-size:10px;color:#8B8D97;font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
.wms-full-stat-v{font-size:18px;font-weight:800;margin-top:2px;}
.wms-full-bar{height:4px;background:#1E2028;border-radius:2px;margin-top:6px;overflow:hidden;}
.wms-full-bar div{height:100%;border-radius:2px;transition:width .5s;}

.wms-full-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;padding:8px;}
.wms-full-slot{height:52px;background:#1E2028;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:9px;transition:.15s;}
.wms-full-slot.filled{background:#1e3a5f30;border:1px solid #3b82f6;}
.wms-full-slot:hover{background:#2a2d38;}
.wms-full-num{font-size:8px;color:#8B8D97;}
.wms-full-loja{font-size:8px;font-weight:600;color:#93c5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50px;}
.wms-full-desc{font-size:7px;color:#8B8D97;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50px;}

/* Inventory */
.wms-inv{padding:24px;}
.wms-search{width:100%;padding:12px 18px;background:#0F1117;border:1.5px solid #1E2028;border-radius:10px;color:#fff;font-size:14px;font-family:inherit;outline:none;margin-bottom:16px;box-sizing:border-box;}
.wms-search:focus{border-color:#00C896;}
.wms-inv-table-wrap{background:#0F1117;border:1px solid #1E2028;border-radius:10px;overflow:auto;}
.wms-inv-table{width:100%;border-collapse:collapse;font-size:13px;}
.wms-inv-table th{text-align:left;padding:12px 14px;border-bottom:1px solid #1E2028;font-size:11px;font-weight:700;color:#8B8D97;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
.wms-inv-table td{padding:10px 14px;border-bottom:1px solid #1E202880;white-space:nowrap;}
.wms-inv-table tr:hover td{background:#1E202840;}

/* Financial */
.wms-fin{padding:24px;}
.wms-fin-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
.wms-fin-card{background:#0F1117;border:1px solid #1E2028;border-radius:14px;padding:28px;}
.wms-fin-card-l{font-size:13px;font-weight:600;color:#8B8D97;text-transform:uppercase;letter-spacing:1px;}
.wms-fin-card-v{font-size:36px;font-weight:900;margin-top:8px;letter-spacing:-1px;}

/* Modal */
.wms-modal-overlay{position:fixed;inset:0;background:#000c;z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;}
.wms-modal{background:#0F1117;border:1px solid #1E2028;border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;}
.wms-modal-header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #1E2028;}
.wms-modal-header h3{font-size:18px;font-weight:800;color:#00C896;font-family:monospace;}
.wms-modal-close{background:none;border:none;color:#8B8D97;font-size:20px;cursor:pointer;}
.wms-modal-body{padding:20px 24px;}
.wms-field{margin-bottom:16px;}
.wms-field label{display:block;font-size:12px;font-weight:600;color:#8B8D97;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
.wms-field input,.wms-field select{width:100%;padding:12px 14px;background:#161820;border:1.5px solid #1E2028;border-radius:8px;color:#fff;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;}
.wms-field input:focus,.wms-field select:focus{border-color:#00C896;}
.wms-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.wms-modal-foot{display:flex;gap:10px;padding:16px 24px;border-top:1px solid #1E2028;justify-content:flex-end;}
.wms-btn-danger{padding:10px 18px;background:#dc262620;color:#fca5a5;border:1px solid #dc262640;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;margin-right:auto;}
.wms-btn-ghost{padding:10px 18px;background:transparent;color:#8B8D97;border:1px solid #1E2028;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;}
.wms-btn-save{padding:10px 24px;background:#00C896;color:#2E2C3A;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;transition:all .2s;}
.wms-btn-save:hover{background:#00daa6;box-shadow:0 4px 20px #00C89640;}

/* Toast */
.wms-toast{position:fixed;bottom:24px;right:24px;padding:14px 24px;background:#00C896;color:#2E2C3A;font-weight:700;border-radius:10px;font-size:14px;z-index:300;animation:slideUp .3s ease-out;}
.wms-toast.warn{background:#dc2626;color:#fff;}
@keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}

@media(max-width:768px){
  .wms-kpis{display:none;}
  .wms-areas{grid-template-columns:1fr;}
}
`;
