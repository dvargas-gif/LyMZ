import { DURACION, EASING, STAGGER_MS } from './tokens.js';

/**
 * Variantes de Framer Motion (props {initial,animate,transition}) --
 * cada una respeta `reducido` (de useReducedMotion()) devolviendo una
 * transición instantánea, nunca desactivando el estado final.
 */

/** Entrada fade + slide-up 8px, con stagger opcional por índice (skeletons, listas, cards). */
export function entradaConStagger(indice = 0, reducido = false) {
  if (reducido) {
    return { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURACION.estado, ease: EASING.entrada, delay: indice * (STAGGER_MS / 1000) },
  };
}

/** Pulso único de escala (1 -> 1.03 -> 1) para acompañar un cambio de valor detectado (ej. Realtime). */
export function pulsoCambio(reducido = false) {
  if (reducido) return { animate: { scale: 1 }, transition: { duration: 0 } };
  return {
    animate: { scale: [1, 1.03, 1] },
    transition: { duration: DURACION.estado, ease: EASING.cambio },
  };
}

/** Transición estándar para animaciones `layout` de Framer Motion (FLIP en cards/listas que reordenan). */
export function transicionLayout(reducido = false) {
  return { duration: reducido ? 0 : DURACION.estado, ease: EASING.cambio };
}
