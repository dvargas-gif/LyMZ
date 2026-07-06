import { motion } from 'framer-motion';
import { useCountUp } from './useCountUp.js';
import { useDestacarAlCambiar } from './useDestacarAlCambiar.js';
import { pulsoCambio } from './variants.js';
import { useReducedMotion } from './prefersReducedMotion.js';

/**
 * Número de KPI con count-up (~600ms) al cambiar, y pulso de escala +
 * transición de color cuando el cambio viene de un dato en vivo (Realtime).
 * La transición de color usa CSS (background-color/color no son propiedades
 * de layout -- el estándar de animaciones las permite explícitamente junto
 * al pulso de escala, ver MASTER-PROMPT.md sección 7).
 */
export default function KpiValor({ valor, className = '', formatear = v => Math.round(v) }) {
  const reducido = useReducedMotion();
  const animado = useCountUp(valor);
  const destacado = useDestacarAlCambiar(valor);

  return (
    <motion.span
      className={`kpi-valor ${destacado ? 'kpi-valor--destacado' : ''} ${className}`.trim()}
      {...(destacado ? pulsoCambio(reducido) : {})}
    >
      {formatear(animado)}
    </motion.span>
  );
}
