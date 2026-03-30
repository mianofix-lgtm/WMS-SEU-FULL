import { useState } from 'react';
import { Link } from 'react-router-dom';
import { registerClient } from './firebase.js';
import { LOGO_ICON } from './logo.js';

const S = {
  page: { minHeight:'100vh', background:'#08090D', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Outfit, sans-serif', padding:'24px' },
  card: { background:'#0F1117', border:'1px solid #1E2028', borderRadius:24, padding:'48px 40px', width:'100%', maxWidth:560, position:'relative', overflow:'hidden' },
  topBar: { position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg, #00C896, #00C89600)' },
  logo: { textAlign:'center', marginBottom:32 },
  logoIcon: { width:56, height:56, background:'#00C896', borderRadius:14, display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:28, color:'#2E2C3A', marginBottom:12 },
  logoText: { fontSize:28, fontWeight:800, color:'#fff', letterSpacing:-0.5 },
  logoSpan: { color:'#00C896' },
  sub: { fontSize:14, color:'#8B8D97', marginTop:8 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#8B8D97', textTransform:'uppercase', letterSpacing:1, marginBottom:6 },
  input: { width:'100%', padding:'12px 16px', background:'#161820', border:'1.5px solid #1E2028', borderRadius:10, color:'#fff', fontSize:14, fontFamily:'inherit', outline:'none', marginBottom:16, boxSizing:'border-box' },
  row: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  btn: { width:'100%', padding:'16px', background:'#00C896', color:'#2E2C3A', fontFamily:'inherit', fontSize:16, fontWeight:700, border:'none', borderRadius:10, cursor:'pointer', transition:'all 0.25s', letterSpacing:0.3, marginTop:8 },
  err: { background:'#dc262620', border:'1px solid #dc262640', borderRadius:10, padding:'12px 16px', color:'#fca5a5', fontSize:14, marginBottom:16, textAlign:'center' },
  ok: { background:'#00C89620', border:'1px solid #00C89640', borderRadius:10, padding:'20px', color:'#00C896', fontSize:15, textAlign:'center', lineHeight:1.6 },
  back: { display:'block', textAlign:'center', color:'#8B8D97', fontSize:14, marginTop:20, textDecoration:'none' },
};

export default function Register() {
  const [form, setForm] = useState({ empresa:'', cnpj:'', email:'', telefone:'', endereco:'', cidade:'', estado:'SP', responsavel:'', password:'', password2:'' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  function upd(k,v) { setForm(f=>({...f,[k]:v})); }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!form.empresa || !form.cnpj || !form.email || !form.telefone || !form.responsavel || !form.password) {
      setErr('Preencha todos os campos obrigatórios.'); return;
    }
    if (form.password.length < 6) { setErr('Senha deve ter pelo menos 6 caracteres.'); return; }
    if (form.password !== form.password2) { setErr('Senhas não conferem.'); return; }

    setLoading(true);
    try {
      await registerClient(form.email, form.password, {
        nome: form.empresa,
        loja: form.empresa,
        cnpj: form.cnpj,
        telefone: form.telefone,
        endereco: form.endereco,
        cidade: form.cidade,
        estado: form.estado,
        responsavel: form.responsavel,
      });
      setDone(true);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        setErr('Este email já está cadastrado.');
      } else {
        setErr(error.message || 'Erro ao cadastrar.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.topBar}></div>
        <div style={S.logo}>
          <img src={LOGO_ICON} alt="Seu Full" style={{width:56,height:56,borderRadius:14}} />
          <div style={S.logoText}>Seu<span style={S.logoSpan}>Full</span></div>
        </div>
        <div style={S.ok}>
          <div style={{fontSize:32,marginBottom:12}}>✓</div>
          <strong>Cadastro enviado com sucesso!</strong><br/><br/>
          Sua solicitação será analisada pela nossa equipe. Você receberá acesso ao portal assim que for aprovado.
        </div>
        <Link to="/login" style={S.back}>← Voltar ao login</Link>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.topBar}></div>
        <div style={S.logo}>
          <img src={LOGO_ICON} alt="Seu Full" style={{width:56,height:56,borderRadius:14}} />
          <div style={S.logoText}>Seu<span style={S.logoSpan}>Full</span></div>
          <div style={S.sub}>Cadastro de novo cliente — Portal Seu Full</div>
        </div>

        {err && <div style={S.err}>{err}</div>}

        <form onSubmit={handleSubmit}>
          <label style={S.label}>Nome da Empresa *</label>
          <input style={S.input} value={form.empresa} onChange={e=>upd('empresa',e.target.value)} placeholder="Razão Social ou Nome Fantasia" required />

          <div style={S.row}>
            <div>
              <label style={S.label}>CNPJ *</label>
              <input style={S.input} value={form.cnpj} onChange={e=>upd('cnpj',e.target.value)} placeholder="00.000.000/0000-00" required />
            </div>
            <div>
              <label style={S.label}>Telefone *</label>
              <input style={S.input} value={form.telefone} onChange={e=>upd('telefone',e.target.value)} placeholder="(11) 99999-9999" required />
            </div>
          </div>

          <label style={S.label}>Responsável *</label>
          <input style={S.input} value={form.responsavel} onChange={e=>upd('responsavel',e.target.value)} placeholder="Nome do responsável" required />

          <label style={S.label}>Endereço Fiscal</label>
          <input style={S.input} value={form.endereco} onChange={e=>upd('endereco',e.target.value)} placeholder="Rua, número, bairro" />

          <div style={S.row}>
            <div>
              <label style={S.label}>Cidade</label>
              <input style={S.input} value={form.cidade} onChange={e=>upd('cidade',e.target.value)} placeholder="São Paulo" />
            </div>
            <div>
              <label style={S.label}>Estado</label>
              <input style={S.input} value={form.estado} onChange={e=>upd('estado',e.target.value)} placeholder="SP" />
            </div>
          </div>

          <label style={S.label}>Email de Acesso *</label>
          <input style={S.input} type="email" value={form.email} onChange={e=>upd('email',e.target.value)} placeholder="contato@empresa.com.br" required />

          <div style={S.row}>
            <div>
              <label style={S.label}>Senha *</label>
              <input style={S.input} type="password" value={form.password} onChange={e=>upd('password',e.target.value)} placeholder="Mín. 6 caracteres" required />
            </div>
            <div>
              <label style={S.label}>Confirmar Senha *</label>
              <input style={S.input} type="password" value={form.password2} onChange={e=>upd('password2',e.target.value)} placeholder="Repita a senha" required />
            </div>
          </div>

          <button type="submit" disabled={loading} style={{...S.btn, opacity:loading?0.7:1}}>
            {loading ? 'Enviando...' : 'Solicitar Cadastro →'}
          </button>
        </form>

        <Link to="/login" style={S.back}>Já tem conta? Faça login →</Link>
      </div>
    </div>
  );
}
