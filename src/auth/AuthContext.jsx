import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from './auth.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    authService.getSesion().then(s => { setSesion(s); setListo(true); });
    const { data: sub } = authService.onAuthStateChange(setSesion);
    return () => sub.subscription.unsubscribe();
  }, []);

  function login(nuevaSesion) { setSesion(nuevaSesion); }
  function logout() { setSesion(null); }

  if (!listo) return null; // evita parpadeo mientras se resuelve la sesión de Supabase

  return (
    <AuthContext.Provider value={{ sesion, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
