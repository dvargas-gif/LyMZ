import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from './auth.service.js';
import { useCierreSesionPorInactividad } from './useCierreSesionPorInactividad.js';

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
  const logout = useCallback(() => setSesion(null), []);

  // Seguridad extra pedida por el usuario: un token de Supabase todavía
  // válido no alcanza si nadie tocó nada en un rato -- cierra sola tras
  // 15 min de inactividad (ver useCierreSesionPorInactividad.js).
  useCierreSesionPorInactividad(!!sesion, logout);

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
