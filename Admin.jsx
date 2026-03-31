import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { LOGO_ICON } from './logo.js';
import { getAllUsers, approveUser, rejectUser, db, getPricing, savePricing, DEFAULT_PRICES, getWmsData, logAction, getLogs } from './firebase.js';
import { doc, updateDoc, deleteDoc, collection, getDocs, getDoc, setDoc } from 'firebase/firestore';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [approveModal, setApproveModal] = useState(null);
  const [lojaInput, setLojaInput] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({nome:'',role:'',loja:'',status:''});
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [pricesTab, setPricesTab] = useState(false);
  const [pricesSaved, setPricesSaved] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);

  useEffect(() => { loadUsers(); loadPrices(); loadLastBackup(); }, []);

  async function loadLogs() { const l = await getLogs(200); setLogs(l); }

  async function loadLastBackup() { try { const d = await getDoc(doc(db,'config','lastBackup')); if (d.exists()) setLastBackup(d.data().date); } catch(e){} }

  async function doBackup() {
    setBackingUp(true);
    try {
      const wms = await getWmsData();
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersData = {}; usersSnap.forEach(d => { usersData[d.id] = d.data(); });
      const billingSnap = await getDocs(collection(db, 'billing'));
      const billingData = {}; billingSnap.forEach(d => { billingData[d.id] = d.data(); });
      const coletaDoc = await getDoc(doc(db, 'wms', 'coletas'));
      const coletas = coletaDoc.exists() ? coletaDoc.data() : {};
      const pricingDoc = await getDoc(doc(db, 'config', 'pricing'));
      const pricing = pricingDoc.exists() ? pricingDoc.data() : {};
      const costsDoc = await getDoc(doc(db, 'config', 'costs'));
      const costs = costsDoc.exists() ? costsDoc.data() : {};
      const backup = { version:'1.0', date:new Date().toISOString(), wms, users:usersData, billing:billingData, coletas, pricing, costs };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `backup-seufull-${new Date().toISOString().substring(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      await setDoc(doc(db, 'backups', new Date().toISOString().substring(0,10)), { date:new Date().toISOString(), wms:JSON.stringify(wms), users:JSON.stringify(usersData), billing:JSON.stringify(billingData), coletas:JSON.stringify(coletas), pricing:JSON.stringify(pricing), costs:JSON.stringify(costs) });
      await setDoc(doc(db, 'config', 'lastBackup'), { date: new Date().toISOString() });
      setLastBackup(new Date().toISOString());
      showToast('Backup realizado!');
      logAction(user, 'BACKUP', 'Backup manual realizado');
    } catch(e) { showToast('Erro no backup: ' + e.message); }
    setBackingUp(false);
  }

  async function restoreBackup(file) {
    if (!confirm('ATENÇÃO: Isso vai SUBSTITUIR todos os dados atuais. Tem certeza?')) return;
    if (!confirm('Última confirmação. Continuar?')) return;
    try {
      const text = await file.text(); const data = JSON.parse(text);
      if (!data.version || !data.wms) { showToast('Arquivo inválido'); return; }
      const { saveWmsData } = await import('./firebase.js');
      if (data.wms) await saveWmsData(data.wms);
      if (data.pricing) await setDoc(doc(db, 'config', 'pricing'), data.pricing);
      if (data.costs) await setDoc(doc(db, 'config', 'costs'), data.costs);
      if (data.coletas) await setDoc(doc(db, 'wms', 'coletas'), data.coletas);
      if (data.billing) { for (const [id, val] of Object.entries(data.billing)) { await setDoc(doc(db, 'billing', id), val); } }
      showToast('Backup restaurado! Recarregue a página.');
      logAction(user, 'RESTORE', 'Backup restaurado de ' + data.date);
    } catch(e) { showToast('Erro: ' + e.message); }
  }

  async function loadPrices() { const p = await getPricing(); setPrices(p); }
  async function handleSavePrices() { await savePricing(prices); setPricesSaved(true); setTimeout(()=>setPricesSaved(false),3000); showToast('Preços atualizados!'); logAction(user, 'PRICING_UPDATE', 'Tabela de preços atualizada'); }

  async function loadUsers() {
    setLoading(true);
    try { setUsers((await getAllUsers()).sort((a,b) => (a.status === 'pendente' ? -1 : 1))); } catch(e) { console.error(e); }
    setLoading(false);
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''), 3000); }

  async function handleApprove() {
    if (!lojaInput.trim()) return;
    try { await approveUser(approveModal.uid, lojaInput.trim()); showToast(`${approveModal.nome||approveModal.email} aprovado!`); logAction(user, 'USER_APPROVE', `${approveModal.nome||approveModal.email} aprovado como ${lojaInput}`); setApproveModal(null); setLojaInput(''); loadUsers(); } catch(e) { showToast('Erro: '+e.message); }
  }

  async function handleReject(u) {
    if (!confirm(`Rejeitar ${u.nome||u.email}?`)) return;
    try { await rejectUser(u.uid); showToast('Rejeitado.'); loadUsers(); } catch(e) { showToast('Erro: '+e.message); }
  }

  function openEdit(u) { setEditForm({nome:u.nome||'',role:u.role||'cliente',loja:u.loja||'',status:u.status||'ativo'}); setEditModal(u); }

  async function handleEditSave() {
    try { await updateDoc(doc(db,'users',editModal.uid),{nome:editForm.nome,role:editForm.role,loja:editForm.loja,status:editForm.status}); showToast(`${editForm.nome} atualizado!`); setEditModal(null); loadUsers(); } catch(e) { showToast('Erro: '+e.message); }
  }

  async function handleDelete(u) {
    if (!confirm(`EXCLUIR ${u.nome||u.email}? Remove o perfil do sistema.`)) return;
    try { await deleteDoc(doc(db,'users',u.uid)); showToast('Removido.'); loadUsers(); } catch(e) { showToast('Erro: '+e.message); }
  }

  const pending = users.filter(u => u.status === 'pendente');
  const active = users.filter(u => u.status !== 'pendente' && u.status !== 'rejeitado');
  const rejected = users.filter(u => u.status === 'rejeitado');
  const roleBadge = (role) => { const c = {diretor:'#00C896',comercial:'#3b82f6',financeiro:'#fbbf24',logistica:'#f97316',cliente:'#8B8D97'}; return {padding:'3px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:(c[role]||'#8B8D97')+'20',color:c[role]||'#8B8D97',textTransform:'uppercase'}; };

  return (
    <div style={{minHeight:'100vh',background:'#08090D',fontFamily:'Outfit, sans-serif',color:'#fff'}}>
      <header style={{background:'#0a0c12ee',backdropFilter:'blur(16px)',borderBottom:'1px solid #1E2028',padding:'14px 28px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <Link to="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}><img src={LOGO_ICON} alt='Seu Full' style={{width:32,height:32,borderRadius:8}} /><div style={{fontSize:17,fontWeight:800,color:'#fff'}}>Admin <span style={{color:'#00C896'}}>Seu Full</span></div></Link>
        <div style={{display:'flex',gap:12}}><Link to="/wms" style={{padding:'6px 14px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#00C896',fontSize:12,fontWeight:600,textDecoration:'none'}}>WMS</Link><Link to="/portal" style={{padding:'6px 14px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#C0C2CC',fontSize:12,fontWeight:600,textDecoration:'none'}}>Portal</Link></div>
      </header>
      <div style={{maxWidth:1100,margin:'0 auto',padding:32}}>
        <h1 style={{fontSize:28,fontWeight:800,marginBottom:8}}>Gestão de Usuários</h1>
        <p style={{color:'#8B8D97',marginBottom:32}}>{users.length} usuários · {pending.length} pendentes</p>

        {pending.length > 0 && <div style={{marginBottom:40}}>
          <h2 style={{fontSize:16,fontWeight:700,color:'#fbbf24',marginBottom:16}}>Aguardando Aprovação ({pending.length})</h2>
          {pending.map(u => (
            <div key={u.uid} style={{background:'#0F1117',border:'1px solid #fbbf2440',borderRadius:14,padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16,marginBottom:12}}>
              <div>
                <div style={{fontSize:16,fontWeight:700}}>{u.nome||u.email}</div>
                <div style={{fontSize:13,color:'#8B8D97',marginTop:4}}>{u.email} · {u.cnpj||'Sem CNPJ'} · {u.telefone||''}</div>
                {u.endereco && <div style={{fontSize:12,color:'#8B8D97',marginTop:2}}>{u.endereco}, {u.cidade}/{u.estado}</div>}
                {u.responsavel && <div style={{fontSize:12,color:'#C0C2CC',marginTop:2}}>Resp: {u.responsavel}</div>}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{setApproveModal(u);setLojaInput(u.nome||'');}} style={{padding:'10px 20px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13}}>Aprovar</button>
                <button onClick={()=>handleReject(u)} style={{padding:'10px 20px',background:'#dc262620',color:'#fca5a5',border:'1px solid #dc262640',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:13}}>Rejeitar</button>
              </div>
            </div>
          ))}
        </div>}

        <h2 style={{fontSize:16,fontWeight:700,color:'#00C896',marginBottom:16}}>Usuários Ativos ({active.length})</h2>
        <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,overflow:'auto',marginBottom:32}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>
            <th style={thS}>Nome</th><th style={thS}>Email</th><th style={thS}>Perfil</th><th style={thS}>Loja</th><th style={thS}>Ações</th>
          </tr></thead><tbody>
            {active.map(u => <tr key={u.uid}>
              <td style={tdS}>{u.nome||'-'}</td>
              <td style={{...tdS,fontSize:12,fontFamily:'monospace'}}>{u.email}</td>
              <td style={tdS}><span style={roleBadge(u.role)}>{u.role}</span></td>
              <td style={tdS}>{u.loja||'-'}</td>
              <td style={tdS}><div style={{display:'flex',gap:6}}>
                <button onClick={()=>openEdit(u)} style={{padding:'5px 12px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#3b82f6',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Editar</button>
                {u.uid !== user?.uid && <button onClick={()=>handleDelete(u)} style={{padding:'5px 12px',background:'#dc262610',border:'1px solid #dc262630',borderRadius:6,color:'#fca5a5',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Excluir</button>}
              </div></td>
            </tr>)}
          </tbody></table>
        </div>

        {rejected.length > 0 && <>
          <h2 style={{fontSize:16,fontWeight:700,color:'#dc2626',marginBottom:16}}>Rejeitados ({rejected.length})</h2>
          <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,overflow:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr><th style={thS}>Nome</th><th style={thS}>Email</th><th style={thS}>Ações</th></tr></thead><tbody>
              {rejected.map(u => <tr key={u.uid}><td style={tdS}>{u.nome||'-'}</td><td style={tdS}>{u.email}</td><td style={tdS}><button onClick={()=>openEdit(u)} style={{padding:'5px 12px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#3b82f6',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Reativar</button></td></tr>)}
            </tbody></table>
          </div>
        </>}
      </div>

      {approveModal && <div style={ovS} onClick={()=>setApproveModal(null)}><div style={mdS} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontSize:20,fontWeight:800,marginBottom:8}}>Aprovar {approveModal.nome}</h3>
        <p style={{color:'#8B8D97',fontSize:14,marginBottom:20}}>Nome da loja que aparecerá no portal e WMS.</p>
        <label style={lbS}>Loja</label><input value={lojaInput} onChange={e=>setLojaInput(e.target.value)} style={inS} placeholder="Ex: LUGU, ASM..." />
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}><button onClick={()=>setApproveModal(null)} style={bgS}>Cancelar</button><button onClick={handleApprove} style={bmS}>Aprovar →</button></div>
      </div></div>}

      {editModal && <div style={ovS} onClick={()=>setEditModal(null)}><div style={mdS} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontSize:20,fontWeight:800,marginBottom:16}}>Editar — {editModal.email}</h3>
        <label style={lbS}>Nome</label><input value={editForm.nome} onChange={e=>setEditForm(f=>({...f,nome:e.target.value}))} style={inS} />
        <label style={lbS}>Perfil</label><select value={editForm.role} onChange={e=>setEditForm(f=>({...f,role:e.target.value}))} style={inS}><option value="diretor">Diretor</option><option value="comercial">Comercial</option><option value="financeiro">Financeiro</option><option value="logistica">Logística</option><option value="cliente">Cliente</option></select>
        <label style={lbS}>Loja</label><input value={editForm.loja} onChange={e=>setEditForm(f=>({...f,loja:e.target.value}))} style={inS} placeholder="Para clientes" />
        <label style={lbS}>Status</label><select value={editForm.status} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))} style={inS}><option value="ativo">Ativo</option><option value="pendente">Pendente</option><option value="rejeitado">Rejeitado</option></select>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}><button onClick={()=>setEditModal(null)} style={bgS}>Cancelar</button><button onClick={handleEditSave} style={bmS}>Salvar →</button></div>
      </div></div>}

      {/* Pricing Tab Toggle */}
      <div style={{marginTop:40,marginBottom:20}}>
        <button onClick={()=>setPricesTab(!pricesTab)} style={{padding:'10px 24px',background:pricesTab?'#00C896':'#161820',color:pricesTab?'#2E2C3A':'#00C896',border:'1px solid #1E2028',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:14}}>
          {pricesTab ? '▼ Tabela de Preços' : '► Configurar Tabela de Preços'}
        </button>
      </div>

      {pricesTab && (
        <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,padding:24,marginBottom:32}}>
          <h2 style={{fontSize:18,fontWeight:800,marginBottom:4}}>Tabela de Preços — Seu Full</h2>
          <p style={{color:'#8B8D97',fontSize:13,marginBottom:20}}>Altere os valores e clique em Salvar. Os novos preços valem para os próximos faturamentos.</p>
          
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
            {[
              ['Posição Pallet (R$/mês)', 'pallet_month'],
              ['Mínimo Armazenagem (R$/mês)', 'min_monthly'],
              ['WMS/Portal (R$/mês)', 'wms'],
              ['Preparo Full ML (R$/unid)', 'full_unit'],
              ['Envio Flex (R$/envio)', 'flex'],
              ['Correios/Places (R$/pedido)', 'correios_places'],
              ['Etiquetagem Full (R$/unid)', 'etiq_full'],
              ['Etiquetagem Recebimento (R$/unid)', 'etiq_receb'],
              ['Recebimento Caixa (R$/caixa)', 'receb_caixa'],
              ['Kit Pequeno (R$/unid)', 'kit_small'],
              ['Kit Médio (R$/unid)', 'kit_medium'],
              ['Kit Grande (R$/unid)', 'kit_large'],
              ['Montagem Embalagem (R$/unid)', 'montagem_embalagem'],
              ['Triagem Devoluções (R$/NF)', 'devolucao'],
            ].map(([label, key]) => (
              <div key={key}>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{label}</label>
                <input type="number" step="0.01" value={prices[key]||''} onChange={e=>setPrices(p=>({...p,[key]:parseFloat(e.target.value)||0}))}
                  style={{width:'100%',padding:'10px 14px',background:'#161820',border:'1.5px solid #1E2028',borderRadius:8,color:'#00C896',fontSize:16,fontWeight:700,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}} />
              </div>
            ))}
          </div>
          
          <div style={{marginTop:20,display:'flex',gap:12,alignItems:'center'}}>
            <button onClick={handleSavePrices} style={{padding:'12px 32px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:14}}>Salvar Preços →</button>
            <button onClick={()=>{setPrices({...DEFAULT_PRICES});}} style={{padding:'12px 24px',background:'transparent',color:'#8B8D97',border:'1px solid #1E2028',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:13}}>Restaurar Padrão</button>
            {pricesSaved && <span style={{color:'#00C896',fontWeight:600,fontSize:13}}>✓ Salvo!</span>}
          </div>
        </div>
      )}

      {/* ─── LOG DE AÇÕES ─── */}
      <div style={{marginTop:40,marginBottom:20}}>
        <button onClick={()=>{setShowLogs(!showLogs);if(!showLogs)loadLogs();}} style={{padding:'10px 24px',background:showLogs?'#7c3aed':'#161820',color:showLogs?'#fff':'#7c3aed',border:'1px solid #1E2028',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:14}}>
          {showLogs ? '▼ Log de Ações' : '► Log de Ações (Auditoria)'}
        </button>
      </div>

      {showLogs && (
        <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,padding:24,marginBottom:32}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <h2 style={{fontSize:18,fontWeight:800}}>Log de Ações</h2>
            <button onClick={loadLogs} style={{padding:'6px 16px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#8B8D97',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>↻ Atualizar</button>
          </div>
          <div style={{maxHeight:500,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr>
                <th style={{textAlign:'left',padding:'8px 10px',borderBottom:'1px solid #1E2028',fontSize:10,fontWeight:700,color:'#8B8D97',textTransform:'uppercase'}}>Data/Hora</th>
                <th style={{textAlign:'left',padding:'8px 10px',borderBottom:'1px solid #1E2028',fontSize:10,fontWeight:700,color:'#8B8D97',textTransform:'uppercase'}}>Usuário</th>
                <th style={{textAlign:'left',padding:'8px 10px',borderBottom:'1px solid #1E2028',fontSize:10,fontWeight:700,color:'#8B8D97',textTransform:'uppercase'}}>Ação</th>
                <th style={{textAlign:'left',padding:'8px 10px',borderBottom:'1px solid #1E2028',fontSize:10,fontWeight:700,color:'#8B8D97',textTransform:'uppercase'}}>Detalhes</th>
              </tr></thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={4} style={{textAlign:'center',color:'#8B8D97',padding:20}}>Nenhum log encontrado.</td></tr>
                ) : logs.map(l => {
                  const dt = new Date(l.timestamp);
                  const actionColors = {WMS_SAVE:'#00C896',WMS_CLEAR:'#fbbf24',COLETA:'#3b82f6',BILLING_ADD:'#00C896',BILLING_EDIT:'#f97316',BILLING_REMOVE:'#dc2626',INSUMO:'#7c3aed',USER_APPROVE:'#00C896',PRICING_UPDATE:'#fbbf24',BACKUP:'#3b82f6'};
                  return (
                    <tr key={l.id} style={{borderBottom:'1px solid #1E202850'}}>
                      <td style={{padding:'6px 10px',color:'#8B8D97',whiteSpace:'nowrap',fontSize:11}}>{dt.toLocaleDateString('pt-BR')} {dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
                      <td style={{padding:'6px 10px',fontWeight:600,color:'#93c5fd',fontSize:12}}>{l.userName||l.user}</td>
                      <td style={{padding:'6px 10px'}}><span style={{padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,background:(actionColors[l.action]||'#8B8D97')+'20',color:actionColors[l.action]||'#8B8D97'}}>{l.action}</span></td>
                      <td style={{padding:'6px 10px',color:'#C0C2CC',maxWidth:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.details}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── BACKUP ─── */}
      <div style={{marginTop:40,marginBottom:20}}>
        <button onClick={()=>document.getElementById('backupSection').style.display=document.getElementById('backupSection').style.display==='none'?'block':'none'} style={{padding:'10px 24px',background:'#161820',color:'#3b82f6',border:'1px solid #1E2028',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:14}}>
          ► Backup & Restauração
        </button>
      </div>

      <div id="backupSection" style={{display:'none'}}>
        <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,padding:24,marginBottom:32}}>
          <h2 style={{fontSize:18,fontWeight:800,marginBottom:4}}>Backup dos Dados</h2>
          <p style={{color:'#8B8D97',fontSize:13,marginBottom:12}}>Backup automático roda todos os dias quando você acessa o sistema. Backups dos últimos 30 dias ficam salvos no Firebase. Use o botão abaixo pra baixar uma cópia pro seu computador.</p>
          <div style={{padding:'10px 14px',background:'#00C89610',border:'1px solid #00C89630',borderRadius:8,marginBottom:16,fontSize:12}}><span style={{color:'#00C896',fontWeight:700}}>✓ Backup automático ativo</span> — Todo dia ao acessar o sistema, os dados são salvos automaticamente. Últimos 30 dias mantidos.</div>
          
          {lastBackup && <p style={{fontSize:12,color:'#8B8D97',marginBottom:12}}>Último backup: <span style={{color:'#00C896',fontWeight:600}}>{new Date(lastBackup).toLocaleString('pt-BR')}</span></p>}
          
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <button onClick={doBackup} disabled={backingUp} style={{padding:'12px 32px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:14}}>
              {backingUp ? '⏳ Fazendo backup...' : '💾 Fazer Backup Agora'}
            </button>
            
            <label style={{padding:'12px 24px',background:'transparent',color:'#fbbf24',border:'1px solid #fbbf2440',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:14}}>
              ⚠ Restaurar Backup
              <input type="file" accept=".json" onChange={e=>{if(e.target.files[0])restoreBackup(e.target.files[0]);}} style={{display:'none'}} />
            </label>
          </div>
          
          <div style={{marginTop:16,padding:12,background:'#dc262610',border:'1px solid #dc262630',borderRadius:8}}>
            <p style={{fontSize:12,color:'#fca5a5',fontWeight:600}}>⚠ Restaurar um backup SUBSTITUI todos os dados atuais. Use apenas em caso de emergência.</p>
          </div>
        </div>
      </div>

      {toast && <div style={{position:'fixed',bottom:24,right:24,padding:'14px 24px',background:'#00C896',color:'#2E2C3A',fontWeight:700,borderRadius:10,fontSize:14,zIndex:300}}>{toast}</div>}
      <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}`}</style>
    </div>
  );
}

const thS={textAlign:'left',padding:'12px 16px',borderBottom:'1px solid #1E2028',fontSize:11,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:.5};
const tdS={padding:'12px 16px',borderBottom:'1px solid #1E202880'};
const ovS={position:'fixed',inset:0,background:'#000c',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24};
const mdS={background:'#0F1117',border:'1px solid #1E2028',borderRadius:16,padding:32,maxWidth:440,width:'100%'};
const lbS={fontSize:12,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:6,display:'block'};
const inS={width:'100%',padding:'12px 16px',background:'#161820',border:'1.5px solid #1E2028',borderRadius:10,color:'#fff',fontSize:14,fontFamily:'inherit',outline:'none',marginBottom:16,boxSizing:'border-box'};
const bgS={padding:'10px 20px',background:'transparent',color:'#8B8D97',border:'1px solid #1E2028',borderRadius:8,cursor:'pointer',fontFamily:'inherit'};
const bmS={padding:'10px 24px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit'};
