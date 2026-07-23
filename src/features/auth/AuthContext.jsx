import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from './auth.service.js';
import { useCierreSesionPorInactividad } from './useCierreSesionPorInactividad.js';
import { suscribirPresenciaGlobal } from '../../shared/services/presencia.service.js';
import { permisosRolService } from './permisosRol.service.js';
import { establecerPermisosPersonalizados } from './roles.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [listo, setListo] = useState(false);
  const [conectados, setConectados] = useState(new Map()); // Map<usuarioId, {nombre, apodo, rol}> -- ver presencia.service.js
  // Bumped cada vez que se recarga la matriz de permisos por rol (ver
  // roles.js/permisosRol.service.js) -- `puede()` es síncrona y lee una
  // variable de módulo, así que por sí sola no dispara ningún re-render.
  // Este contador viaja en el value del contexto solo para ESO: cualquier
  // cambio de valor acá fuerza a Shell (y en cascada a Sidebar) a
  // re-renderizar y volver a evaluar puede() con la matriz ya actualizada.
  const [permisosVersion, setPermisosVersion] = useState(0);

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

  // Matriz de permisos por rol editable (2026-07-23) -- si la tabla
  // permisos_rol todavía no existe (SQL sin aplicar) o la carga falla por
  // cualquier motivo, se atrapa acá y se sigue usando el default fijo de
  // roles.js sin romper nada. `refrescarPermisos` queda expuesta para que
  // UsuariosPanel la llame después de guardar un cambio y se vea reflejado
  // en el resto de la app sin recargar la página.
  const refrescarPermisos = useCallback(async () => {
    try {
      const filas = await permisosRolService.listar();
      establecerPermisosPersonalizados(filas);
    } catch { /* tabla sin aplicar todavía o sin acceso -- se sigue con el default de roles.js */ }
    setPermisosVersion(v => v + 1);
  }, []);

  useEffect(() => { if (sesion) refrescarPermisos(); }, [sesion?.usuarioId]); // eslint-disable-line

  if (!listo) return null; // evita parpadeo mientras se resuelve la sesión de Supabase

  return (
    <AuthContext.Provider value={{ sesion, login, logout, conectados, permisosVersion, refrescarPermisos }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
