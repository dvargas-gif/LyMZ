import { DURACION, EASING, MUELLE, STAGGER_MS } from './tokens.js';

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

/**
 * Micro-interacción de botón (hover + presionado) -- pensada para toolbars/
 * botones de acción (ver MapaToolbar.jsx/PanelDetalle.jsx), donde antes
 * cada uno tenía su propia transición CSS suelta con timings/curvas
 * distintas. `type: 'tween'` explícito en ambos estados: sin esto,
 * Framer Motion usa spring por default en whileTap, que es el "rebote"
 * que se pidió evitar (esto es una herramienta de trabajo, no un juego).
 * Misma duración/curva para hover Y tap -- nunca un botón más lento que
 * el de al lado por la misma clase de interacción.
 */
export function interaccionBoton(reducido = false) {
  if (reducido) {
    return { whileHover: {}, whileTap: {}, transition: { duration: 0 } };
  }
  return {
    whileHover: { y: -1, boxShadow: '0 4px 10px rgba(0,0,0,.25)' },
    whileTap: { scale: 0.94, y: 0, boxShadow: '0 1px 2px rgba(0,0,0,.2)' },
    transition: { type: 'tween', duration: DURACION.micro, ease: EASING.entrada },
  };
}

/** Entrada fade + escala + slide-up para el elemento "protagonista" de una pantalla (ej. la card de login) -- versión más marcada de entradaConStagger, pensada para un solo elemento grande, no para listas. */
export function entradaProtagonista(reducido = false) {
  if (reducido) {
    return { initial: { opacity: 1, scale: 1, y: 0 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { duration: 0 } };
  }
  return {
    initial: { opacity: 0, scale: 0.96, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { duration: DURACION.navegacion, ease: EASING.entrada },
  };
}

/** Aparece flotando, se mantiene y se desvanece, en loop con pausa -- para badges/mensajes decorativos que "flotan" cerca de un elemento vivo (ej. las tarjetas del panel de marca del Login). `times` controla el ritmo del ciclo (entra rápido, se sostiene, sale) dentro de un solo `duration`. `demora` desfasa cada badge para que no aparezcan todos a la vez. */
export function apareceFlotante(reducido = false, demora = 0) {
  if (reducido) return { animate: { opacity: 0 }, transition: { duration: 0 } };
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] },
    transition: {
      duration: DURACION.trazadoRuta, times: [0, 0.15, 0.7, 1],
      repeat: Infinity, repeatDelay: DURACION.pausaOnda, ease: EASING.cambio, delay: demora,
    },
  };
}

/** Física de spring para interacciones que siguen al puntero (ver useTiltParallax.js) -- mismo MUELLE en cualquier componente que haga tilt/parallax, nunca rigidez/amortiguación sueltas por archivo. */
export function muelleSeguimiento(reducido = false) {
  if (reducido) return { type: 'tween', duration: 0 };
  return { type: 'spring', stiffness: MUELLE.rigidez, damping: MUELLE.amortiguacion };
}

/** Fade + slide horizontal corto (para usar con AnimatePresence) -- texto que aparece/desaparece junto a un ícono fijo, ej. el nombre del sistema al expandir el sidebar. */
export function revelarHorizontal(reducido = false) {
  if (reducido) {
    return { initial: { opacity: 1, x: 0 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 1, x: 0 }, transition: { duration: 0 } };
  }
  return {
    initial: { opacity: 0, x: -8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -8 },
    transition: { duration: DURACION.navegacion, ease: EASING.entrada },
  };
}
