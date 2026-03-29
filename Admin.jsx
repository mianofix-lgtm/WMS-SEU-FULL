import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { getAllUsers, approveUser, rejectUser } from './firebase.js';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [approveModal, setApproveModal] = useState(null);
  const [lojaInput, setLojaInput] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const all = await getAllUsers();
      setUsers(all.sort((a,b) => (a.status === 'pendente' ? -1 : 1)));
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function handleApprove() {
    if (!lojaInput.trim()) return;
    try {
      await approveUser(approveModal.uid, lojaInput.trim());
      setToast(`${approveModal.nome || approveModal.email} aprovado!`);
      setApproveModal(null);
      setLojaInput('');
      loadUsers();
    } catch(e) { setToast('Erro: ' + e.message); }
    setTimeout(()=>setToast(''), 3000);
  }

  async function handleReject(u) {
    if (!confirm(`Rejeitar ${u.nome || u.email}?`)) return;
    try {
      await rejectUser(u.uid);
      setToast(`${u.nome || u.email} rejeitado.`);
      loadUsers();
    } catch(e) { setToast('Erro: ' + e.message); }
    setTimeout(()=>setToast(''), 3000);
  }

  const pending = users.filter(u => u.status === 'pendente');
  const active = users.filter(u => u.status !== 'pendente' && u.status !== 'rejeitado');
  const rejected = users.filter(u => u.status === 'rejeitado');

  const roleBadge = (role) => {
    const colors = { diretor:'#00C896', comercial:'#3b82f6', financeiro:'#fbbf24', logistica:'#f97316', cliente:'#8B8D97' };
    return { padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700, background:(colors[role]||'#8B8D97')+'20', color:colors[role]||'#8B8D97', textTransform:'uppercase' };
  };

  return (
    <div style={{minHeight:'100vh',background:'#08090D',fontFamily:'Outfit, sans-serif',color:'#fff'}}>
      <header style={{background:'#0a0c12ee',backdropFilter:'blur(16px)',borderBottom:'1px solid #1E2028',padding:'14px 28px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <Link to="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
            <div style={{width:32,height:32,background:'#00C896',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:16,color:'#2E2C3A'}}>e</div>
            <div style={{fontSize:17,fontWeight:800,color:'#fff'}}>Admin <span style={{color:'#00C896'}}>Seu Full</span></div>
          </Link>
        </div>
        <div style={{display:'flex',gap:12}}>
          <Link to="/wms" style={{padding:'6px 14px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#00C896',fontSize:12,fontWeight:600,textDecoration:'none'}}>WMS</Link>
          <Link to="/portal" style={{padding:'6px 14px',background:'#161820',border:'1px solid #1E2028',borderRadius:6,color:'#C0C2CC',fontSize:12,fontWeight:600,textDecoration:'none'}}>Portal</Link>
        </div>
      </header>

      <div style={{maxWidth:1100,margin:'0 auto',padding:32}}>
        <h1 style={{fontSize:28,fontWeight:800,marginBottom:8}}>Gestão de Usuários</h1>
        <p style={{color:'#8B8D97',marginBottom:32}}>{users.length} usuários cadastrados · {pending.length} pendentes de aprovação</p>

        {/* Pending */}
        {pending.length > 0 && (
          <div style={{marginBottom:40}}>
            <h2 style={{fontSize:16,fontWeight:700,color:'#fbbf24',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,background:'#fbbf24',borderRadius:'50%',animation:'pulse 2s infinite'}}></span>
              Aguardando Aprovação ({pending.length})
            </h2>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {pending.map(u => (
                <div key={u.uid} style={{background:'#0F1117',border:'1px solid #fbbf2440',borderRadius:14,padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:700}}>{u.nome || u.email}</div>
                    <div style={{fontSize:13,color:'#8B8D97',marginTop:4}}>{u.email} · {u.cnpj || 'Sem CNPJ'} · {u.telefone || ''}</div>
                    {u.endereco && <div style={{fontSize:12,color:'#8B8D97',marginTop:2}}>{u.endereco}, {u.cidade}/{u.estado}</div>}
                    {u.responsavel && <div style={{fontSize:12,color:'#C0C2CC',marginTop:2}}>Resp: {u.responsavel}</div>}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>{setApproveModal(u);setLojaInput(u.nome||'');}} style={{padding:'10px 20px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13}}>Aprovar</button>
                    <button onClick={()=>handleReject(u)} style={{padding:'10px 20px',background:'#dc262620',color:'#fca5a5',border:'1px solid #dc262640',borderRadius:8,fontWeight:600,cursor:'pointer',fontFamily:'inherit',fontSize:13}}>Rejeitar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active */}
        <h2 style={{fontSize:16,fontWeight:700,color:'#00C896',marginBottom:16}}>Usuários Ativos ({active.length})</h2>
        <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,overflow:'auto',marginBottom:32}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>
              <th style={thS}>Nome</th><th style={thS}>Email</th><th style={thS}>Perfil</th><th style={thS}>Loja</th><th style={thS}>Status</th>
            </tr></thead>
            <tbody>
              {active.map(u => (
                <tr key={u.uid}>
                  <td style={tdS}>{u.nome || '-'}</td>
                  <td style={{...tdS,fontSize:12,fontFamily:'monospace'}}>{u.email}</td>
                  <td style={tdS}><span style={roleBadge(u.role)}>{u.role}</span></td>
                  <td style={tdS}>{u.loja || '-'}</td>
                  <td style={tdS}><span style={{color:'#00C896',fontWeight:600}}>Ativo</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rejected.length > 0 && (
          <>
            <h2 style={{fontSize:16,fontWeight:700,color:'#dc2626',marginBottom:16}}>Rejeitados ({rejected.length})</h2>
            <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:14,overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr><th style={thS}>Nome</th><th style={thS}>Email</th></tr></thead>
                <tbody>{rejected.map(u => <tr key={u.uid}><td style={tdS}>{u.nome||'-'}</td><td style={tdS}>{u.email}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Approve Modal */}
      {approveModal && (
        <div style={{position:'fixed',inset:0,background:'#000c',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setApproveModal(null)}>
          <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:16,padding:32,maxWidth:440,width:'100%'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:20,fontWeight:800,marginBottom:8}}>Aprovar {approveModal.nome}</h3>
            <p style={{color:'#8B8D97',fontSize:14,marginBottom:20}}>Defina o nome da loja que este cliente verá no portal. Deve corresponder ao campo "Loja" usado no WMS.</p>
            <label style={{fontSize:12,fontWeight:600,color:'#8B8D97',textTransform:'uppercase',letterSpacing:1,marginBottom:6,display:'block'}}>Nome da Loja no WMS</label>
            <input value={lojaInput} onChange={e=>setLojaInput(e.target.value)} style={{width:'100%',padding:'12px 16px',background:'#161820',border:'1.5px solid #1E2028',borderRadius:10,color:'#fff',fontSize:14,fontFamily:'inherit',outline:'none',marginBottom:20,boxSizing:'border-box'}} placeholder="Ex: LUGU, ASM, HOZ..." />
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setApproveModal(null)} style={{padding:'10px 20px',background:'transparent',color:'#8B8D97',border:'1px solid #1E2028',borderRadius:8,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
              <button onClick={handleApprove} style={{padding:'10px 24px',background:'#00C896',color:'#2E2C3A',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Aprovar →</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{position:'fixed',bottom:24,right:24,padding:'14px 24px',background:'#00C896',color:'#2E2C3A',fontWeight:700,borderRadius:10,fontSize:14,zIndex:300}}>{toast}</div>}
      <style>{`@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}`}</style>
    </div>
  );
}

const thS = {textAlign:'left',padding:'12px 16px',borderBottom:'1px solid #1E2028',fontSize:11,fontWeight:700,color:'#8B8D97',textTransform:'uppercase',letterSpacing:.5};
const tdS = {padding:'12px 16px',borderBottom:'1px solid #1E202880'};
