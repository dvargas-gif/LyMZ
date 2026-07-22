import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from './auth.service.js';
import { useCierreSesionPorInactividad } from './useCierreSesionPorInactividad.js';
import { suscribirPresenciaGlobal } from '../../shared/services/presencia.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [listo, setListo] = useState(false);
  const [conectados, setConectados] = useState(new Map()); // Map<usuarioId, {nombre, apodo, rol}> -- ver presencia.service.js

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

  // Presencia en tiempo real (2026-07-22, pedido explícito: "poder ver
  // quién está conectado") -- efecto APARTE del de arriba, con su propio
  // cleanup, para no mezclar dos ciclos de vida distintos en un solo useEffect.
  useEffect(() => {
    if (!sesion) { setConectados(new Map()); return; }
    return suscribirPresenciaGlobal(sesion, setConectados);
  }, [sesion?.usuarioId]); // eslint-disable-line

  if (!listo) return null; // evita parpadeo mientras se resuelve la sesión de Supabase

  return (
    <AuthContext.Provider value={{ sesion, login, logout, conectados }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
