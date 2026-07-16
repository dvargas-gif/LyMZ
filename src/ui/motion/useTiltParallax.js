import { useMotionValue, useSpring, useTransform } from 'framer-motion';
import { muelleSeguimiento } from './variants.js';
import { useReducedMotion } from './prefersReducedMotion.js';

const GRADOS_MAXIMOS = 6; // sutil -- "profundidad", no un juego 3D

/**
 * Tilt 3D que sigue al puntero dentro de un contenedor (estilo páginas de
 * producto de Apple) -- devuelve `{ style, onMouseMove, onMouseLeave }` para
 * spread directo en un `motion.div`. La suavizada la hace un spring
 * (ver MUELLE en tokens.js), no un valor crudo, así el tilt no "salta" con
 * cada pixel de movimiento del mouse. Sin Framer Motion en el Sidebar (ver
 * la nota de bundle en Sidebar.jsx) -- esto es para Login, que es su propio
 * chunk lazy, no el shell siempre montado.
 */
export function useTiltParallax() {
  const reducido = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const transicion = muelleSeguimiento(reducido);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [GRADOS_MAXIMOS, -GRADOS_MAXIMOS]), transicion);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-GRADOS_MAXIMOS, GRADOS_MAXIMOS]), transicion);

  if (reducido) {
    return { style: {}, onMouseMove: () => {}, onMouseLeave: () => {} };
  }

  function onMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return { style: { rotateX, rotateY, transformPerspective: 1000 }, onMouseMove, onMouseLeave };
}
