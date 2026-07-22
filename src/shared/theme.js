import { useEffect, useState } from 'react';

/**
 * Modo oscuro real (2026-07-22) -- reemplaza al selector de "Tema de
 * colores" de EditarCroquisPanel.jsx (eliminado: guardaba un valor que
 * nada leía). Preferencia PERSONAL por dispositivo (localStorage, como el
 * modo oscuro del sistema operativo) -- a diferencia de config_mapa, que
 * era una config global para todos los que abrieran el mapa, esto es una
 * preferencia de accesibilidad de quien mira la pantalla, no del croquis.
 *
 * Sin preferencia guardada todavía, se sigue `prefers-color-scheme` del
 * sistema (ver el `@media` correspondiente en index.css) -- el atributo
 * `data-theme` solo se escribe una vez la persona elige explícitamente.
 */
const CLAVE_STORAGE = 'wms-tema';

export function obtenerTemaGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE);
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : null;
  } catch {
    return null; // localStorage bloqueado (modo privado estricto, etc.) -- se sigue el tema del sistema sin persistir nada
  }
}

export function aplicarTema(tema) {
  if (tema) document.documentElement.setAttribute('data-theme', tema);
  else document.documentElement.removeAttribute('data-theme');
}

/** [tema visible ('claro'|'oscuro'), alternarTema()] -- `tema` refleja SIEMPRE el atributo real del DOM, incluida la primera vez que se sigue el del sistema (nunca 'null' hacia el botón que lo muestra). */
export function useTema() {
  const [tema, setTema] = useState(() => obtenerTemaGuardado() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'));

  useEffect(() => {
    aplicarTema(tema);
    try { localStorage.setItem(CLAVE_STORAGE, tema); } catch { /* modo privado estricto -- no persiste, no rompe */ }
  }, [tema]);

  function alternarTema() {
    setTema(actual => (actual === 'oscuro' ? 'claro' : 'oscuro'));
  }

  return [tema, alternarTema];
}
