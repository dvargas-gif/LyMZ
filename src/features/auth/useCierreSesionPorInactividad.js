import { useEffect } from 'react';
import { authService } from './auth.service.js';

const MINUTOS_INACTIVIDAD = 15;
const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

/**
 * Cierra la sesión sola tras MINUTOS_INACTIVIDAD sin actividad del usuario
 * -- pedido explícito ("seguridad extra", que no baste con tener el token
 * de Supabase todavía válido si nadie tocó nada en un rato). Llama a
 * authService.logout() (signOut real contra Supabase, invalida el token)
 * y a `onExpirar` (limpia la sesión en el contexto) -- de ahí en más
 * ProtectedRoute.jsx ya redirige solo a /login al ver `sesion === null`,
 * sin necesitar un `navigate()` acá.
 *
 * Solo escucha mientras hay sesión (`activo`): nada que reiniciar en la
 * pantalla de login misma.
 */
export function useCierreSesionPorInactividad(activo, onExpirar) {
  useEffect(() => {
    if (!activo) return;
    let temporizador;

    function expirar() {
      authService.logout().finally(onExpirar);
    }

    function reiniciar() {
      clearTimeout(temporizador);
      temporizador = setTimeout(expirar, MINUTOS_INACTIVIDAD * 60 * 1000);
    }

    reiniciar();
    EVENTOS_ACTIVIDAD.forEach(ev => window.addEventListener(ev, reiniciar, { passive: true }));
    return () => {
      clearTimeout(temporizador);
      EVENTOS_ACTIVIDAD.forEach(ev => window.removeEventListener(ev, reiniciar));
    };
  }, [activo, onExpirar]);
}
