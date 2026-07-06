import { motion } from 'framer-motion';
import { entradaConStagger } from './variants.js';
import { useReducedMotion } from './prefersReducedMotion.js';

/**
 * Placeholder de carga con shimmer (ver .skeleton-shimmer en styles/index.css
 * -- la animación del brillo usa `transform: translateX`, nunca
 * background-position, para cumplir "solo transform/opacity"). La entrada
 * (fade + slide-up 8px) usa Framer Motion y respeta prefers-reduced-motion.
 */
export default function Skeleton({ indice = 0, alto = 16, ancho = '100%', className = '' }) {
  const reducido = useReducedMotion();
  return (
    <motion.div
      {...entradaConStagger(indice, reducido)}
      className={`skeleton-shimmer ${className}`.trim()}
      style={{ height: alto, width: ancho }}
      aria-hidden="true"
    />
  );
}
