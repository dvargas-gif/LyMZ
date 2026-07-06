import { useEffect, useState } from 'react';

const CONSULTA = '(prefers-reduced-motion: reduce)';

/** Lectura puntual (para código fuera de un componente React). */
export function prefiereMovimientoReducido() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(CONSULTA).matches;
}

/** Hook reactivo -- si el usuario cambia la preferencia del sistema en vivo, los componentes ya montados se enteran. */
export function useReducedMotion() {
  const [reducido, setReducido] = useState(prefiereMovimientoReducido);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(CONSULTA);
    const onChange = () => setReducido(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reducido;
}
