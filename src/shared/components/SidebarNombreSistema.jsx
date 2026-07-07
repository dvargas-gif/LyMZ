import { AnimatePresence, motion } from 'framer-motion';
import { revelarHorizontal } from '../../ui/motion/variants.js';
import { useReducedMotion } from '../../ui/motion/prefersReducedMotion.js';

/**
 * Aparte en su propio chunk (ver Sidebar.jsx) para que Framer Motion no se
 * cuele en el bundle principal -- el sidebar es parte del shell, siempre
 * cargado, a diferencia del Dashboard (única otra feature que ya usaba
 * Framer Motion, y solo carga bajo demanda).
 */
export default function SidebarNombreSistema({ visible }) {
  const reducido = useReducedMotion();
  return (
    <AnimatePresence>
      {visible && <motion.span {...revelarHorizontal(reducido)}>Slotting Mezanine</motion.span>}
    </AnimatePresence>
  );
}
