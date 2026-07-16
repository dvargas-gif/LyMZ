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

/** Entrada fade + escala (0.85 -> 1), con stagger opcional por índice -- para mosaicos/grillas de celdas (a diferencia de entradaConStagger, que desliza en Y y es para listas verticales). */
export function entradaEscala(indice = 0, reducido = false) {
  if (reducido) {
    return { initial: { opacity: 1, scale: 1 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0 } };
  }
  return {
    initial: { opacity: 0, scale: 0.85 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: DURACION.estado, ease: EASING.entrada, delay: indice * (STAGGER_MS / 1000) },
  };
}

/** Entrada fade + escala + slide-up para el elemento "protagonista" de una pantalla (ej. la card de login) -- versión más marcada de entradaEscala, pensada para un solo elemento grande, no para listas. */
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

/** Brillo pulsante en loop (para "destacar sutilmente" un elemento vivo, ej. las celdas activas del mosaico de Login) -- a diferencia de pulsoCambio (un pulso único disparado por un evento), este repite indefinidamente mientras el elemento está montado. `demora` retrasa el inicio del loop hasta que termine la animación de entrada del propio elemento. */
export function brilloPulsante(reducido = false, demora = 0) {
  if (reducido) return { animate: { boxShadow: '0 0 0 1px rgba(232,176,74,.45)' }, transition: { duration: 0 } };
  return {
    animate: { boxShadow: ['0 0 0 1px rgba(232,176,74,.45)', '0 0 16px 3px rgba(232,176,74,.55)', '0 0 0 1px rgba(232,176,74,.45)'] },
    transition: { duration: DURACION.navegacion, ease: EASING.cambio, repeat: Infinity, repeatType: 'loop', delay: demora },
  };
}

/** Flotación sutil en loop (a diferencia de brilloPulsante, anima posición Y en vez de brillo) -- pensada para que TODAS las celdas de un mosaico se sientan vivas, no solo las "activas". `demora` desfasa cada celda para que la grilla completa lea como una ola continua, no todas botando en sincronía. */
export function ondaContinua(reducido = false, demora = 0) {
  if (reducido) return { animate: { y: 0 }, transition: { duration: 0 } };
  return {
    animate: { y: [0, -3, 0] },
    transition: { duration: DURACION.navegacion, ease: EASING.cambio, repeat: Infinity, repeatType: 'loop', delay: demora },
  };
}

/** Barrido de color en loop -- una celda pasa de `colorBase` a ámbar y vuelve, en pausa (`DURACION.pausaOnda`) entre cada pasada. Combinada con distintas `demora` por celda (ver Login.jsx), el efecto es una ola de color recorriendo la grilla, no todas las celdas prendiéndose a la vez. */
export function barridoColor(colorBase, reducido = false, demora = 0) {
  if (reducido) return { animate: { backgroundColor: colorBase }, transition: { duration: 0 } };
  return {
    animate: { backgroundColor: [colorBase, '#E8B04B', colorBase] },
    transition: { duration: DURACION.estado, ease: EASING.cambio, repeat: Infinity, repeatDelay: DURACION.pausaOnda, delay: demora },
  };
}

/** Entrada "de impacto" -- fade + desenfoque que se aclara + un ligero sobre-escalado antes de asentarse (a diferencia de entradaProtagonista, que no tiene overshoot ni blur). Pensada para UN elemento que debe sentirse como una revelación, no una aparición más de la cascada -- ej. la frase de marca del panel de Login. */
export function entradaImpacto(reducido = false, demora = 0) {
  if (reducido) {
    return { initial: { opacity: 1, scale: 1, filter: 'blur(0px)' }, animate: { opacity: 1, scale: 1, filter: 'blur(0px)' }, transition: { duration: 0 } };
  }
  return {
    initial: { opacity: 0, scale: 0.85, filter: 'blur(6px)' },
    animate: { opacity: 1, scale: [0.85, 1.04, 1], filter: 'blur(0px)' },
    transition: { duration: DURACION.navegacion, ease: EASING.entrada, delay: demora },
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
