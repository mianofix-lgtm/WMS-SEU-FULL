import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { db, getWmsData, getPricing, DEFAULT_PRICES, logAction } from './firebase.js';
import { LOGO_ICON, LOGO_WORDMARK } from './logo.js';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';



const CHANNELS = [
  'Full ML',
  'Flex', 
  'Correios',
  'Places',
  'Kit',
  'Montagem Embalagem',
  'Triagem Devoluções',
  'SAC',
  'Retirada de Produtos',
  'Frete/Coleta',
  'Hub e ERP',
  'Coworking',
  'Outros',
];

export default function Billing() {
  const { user } = useAuth();
  const [PRICES, setPRICES] = useState({...DEFAULT_PRICES, pallet_day: DEFAULT_PRICES.pallet_month / 30});
  const [clients, setClients] = useState([]);
  const [selClient, setSelClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [pallets, setPallets] = useState([]);
  const [newSale, setNewSale] = useState({numero:'',produto:'',canal:'Full ML',qtd:'1',kitTier:'small',valorCustom:'',descCustom:'',dataVenda:'',numEnvio:''});
  const [editingSale, setEditingSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [toast, setToast] = useState('');
  const [wmsData, setWmsData] = useState({});
  const [coletaData, setColetaData] = useState([]);
  const [positionWarnings, setPositionWarnings] = useState([]);
  const [tab, setTab] = useState('resumo');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Load pricing from Firebase
      const pricing = await getPricing();
      setPRICES({...pricing, pallet_day: pricing.pallet_month / 30});
      // Load clients from users collection
      const snap = await getDocs(collection(db, 'users'));
      const allUsers = [];
      snap.forEach(d => allUsers.push({uid:d.id,...d.data()}));
      // All unique lojas from WMS + clients
      const wms = await getWmsData();
      setWmsData(wms);
      
      // Load coleta history for auto Full count
      try {
        const coletaDoc = await getDoc(doc(db, 'wms', 'coletas'));
        if (coletaDoc.exists() && coletaDoc.data().history) {
          setColetaData(JSON.parse(coletaDoc.data().history));
        }
      } catch(e) {}
      
      // Check for positions missing info
      const warnings = [];
      Object.entries(wms).forEach(([id, cell]) => {
        const hasContent = cell.nome || cell.descricao || (cell.produtos && cell.produtos.length > 0 && cell.produtos[0].nome);
        if (cell.loja && !hasContent) {
          warnings.push({id, loja: cell.loja, issue: 'Sem nome do produto'});
        }
        if (hasContent && !cell.loja) {
          warnings.push({id, loja: '-', issue: 'Sem loja definida'});
        }
      });
      setPositionWarnings(warnings);
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
    if (!newSale.produto && !newSale.descCustom) { showToast('Preencha o produto'); return; }
    const sale = {
      id: editingSale || Date.now().toString(36),
      numero: newSale.numero,
      produto: newSale.produto || newSale.descCustom || newSale.canal,
      canal: newSale.canal,
      qtd: parseInt(newSale.qtd) || 1,
      kitTier: newSale.canal === 'Kit' ? newSale.kitTier : null,
      valorCustom: newSale.valorCustom,
      descCustom: newSale.descCustom,
      dataVenda: newSale.dataVenda || '',
      numEnvio: newSale.numEnvio || '',
      data: newSale.dataVenda ? new Date(newSale.dataVenda+'T12:00:00').toISOString() : new Date().toISOString(),
      valor: calcSaleValue(newSale),
    };
    const next = editingSale ? sales.map(s => s.id === editingSale ? sale : s) : [sale, ...sales];
    setSales(next);
    await saveClientData(next, pallets);
    setNewSale({numero:'',produto:'',canal:newSale.canal,qtd:'1',kitTier:'small',valorCustom:'',descCustom:'',dataVenda:'',numEnvio:''});
    setEditingSale(null);
    showToast(editingSale ? 'Venda atualizada!' : 'Venda registrada!');
    logAction(user, editingSale ? 'BILLING_EDIT' : 'BILLING_ADD', `${selClient}: ${sale.canal} - ${sale.produto} x${sale.qtd} = R$${sale.valor.toFixed(2)}`).catch(()=>{});
  }

  function calcSaleValue(s) {
    const q = parseInt(s.qtd) || 1;
    const custom = parseFloat(s.valorCustom) || 0;
    if (s.canal === 'Full ML') return q * PRICES.full_unit;
    if (s.canal === 'Flex') return q * PRICES.flex;
    if (s.canal === 'Correios' || s.canal === 'Places') return q * PRICES.correios_places;
    if (s.canal === 'Kit') {
      const tier = s.kitTier === 'large' ? PRICES.kit_large : s.kitTier === 'medium' ? PRICES.kit_medium : PRICES.kit_small;
      return q * tier;
    }
    if (s.canal === 'Montagem Embalagem') return q * 0.50;
    if (s.canal === 'Triagem Devoluções') return q * PRICES.devolucao;
    if (s.canal === 'Frete/Coleta') return custom || (q * 50);
    if (s.canal === 'SAC' || s.canal === 'Retirada de Produtos' || s.canal === 'Hub e ERP' || s.canal === 'Coworking' || s.canal === 'Outros') return custom;
    return custom;
  }

  function editSale(s) {
    setEditingSale(s.id);
    setNewSale({
      numero: s.numero || '',
      produto: s.produto || '',
      canal: s.canal || 'Full ML',
      qtd: String(s.qtd || 1),
      kitTier: s.kitTier || 'small',
      valorCustom: s.valorCustom || '',
      descCustom: s.descCustom || '',
      dataVenda: s.dataVenda || (s.data ? s.data.substring(0,10) : ''),
      numEnvio: s.numEnvio || '',
    });
    showToast('Editando lançamento...');
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
    // Build position rows for this client
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

    // Sales rows grouped by channel
    const channelTotals = {};
    sales.forEach(s => {
      if (!channelTotals[s.canal]) channelTotals[s.canal] = {count:0, units:0, valor:0};
      channelTotals[s.canal].count++;
      channelTotals[s.canal].units += s.qtd||1;
      channelTotals[s.canal].valor += s.valor||0;
    });

    // Detailed sales for PDF
    const detailRows = sales.map(s => 
      `<tr><td style="font-size:11px;color:#666">${s.dataVenda ? new Date(s.dataVenda+'T12:00:00').toLocaleDateString('pt-BR') : new Date(s.data).toLocaleDateString('pt-BR')}</td><td style="font-family:monospace;font-size:11px">${s.numero||'-'}</td><td style="font-family:monospace;font-size:11px;color:#1e3a5f">${s.numEnvio||'-'}</td><td>${s.canal}</td><td>${s.produto||'-'}</td><td style="text-align:right">${s.qtd}</td><td style="text-align:right;font-weight:700">R$ ${(s.valor||0).toFixed(2)}</td></tr>`
    ).join('');

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
.section h2{font-size:14px;font-weight:800;color:#2E2C3A;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding:8px 12px;background:#2E2C3A;color:#fff;border-radius:6px;}
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
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:#00C89620;color:#00C896;}
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
  <div>
    <h3>Cliente</h3>
    <div class="name">${selClient}</div>
  </div>
  <div style="text-align:right">
    <h3>Posições Ocupadas</h3>
    <div class="positions">${clientPositions}</div>
  </div>
</div>

<div class="section">
  <h2 class="green">Armazenagem — Posições Ocupadas</h2>
  <table>
    <thead><tr><th>Endereço</th><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:center">Entrada</th><th style="text-align:center">Dias</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>
      ${posRows || '<tr><td colspan="6" style="text-align:center;color:#999">Nenhuma posição</td></tr>'}
      <tr class="total-row"><td colspan="5">Subtotal Armazenagem ${totals.finalPalletCost <= totals.minPalletCost ? '(mínimo aplicado)' : ''}</td><td style="text-align:right">R$ ${totals.finalPalletCost.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
    </tbody>
  </table>
</div>

<div class="section">
  <h2>Serviços Prestados</h2>
  <table>
    <thead><tr><th>Data</th><th>Nº Venda</th><th>Nº Envio</th><th>Canal</th><th>Produto</th><th style="text-align:right">Qtd</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>
      <tr><td colspan="4">Sistema WMS + Portal</td><td>Fixo mensal</td><td style="text-align:right">1</td><td style="text-align:right;font-weight:700">R$ ${totals.wms.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
      ${detailRows}
      <tr class="total-row"><td colspan="6">Subtotal Serviços</td><td style="text-align:right">R$ ${(totals.salesTotal + totals.wms).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td></tr>
    </tbody>
  </table>
</div>

<div class="grand-total">
  <div class="label">Total a Pagar</div>
  <div class="value">R$ ${totals.total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
</div>

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
    const minPalletCost = PRICES.min_monthly;
    const finalPalletCost = Math.max(palletCost, minPalletCost);

    const salesTotal = sales.reduce((sum, s) => sum + (s.valor || 0), 0);
    const wms = PRICES.wms;
    const total = finalPalletCost + salesTotal + wms;

    // Auto-count Full ML items from coleta history for this month
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

    return { salesByChannel, palletCost, minPalletCost, finalPalletCost, salesTotal, wms, total, activePallets: pallets.filter(p => !p.saida).length, autoFullItems, wmsPositions };
  }, [sales, pallets]);

  if (loading) return <div style={S.loadPage}><div style={{color:'#00C896',fontSize:16}}>Carregando...</div></div>;

  return (
    <div style={S.page}>
      <style>{`
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
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

      {/* Header */}
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
        {/* Client selector + month */}
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

        {/* KPIs */}
        <div className='bill-kpis' style={S.kpiRow}>
          <div style={S.kpi}>
            <div style={S.kpiL}>Pallets (proporcional)</div>
            <div style={S.kpiV}>R$ {totals.finalPalletCost.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
            <div style={{fontSize:10,color:'#8B8D97',marginTop:4}}>{clientPositions} posições WMS · Mín R$ 1.500</div>
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

        {/* Generate report button */}
        <div style={{marginBottom:16}}>
          <button onClick={generatePDF} style={{padding:'14px 32px',background:'#2E2C3A',color:'#fff',border:'2px solid #00C896',borderRadius:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:15,display:'flex',alignItems:'center',gap:10}}>📄 Gerar Relatório PDF — {selClient}</button>
        </div>

        {/* Auto Full info */}
        {totals.autoFullItems > 0 && (
          <div style={{background:'#00C89610',border:'1px solid #00C89630',borderRadius:10,padding:'12px 16px',marginBottom:12,fontSize:13}}>
            <span style={{color:'#00C896',fontWeight:700}}>Full ML automático:</span> {totals.autoFullItems.toLocaleString('pt-BR')} itens detectados nas coletas do mês = <span style={{fontWeight:700}}>R$ {(totals.autoFullItems * PRICES.full_unit).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
          </div>
        )}

        {/* Position warnings */}
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
            
            {/* Positions detail with entry dates */}
            <h3 style={{fontSize:14,fontWeight:700,marginTop:24,marginBottom:12}}>Posições Ocupadas — Datas de Entrada</h3>
            <table style={S.table}><thead><tr>
              <th style={S.th}>Endereço</th><th style={S.th}>Produto</th><th style={S.th}>Qtd</th><th style={S.th}>Data Entrada</th><th style={S.th}>Dias</th><th style={{...S.th,textAlign:'right'}}>Valor Proporcional</th>
            </tr></thead><tbody>
              {Object.entries(wmsData).filter(([id, cell]) => cell.loja && selClient && cell.loja.trim().toUpperCase() === selClient.trim().toUpperCase()).sort(([a],[b]) => a.localeCompare(b)).map(([id, cell]) => {
                const entryDate = cell.dataEntrada ? new Date(cell.dataEntrada) : null;
                const now = new Date();
                const days = entryDate ? Math.max(1, Math.ceil((now - entryDate) / (1000*60*60*24))) : 30;
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

        {/* Vendas */}
        {tab === 'vendas' && (
          <div>
            {/* Add sale form */}
            <div style={{...S.card,marginBottom:16}}>
              <h3 style={{fontSize:14,fontWeight:700,color:'#00C896',marginBottom:12}}>Registrar Venda / Serviço</h3>
              <div className='bill-form' style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
                <div><label style={S.label}>Data Venda</label><input type="date" value={newSale.dataVenda} onChange={e=>setNewSale(f=>({...f,dataVenda:e.target.value}))} style={{...S.input,width:140}} /></div>
                <div><label style={S.label}>Nº Venda/Pedido</label><input value={newSale.numero} onChange={e=>setNewSale(f=>({...f,numero:e.target.value}))} style={{...S.input,width:140}} placeholder="MLB-123..." /></div>
                <div><label style={S.label}>Nº Envio/Frete</label><input value={newSale.numEnvio} onChange={e=>setNewSale(f=>({...f,numEnvio:e.target.value}))} style={{...S.input,width:140}} placeholder="Nº envio..." /></div>
                <div><label style={S.label}>Produto</label><input value={newSale.produto} onChange={e=>setNewSale(f=>({...f,produto:e.target.value}))} style={{...S.input,width:180}} placeholder="Nome do produto" /></div>
                <div><label style={S.label}>Canal</label><select value={newSale.canal} onChange={e=>setNewSale(f=>({...f,canal:e.target.value}))} style={{...S.input,width:180}}>{CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={S.label}>Qtd</label><input type="number" value={newSale.qtd} onChange={e=>setNewSale(f=>({...f,qtd:e.target.value}))} style={{...S.input,width:70}} min="1" /></div>
                {newSale.canal === 'Kit' && <div><label style={S.label}>Tier Kit</label><select value={newSale.kitTier} onChange={e=>setNewSale(f=>({...f,kitTier:e.target.value}))} style={{...S.input,width:140}}>
                  <option value="small">Pequeno (R$0,50/u)</option>
                  <option value="medium">Médio (R$1,50/u)</option>
                  <option value="large">Grande (R$4,00/u)</option>
                </select></div>}
                {['Frete/Coleta','SAC','Retirada de Produtos','Hub e ERP','Coworking','Outros'].includes(newSale.canal) && <>
                  <div><label style={S.label}>Valor (R$)</label><input type="number" value={newSale.valorCustom} onChange={e=>setNewSale(f=>({...f,valorCustom:e.target.value}))} style={{...S.input,width:110}} placeholder="0.00" step="0.01" /></div>
                  {newSale.canal === 'Outros' && <div><label style={S.label}>Descrição</label><input value={newSale.descCustom} onChange={e=>setNewSale(f=>({...f,descCustom:e.target.value}))} style={{...S.input,width:160}} placeholder="Descreva o serviço" /></div>}
                </>}
                <button onClick={addSale} style={{...S.btnMain,background:editingSale?'#fbbf24':'#00C896'}}>{editingSale ? '✓ Salvar Edição' : '+ Registrar'}</button>
                {editingSale && <button onClick={()=>{setEditingSale(null);setNewSale({numero:'',produto:'',canal:'Full ML',qtd:'1',kitTier:'small',valorCustom:'',descCustom:'',dataVenda:'',numEnvio:''});}} style={{padding:'10px 16px',background:'transparent',border:'1px solid #1E2028',borderRadius:8,color:'#8B8D97',cursor:'pointer',fontFamily:'inherit',fontSize:12}}>Cancelar</button>}
              </div>
            </div>

            {/* Sales list */}
            <div style={S.card}>
              <h3 style={{fontSize:14,fontWeight:700,marginBottom:12}}>{sales.length} lançamentos</h3>
              {sales.length === 0 ? <div style={{color:'#8B8D97',padding:20,textAlign:'center'}}>Nenhuma venda registrada neste mês.</div> : (
                <div style={{maxHeight:400,overflowY:'auto'}}>
                  <table style={S.table}><thead><tr>
                    <th style={S.th}>Data</th><th style={S.th}>Nº Venda</th><th style={S.th}>Nº Envio</th><th style={S.th}>Produto</th><th style={S.th}>Canal</th><th style={{...S.th,textAlign:'right'}}>Qtd</th><th style={{...S.th,textAlign:'right'}}>Valor</th><th style={S.th}></th>
                  </tr></thead><tbody>
                    {sales.map(s => (
                      <tr key={s.id} style={{background:editingSale===s.id?'#fbbf2410':'transparent'}}>
                        <td style={{...S.td,fontSize:12,color:'#8B8D97'}}>{s.dataVenda ? new Date(s.dataVenda+'T12:00:00').toLocaleDateString('pt-BR') : new Date(s.data).toLocaleDateString('pt-BR')}</td>
                        <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{s.numero}</td>
                        <td style={{...S.td,fontFamily:'monospace',fontSize:12,color:'#93c5fd'}}>{s.numEnvio||'-'}</td>
                        <td style={S.td}>{s.produto}</td>
                        <td style={S.td}><span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,background: s.canal==='Full ML'?'#00C89620':s.canal==='Flex'?'#3b82f620':s.canal==='Kit'?'#7c3aed20':s.canal==='Frete/Coleta'?'#dc262620':s.canal==='Outros'?'#8B8D9720':'#f9731620',color:s.canal==='Full ML'?'#00C896':s.canal==='Flex'?'#3b82f6':s.canal==='Kit'?'#7c3aed':s.canal==='Frete/Coleta'?'#fca5a5':s.canal==='Outros'?'#C0C2CC':'#f97316'}}>{s.canal}</span></td>
                        <td style={{...S.td,textAlign:'right'}}>{s.qtd}</td>
                        <td style={{...S.td,textAlign:'right',fontWeight:700}}>R$ {(s.valor||0).toFixed(2)}</td>
                        <td style={S.td}><div style={{display:'flex',gap:4}}><button onClick={()=>editSale(s)} style={{padding:'4px 8px',background:'#1e3a5f',border:'none',borderRadius:4,color:'#93c5fd',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>✎</button><button onClick={()=>removeSale(s.id)} style={S.btnDel}>✕</button></div></td>
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
                  <p style={{fontSize:12,color:'#8B8D97',marginTop:4}}>R$ {PRICES.pallet_day.toFixed(2)}/dia por pallet · Mín. R$ 1.500/mês</p>
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
