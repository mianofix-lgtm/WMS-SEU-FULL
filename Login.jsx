import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, sendPasswordReset } from './firebase.js';
import { LOGO_ICON } from './logo.js';
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
  forgotBtn: { display:'block', width:'100%', marginTop:14, background:'transparent', border:'none', color:'#8B8D97', fontSize:13, fontFamily:'inherit', cursor:'pointer', textAlign:'center', padding:4, textDecoration:'underline' },
  ovl: { position:'fixed', inset:0, background:'#000c', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 },
  modal: { background:'#0F1117', border:'1px solid #1E2028', borderRadius:16, padding:32, maxWidth:420, width:'100%' },
  ok: { background:'#00C89615', border:'1px solid #00C89640', borderRadius:10, padding:'14px 16px', color:'#00C896', fontSize:13, marginBottom:20, lineHeight:1.6 },
  btnGhost: { padding:'10px 20px', background:'transparent', color:'#8B8D97', border:'1px solid #1E2028', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:14 },
  btnSm: { padding:'10px 22px', background:'#00C896', color:'#2E2C3A', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontFamily:'inherit', fontSize:14 },
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);
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

  function openReset() {
    setResetEmail(email);
    setResetErr(''); setResetSent(false);
    setResetOpen(true);
  }

  // Always reports the same generic success message, so a stranger cannot use
  // this form to find out which e-mails are registered (enumeration).
  async function handleReset(e) {
    e.preventDefault();
    setResetErr('');
    setResetting(true);
    try {
      await sendPasswordReset(resetEmail);
      setResetSent(true);
    } catch (error) {
      if (error.code === 'auth/invalid-email') {
        setResetErr('E-mail inválido. Verifique o endereço digitado.');
      } else if (error.code === 'auth/too-many-requests') {
        setResetErr('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else if (error.code === 'auth/user-not-found') {
        setResetSent(true); // same response as success — never confirm existence
      } else {
        setResetErr('Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
      }
    } finally {
      setResetting(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.topBar}></div>
        <div style={S.logo}>
          <img src={LOGO_ICON} alt="Seu Full" style={{width:56,height:56,borderRadius:14}} />
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

        <button type="button" onClick={openReset} style={S.forgotBtn}>Esqueci minha senha</button>

        <div style={S.links}>
          <Link to="/" style={S.link}>← Voltar ao site</Link>
          <Link to="/cadastro" style={{...S.link, color:'#00C896', fontWeight:600}}>Criar conta →</Link>
        </div>
      </div>

      {resetOpen && (
        <div style={S.ovl} onClick={() => setResetOpen(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{fontSize:20, fontWeight:800, marginBottom:8}}>Redefinir senha</h3>
            {resetSent ? (
              <>
                <div style={S.ok}>
                  Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha.
                  Confira a caixa de entrada e o spam.
                </div>
                <div style={{display:'flex', justifyContent:'flex-end'}}>
                  <button onClick={() => setResetOpen(false)} style={S.btnSm}>Fechar</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleReset}>
                <p style={{color:'#8B8D97', fontSize:14, marginBottom:20, lineHeight:1.6}}>
                  Informe seu e-mail e enviaremos um link para você criar uma nova senha.
                </p>
                {resetErr && <div style={S.err}>{resetErr}</div>}
                <label style={S.label}>Email</label>
                <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                  onFocus={() => setFocusField('reset')} onBlur={() => setFocusField('')}
                  style={{...S.input, borderColor: focusField==='reset'?'#00C896':'#1E2028'}}
                  placeholder="seu@email.com" required autoFocus autoComplete="email" />
                <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
                  <button type="button" onClick={() => setResetOpen(false)} style={S.btnGhost}>Cancelar</button>
                  <button type="submit" disabled={resetting} style={{...S.btnSm, opacity:resetting?0.7:1}}>
                    {resetting ? 'Enviando...' : 'Enviar link →'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
