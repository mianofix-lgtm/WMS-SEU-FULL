import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from './firebase.js';
import { useAuth } from './App.jsx';

const S = {
  page: { minHeight:'100vh', background:'#08090D', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Outfit, sans-serif', padding:'24px' },
  card: { background:'#0F1117', border:'1px solid #1E2028', borderRadius:24, padding:'56px 48px', width:'100%', maxWidth:440, position:'relative', overflow:'hidden' },
  topBar: { position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg, #00C896, #00C89600)' },
  logo: { textAlign:'center', marginBottom:40 },
  logoIcon: { width:56, height:56, background:'#00C896', borderRadius:14, display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:28, color:'#2E2C3A', marginBottom:16 },
  logoText: { fontSize:28, fontWeight:800, color:'#fff', letterSpacing:-0.5 },
  logoSpan: { color:'#00C896' },
  sub: { fontSize:14, color:'#8B8D97', marginTop:8 },
  label: { display:'block', fontSize:13, fontWeight:600, color:'#8B8D97', textTransform:'uppercase', letterSpacing:1, marginBottom:8 },
  input: { width:'100%', padding:'14px 18px', background:'#161820', border:'1.5px solid #1E2028', borderRadius:10, color:'#fff', fontSize:15, fontFamily:'inherit', outline:'none', transition:'border-color 0.2s', marginBottom:20, boxSizing:'border-box' },
  btn: { width:'100%', padding:'16px', background:'#00C896', color:'#2E2C3A', fontFamily:'inherit', fontSize:16, fontWeight:700, border:'none', borderRadius:10, cursor:'pointer', transition:'all 0.25s', letterSpacing:0.3 },
  err: { background:'#dc262620', border:'1px solid #dc262640', borderRadius:10, padding:'12px 16px', color:'#fca5a5', fontSize:14, marginBottom:20, textAlign:'center' },
  warn: { background:'#fbbf2420', border:'1px solid #fbbf2440', borderRadius:10, padding:'16px', color:'#fbbf24', fontSize:14, marginBottom:20, textAlign:'center', lineHeight:1.6 },
  links: { display:'flex', justifyContent:'space-between', marginTop:24 },
  link: { color:'#8B8D97', fontSize:14, textDecoration:'none' },
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState('');
  const nav = useNavigate();
  const { setUser } = useAuth();

  async function handleLogin(e) {
    e.preventDefault();
    setErr(''); setPending(false);
    setLoading(true);
    try {
      const u = await login(email, pass);
      setUser(u);
      if (u.role === 'cliente') nav('/portal');
      else if (u.role === 'diretor') nav('/wms');
      else if (u.role === 'financeiro') nav('/portal');
      else nav('/wms');
    } catch (error) {
      if (error.message === 'PENDENTE') {
        setPending(true);
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setErr('Email ou senha incorretos.');
      } else if (error.code === 'auth/too-many-requests') {
        setErr('Muitas tentativas. Aguarde alguns minutos.');
      } else {
        setErr(error.message || 'Erro ao fazer login.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.topBar}></div>
        <div style={S.logo}>
          <div style={S.logoIcon}>e</div>
          <div style={S.logoText}>Seu<span style={S.logoSpan}>Full</span></div>
          <div style={S.sub}>Acesse o Portal do Cliente ou o WMS</div>
        </div>

        {err && <div style={S.err}>{err}</div>}
        {pending && <div style={S.warn}>Seu cadastro está em análise. Você será notificado quando for aprovado.</div>}

        <form onSubmit={handleLogin}>
          <label style={S.label}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            onFocus={() => setFocusField('email')} onBlur={() => setFocusField('')}
            style={{...S.input, borderColor: focusField==='email'?'#00C896':'#1E2028'}}
            placeholder="seu@email.com" required autoComplete="email" />

          <label style={S.label}>Senha</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)}
            onFocus={() => setFocusField('pass')} onBlur={() => setFocusField('')}
            style={{...S.input, borderColor: focusField==='pass'?'#00C896':'#1E2028'}}
            placeholder="••••••••" required autoComplete="current-password" />

          <button type="submit" disabled={loading} style={{...S.btn, opacity:loading?0.7:1}}>
            {loading ? 'Entrando...' : 'Entrar →'}
          </button>
        </form>

        <div style={S.links}>
          <Link to="/" style={S.link}>← Voltar ao site</Link>
          <Link to="/cadastro" style={{...S.link, color:'#00C896', fontWeight:600}}>Criar conta →</Link>
        </div>
      </div>
    </div>
  );
}
