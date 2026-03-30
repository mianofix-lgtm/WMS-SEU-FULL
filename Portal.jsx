import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { LOGO_ICON } from './logo.js';
import { logout, getWmsData, getPerms } from './firebase.js';

export default function Portal() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [cells, setCells] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lastSync, setLastSync] = useState(null);

  // Determine what stock to show
  const isInternal = user?.role === 'diretor' || user?.role === 'gerente' || user?.role === 'comercial' || user?.role === 'financeiro';
  const perms = getPerms(user?.role);
  const clientLoja = user?.loja || '';

  useEffect(() => {
    loadStock();
    const interval = setInterval(loadStock, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadStock() {
    try {
      const data = await getWmsData();
      setCells(data || {});
      setLastSync(new Date());
    } catch (e) {
      console.error('Erro ao carregar estoque:', e);
    } finally {
      setLoading(false);
    }
  }

  // Filter stock for this client
  const stockItems = useMemo(() => {
    const items = [];
    for (const [id, cell] of Object.entries(cells)) {
      if (!cell || !cell.nome) continue;
      // Client sees only their loja, internal sees all
      if (!isInternal && clientLoja && !cell.loja?.toLowerCase().includes(clientLoja.toLowerCase())) continue;
      if (search && !cell.nome.toLowerCase().includes(search.toLowerCase()) && !cell.sku?.toLowerCase().includes(search.toLowerCase())) continue;
      items.push({ id, ...cell });
    }
    return items.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [cells, search, isInternal, clientLoja]);

  const totalQtd = stockItems.reduce((s, i) => s + (parseInt(i.qtd) || 0), 0);
  const totalValue = stockItems.reduce((s, i) => s + ((parseInt(i.qtd) || 0) * (parseFloat(i.valorUnit) || 0)), 0);
  const totalSkus = new Set(stockItems.map(i => i.sku).filter(Boolean)).size;

  async function handleLogout() {
    await logout();
    setUser(null);
    nav('/login');
  }

  if (loading) return (
    <div style={S.loadingPage}>
      <div style={S.spinner}></div>
      <div style={{color:'#00C896',fontFamily:'Outfit',fontSize:16,marginTop:16}}>Carregando estoque...</div>
    </div>
  );

  return (
    <div style={S.page}>
      {/* Header */}
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
          {user?.role === 'diretor' && <Link to="/admin" style={{...S.wmsLink, color:'#fbbf24'}}>Admin</Link>}
          {perms.canEdit && <Link to="/wms" style={S.wmsLink}>WMS →</Link>}
          <button onClick={handleLogout} style={S.logoutBtn}>Sair</button>
        </div>
      </header>

      {/* Content */}
      <main style={S.main}>
        <div style={S.welcome}>
          <h1 style={S.welcomeTitle}>Bem-vindo{user?.nome ? `, ${user.nome.split(' ')[0]}` : ''}</h1>
          <p style={S.welcomeSub}>
            {isInternal ? 'Visão geral do estoque de todos os clientes' : `Estoque da ${clientLoja}`}
            {lastSync && <span style={{color:'#8B8D97',fontSize:13}}> · Atualizado {lastSync.toLocaleTimeString('pt-BR')}</span>}
          </p>
        </div>

        {/* KPIs */}
        <div style={S.kpiRow}>
          <div style={S.kpi}>
            <div style={S.kpiLabel}>SKUs</div>
            <div style={S.kpiValue}>{totalSkus}</div>
          </div>
          <div style={S.kpi}>
            <div style={S.kpiLabel}>Unidades</div>
            <div style={S.kpiValue}>{totalQtd.toLocaleString('pt-BR')}</div>
          </div>
          {(perms.canSeeValues) && (
            <div style={S.kpi}>
              <div style={S.kpiLabel}>Valor em Estoque</div>
              <div style={{...S.kpiValue, color:'#00C896'}}>R$ {totalValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
            </div>
          )}
          <div style={S.kpi}>
            <div style={S.kpiLabel}>Posições Ocupadas</div>
            <div style={S.kpiValue}>{stockItems.length}</div>
          </div>
        </div>

        {/* Search */}
        <div style={S.searchRow}>
          <input
            style={S.searchInput}
            placeholder="Buscar por nome ou SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button onClick={loadStock} style={S.refreshBtn}>↻ Atualizar</button>
        </div>

        {/* Table */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Endereço</th>
                <th style={S.th}>SKU</th>
                <th style={S.th}>Produto</th>
                <th style={S.th}>Curva</th>
                {isInternal && <th style={S.th}>Loja</th>}
                <th style={{...S.th, textAlign:'right'}}>Qtd</th>
                {(perms.canSeeValues) && <th style={{...S.th, textAlign:'right'}}>Valor Unit.</th>}
                {(perms.canSeeValues) && <th style={{...S.th, textAlign:'right'}}>Total</th>}
              </tr>
            </thead>
            <tbody>
              {stockItems.length === 0 ? (
                <tr><td colSpan={8} style={{...S.td, textAlign:'center', color:'#8B8D97', padding:'40px 16px'}}>
                  {search ? 'Nenhum produto encontrado para esta busca.' : 'Nenhum produto em estoque no momento.'}
                </td></tr>
              ) : stockItems.map((item, i) => (
                <tr key={item.id} style={{background: i % 2 === 0 ? 'transparent' : '#0F111708'}}>
                  <td style={{...S.td, fontWeight:700, color:'#00C896', fontFamily:'monospace', fontSize:13}}>{item.id}</td>
                  <td style={{...S.td, fontFamily:'monospace', fontSize:13}}>{item.sku || '-'}</td>
                  <td style={{...S.td, maxWidth:300}}>{item.nome || '-'}</td>
                  <td style={S.td}>
                    {item.curva && <span style={{...S.curvaBadge, background: item.curva==='A'?'#dc262620':item.curva==='B'?'#d9770620':'#16a34a20', color: item.curva==='A'?'#fca5a5':item.curva==='B'?'#fcd34d':'#86efac'}}>{item.curva}</span>}
                  </td>
                  {isInternal && <td style={{...S.td, fontSize:13}}>{item.loja || '-'}</td>}
                  <td style={{...S.td, textAlign:'right', fontWeight:700}}>{parseInt(item.qtd || 0).toLocaleString('pt-BR')}</td>
                  {(perms.canSeeValues) && <td style={{...S.td, textAlign:'right', fontSize:13}}>R$ {parseFloat(item.valorUnit || 0).toFixed(2)}</td>}
                  {(perms.canSeeValues) && <td style={{...S.td, textAlign:'right', fontWeight:600, color:'#C0C2CC'}}>R$ {((parseInt(item.qtd)||0)*(parseFloat(item.valorUnit)||0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

const S = {
  page: { minHeight:'100vh', background:'#08090D', fontFamily:'Outfit, sans-serif', color:'#fff' },
  loadingPage: { minHeight:'100vh', background:'#08090D', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' },
  spinner: { width:40, height:40, border:'3px solid #1E2028', borderTopColor:'#00C896', borderRadius:'50%', animation:'spin 0.8s linear infinite' },
  header: { position:'sticky', top:0, zIndex:50, background:'#08090Dee', backdropFilter:'blur(20px)', borderBottom:'1px solid #1E2028', padding:'16px 32px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  headerLeft: { display:'flex', alignItems:'center', gap:16 },
  logoLink: { display:'flex', alignItems:'center', gap:10, textDecoration:'none' },
  logoIcon: { width:36, height:36, background:'#00C896', borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:18, color:'#2E2C3A' },
  logoText: { fontSize:20, fontWeight:800, color:'#fff', letterSpacing:-0.5 },
  headerBadge: { padding:'6px 14px', background:'#00C89620', border:'1px solid #00C89633', borderRadius:100, fontSize:12, fontWeight:600, color:'#00C896', letterSpacing:0.5 },
  headerRight: { display:'flex', alignItems:'center', gap:16 },
  userInfo: { textAlign:'right', marginRight:8 },
  userName: { fontSize:14, fontWeight:600, color:'#fff' },
  userRole: { fontSize:12, color:'#8B8D97', textTransform:'capitalize' },
  wmsLink: { padding:'8px 16px', background:'#161820', border:'1px solid #1E2028', borderRadius:8, color:'#00C896', fontSize:13, fontWeight:600, textDecoration:'none' },
  logoutBtn: { padding:'8px 16px', background:'transparent', border:'1px solid #1E2028', borderRadius:8, color:'#8B8D97', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' },
  main: { maxWidth:1280, margin:'0 auto', padding:'32px' },
  welcome: { marginBottom:32 },
  welcomeTitle: { fontSize:28, fontWeight:800, letterSpacing:-0.5, marginBottom:8 },
  welcomeSub: { fontSize:15, color:'#C0C2CC' },
  kpiRow: { display:'flex', gap:16, marginBottom:28, flexWrap:'wrap' },
  kpi: { flex:1, minWidth:160, background:'#0F1117', border:'1px solid #1E2028', borderRadius:14, padding:'20px 24px' },
  kpiLabel: { fontSize:12, fontWeight:600, color:'#8B8D97', textTransform:'uppercase', letterSpacing:1 },
  kpiValue: { fontSize:28, fontWeight:900, marginTop:6, letterSpacing:-1 },
  searchRow: { display:'flex', gap:12, marginBottom:20 },
  searchInput: { flex:1, padding:'12px 18px', background:'#0F1117', border:'1.5px solid #1E2028', borderRadius:10, color:'#fff', fontSize:14, fontFamily:'inherit', outline:'none' },
  refreshBtn: { padding:'12px 20px', background:'#161820', border:'1px solid #1E2028', borderRadius:10, color:'#00C896', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' },
  tableWrap: { background:'#0F1117', border:'1px solid #1E2028', borderRadius:14, overflow:'auto' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:14 },
  th: { textAlign:'left', padding:'14px 16px', borderBottom:'1px solid #1E2028', fontSize:12, fontWeight:700, color:'#8B8D97', textTransform:'uppercase', letterSpacing:0.5, whiteSpace:'nowrap' },
  td: { padding:'12px 16px', borderBottom:'1px solid #1E202880', whiteSpace:'nowrap' },
  curvaBadge: { padding:'3px 10px', borderRadius:6, fontSize:12, fontWeight:700 },
};
