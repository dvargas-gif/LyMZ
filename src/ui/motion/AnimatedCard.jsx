import { motion } from 'framer-motion';
import { transicionLayout } from './variants.js';
import { useReducedMotion } from './prefersReducedMotion.js';

/**
 * Wrapper con animación `layout` de Framer Motion -- FLIP automático:
 * si la card cambia de posición/tamaño por un reorden de la lista que la
 * contiene, anima la transición en vez de saltar. Internamente Framer Motion
 * implementa esto con `transform`, nunca con top/left/width/height directos
 * -- cumple "solo transform/opacity" sin que este archivo tenga que
 * calcular nada a mano.
 */
export default function AnimatedCard({ children, className, ...props }) {
  const reducido = useReducedMotion();
  return (
    <motion.div layout={!reducido} transition={transicionLayout(reducido)} className={className} {...props}>
      {children}
    </motion.div>
  );
}
