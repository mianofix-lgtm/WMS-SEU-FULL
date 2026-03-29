import { useState } from 'react';
import { createUser } from '../firebase.js';
import { Link } from 'react-router-dom';

export default function Setup() {
  const [status, setStatus] = useState('idle');
  const [msg, setMsg] = useState('');

  const USERS = [
    { email: 'daniel.oliveira@mianofix.com.br', password: 'ironman6in30#', data: { nome: 'Daniel Oliveira', role: 'diretor', loja: '' } },
    { email: 'mianofix@gmail.com', password: 'cliente2026#', data: { nome: 'Mianofix', role: 'cliente', loja: 'Mianofix', canSeeValues: false } },
    { email: 'iscaliengenharia@gmail.com', password: 'cliente2026#', data: { nome: 'Iscali', role: 'cliente', loja: 'Iscali', canSeeValues: false } },
  ];

  async function runSetup() {
    setStatus('running');
    setMsg('');
    const results = [];

    for (const u of USERS) {
      try {
        const uid = await createUser(u.email, u.password, u.data);
        results.push(`✅ ${u.email} → ${u.data.role} (uid: ${uid})`);
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          results.push(`⚠️ ${u.email} → já existe`);
        } else {
          results.push(`❌ ${u.email} → ${e.message}`);
        }
      }
    }

    setMsg(results.join('\n'));
    setStatus('done');
  }

  return (
    <div style={{minHeight:'100vh',background:'#08090D',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Outfit',padding:24}}>
      <div style={{background:'#0F1117',border:'1px solid #1E2028',borderRadius:20,padding:48,maxWidth:600,width:'100%',color:'#fff'}}>
        <h1 style={{fontSize:28,fontWeight:800,marginBottom:8}}>Setup Inicial</h1>
        <p style={{color:'#8B8D97',marginBottom:32}}>Cria os usuários iniciais no Firebase Auth + Firestore. Execute apenas uma vez.</p>

        <div style={{background:'#161820',borderRadius:10,padding:16,marginBottom:24}}>
          <p style={{fontSize:13,fontWeight:600,color:'#00C896',marginBottom:12}}>Usuários que serão criados:</p>
          {USERS.map((u,i) => (
            <div key={i} style={{fontSize:13,color:'#C0C2CC',marginBottom:6}}>
              <span style={{color:'#00C896',fontWeight:700}}>{u.data.role}</span> → {u.email}
            </div>
          ))}
        </div>

        {status === 'idle' && (
          <button onClick={runSetup} style={{width:'100%',padding:16,background:'#00C896',color:'#2E2C3A',fontFamily:'inherit',fontSize:16,fontWeight:700,border:'none',borderRadius:10,cursor:'pointer'}}>
            Criar Usuários →
          </button>
        )}

        {status === 'running' && (
          <div style={{textAlign:'center',color:'#00C896',fontSize:16}}>Criando usuários...</div>
        )}

        {msg && (
          <pre style={{background:'#161820',borderRadius:10,padding:16,marginTop:20,fontSize:13,color:'#C0C2CC',whiteSpace:'pre-wrap',lineHeight:1.8}}>{msg}</pre>
        )}

        {status === 'done' && (
          <div style={{marginTop:24,textAlign:'center'}}>
            <p style={{color:'#fbbf24',fontSize:14,marginBottom:16}}>⚠ Após confirmar que tudo funcionou, remova a rota /setup do App.jsx e faça novo deploy.</p>
            <Link to="/login" style={{color:'#00C896',fontWeight:700,fontSize:16}}>Ir para Login →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
