import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuth, getPerms, getEffectivePerms, autoBackup, checkPerm as _checkPerm } from './firebase.js';
import Landing from './Landing.jsx';
import Login from './Login.jsx';
import Portal from './Portal.jsx';
import Wms from './Wms.jsx';
import Register from './Register.jsx';
import Admin from './Admin.jsx';
import Billing from './Billing.jsx';
import Dashboard from './Dashboard.jsx';

// ─── Auth Context ────────────────────────────────────────
export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

function ProtectedRoute({ children, roles, requiredPerm }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#08090D',color:'#00C896',fontFamily:'Outfit',fontSize:18}}>Carregando...</div>;
  if (!user) return <Navigate to="/login" />;
  const roleOk = !roles || roles.includes(user.role);
  if (!roleOk && (!requiredPerm || !_checkPerm(user, requiredPerm))) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuth((u) => {
      setUser(u);
      setLoading(false);
      // Auto-backup daily for directors
      if (u?.role === 'diretor') {
        autoBackup().then(done => {
          if (done) console.log('[Seu Full] Backup automático do dia realizado.');
        });
      }
    });
    return unsub;
  }, []);

  const perms = user ? getEffectivePerms(user.role, user.permissionOverrides) : {};
  const checkPerm = (permKey) => _checkPerm(user, permKey);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, perms, checkPerm }}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/portal" element={
          <ProtectedRoute roles={['diretor','gerente','comercial','financeiro','cliente']}>
            <Portal />
          </ProtectedRoute>
        } />
        <Route path="/wms" element={
          <ProtectedRoute roles={['diretor','comercial','logistica','financeiro']} requiredPerm="wms.ver_estoque">
            <Wms />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute roles={['diretor']} requiredPerm="admin.usuarios">
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/billing" element={
          <ProtectedRoute roles={['diretor','comercial']} requiredPerm="billing.ver">
            <Billing />
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute roles={['diretor','comercial','financeiro']} requiredPerm="dashboard.ver">
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AuthContext.Provider>
  );
}
