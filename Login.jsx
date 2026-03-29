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
  inputFocus: { borderColor:'#00C896' },
  btn: { width:'100%', padding:'16px', background:'#00C896', color:'#2E2C3A', fontFamily:'inherit', fontSize:16, fontWeight:700, border:'none', borderRadius:10, cursor:'pointer', transition:'all 0.25s', letterSpacing:0.3 },
  btnHover: { background:'#00daa6', boxShadow:'0 8px 30px #00C89640' },
  err: { background:'#dc262620', border:'1px solid #dc262640', borderRadius:10, padding:'12px 16px', color:'#fca5a5', fontSize:14, marginBottom:20, textAlign:'center' },
  back: { display:'block', textAlign:'center', color:'#8B8D97', fontSize:14, marginTop:24, textDecoration:'none' },
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState('');
  const [hoverBtn, setHoverBtn] = useState(false);
  const nav = useNavigate();
  const { setUser } = useAuth();

  async function handleLogin(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const u = await login(email, pass);
      setUser(u);
      // Redirect based on role
      if (u.role === 'cliente') {
        nav('/portal');
      } else {
        nav('/wms');
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
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

        <form onSubmit={handleLogin}>
          <label style={S.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onFocus={() => setFocusField('email')}
            onBlur={() => setFocusField('')}
            style={{...S.input, ...(focusField==='email' ? S.inputFocus : {})}}
            placeholder="seu@email.com"
            required
            autoComplete="email"
          />

          <label style={S.label}>Senha</label>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onFocus={() => setFocusField('pass')}
            onBlur={() => setFocusField('')}
            style={{...S.input, ...(focusField==='pass' ? S.inputFocus : {})}}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            style={{...S.btn, ...(hoverBtn ? S.btnHover : {}), opacity: loading ? 0.7 : 1}}
            onMouseEnter={() => setHoverBtn(true)}
            onMouseLeave={() => setHoverBtn(false)}
          >
            {loading ? 'Entrando...' : 'Entrar →'}
          </button>
        </form>

        <Link to="/" style={S.back}>← Voltar ao site</Link>
      </div>
    </div>
  );
}
