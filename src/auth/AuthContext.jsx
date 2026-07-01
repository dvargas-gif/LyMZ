import { createContext, useContext, useEffect, useState } from 'react';
import { authService } from './auth.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(() => authService.getSesion());
  const [listo, setListo] = useState(false);

  useEffect(() => {
    authService.init().then(() => setListo(true));
  }, []);

  function login(nuevaSesion) { setSesion(nuevaSesion); }
  function logout() { setSesion(null); }

  if (!listo) return null; // evita parpadeo mientras se siembran usuarios demo

  return (
    <AuthContext.Provider value={{ sesion, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
