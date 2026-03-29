import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuth, getPerms } from './firebase.js';
import Landing from './Landing.jsx';
import Login from './Login.jsx';
import Portal from './Portal.jsx';
import Wms from './Wms.jsx';
import Register from './Register.jsx';
import Admin from './Admin.jsx';
import Setup2 from './Setup2.jsx';

// ─── Auth Context ────────────────────────────────────────
export const AuthContext = createContext(null);
export function useAuth() { return useContext(AuthContext); }

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#08090D',color:'#00C896',fontFamily:'Outfit',fontSize:18}}>Carregando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuth((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const perms = user ? getPerms(user.role) : {};

  return (
    <AuthContext.Provider value={{ user, setUser, loading, perms }}>
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
          <ProtectedRoute roles={['diretor','comercial','logistica','financeiro']}>
            <Wms />
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute roles={['diretor']}>
            <Admin />
          </ProtectedRoute>
        } />
        <Route path="/setup2" element={<Setup2 />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AuthContext.Provider>
  );
}
