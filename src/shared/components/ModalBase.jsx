/**
 * Envoltorio compartido de los modales del panel de administración: overlay
 * (clic afuera cierra), card centrada, y el encabezado título+cerrar que los
 * 6 modales de admin/salas repetían casi byte a byte. Cada modal solo aporta
 * su `titulo`, `maxWidth` (varía a propósito según el contenido) y children.
 *
 * `maxHeight` es opcional (algunos modales entran sin scroll). Cuando se usa
 * junto con `scrollContenido`, el card queda en flex-column y es EL CHILDREN
 * quien debe envolver su propia parte scrolleable en un div con overflowY —
 * así el título/buscador quedan fijos y solo la tabla larga se desplaza
 * (patrón de ReportePanel/PanelCargaMasiva/PanelCargaPicks). Sin
 * `scrollContenido`, `maxHeight` aplica `overflowY:auto` directo al card
 * completo (para un modal corto y sin partes propias que deban quedar fijas).
 *
 * Escape cierra el modal — si algún contenido adentro también usa Escape
 * para algo propio (ej. cancelar una edición inline), tiene que frenar la
 * propagación en su propio onKeyDown para que no le gane a este cierre.
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { entradaProtagonista } from '../../ui/motion/variants.js';
import { DURACION } from '../../ui/motion/tokens.js';
import { useReducedMotion } from '../../ui/motion/prefersReducedMotion.js';

const overlayStyle = { position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 };
const headerRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 };
const tituloStyle = { fontSize: 18, fontWeight: 600 };

/**
 * Entrada animada (pedido explícito 2026-08-20: "mejorar la fluidez... los
 * detalles post-acción" -- de los ~9 modales que usan este wrapper, ninguno
 * tenía transición al aparecer, aparecían de golpe). Se anima la ENTRADA acá
 * adentro (initial+animate funciona en el montaje sin depender de
 * AnimatePresence) -- la SALIDA no, porque cada uno de los 9 llamadores
 * monta/desmonta este componente con su propio `{mostrar && <ModalBase>}`,
 * y animar esa salida bien necesitaría envolver cada uno de esos 9 en
 * AnimatePresence -- fuera de alcance de este pase puntual de fluidez.
 */
export default function ModalBase({ titulo, onCerrar, maxWidth = 460, maxHeight, scrollContenido = false, children }) {
  const reducido = useReducedMotion();

  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onCerrar(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  const cardStyle = {
    background: 'var(--card)', color: 'var(--ink)', borderRadius: 14, padding: 24, width: '100%', maxWidth,
    boxShadow: '0 20px 60px rgba(0,0,0,.35)',
    ...(maxHeight ? { maxHeight, ...(scrollContenido ? { display: 'flex', flexDirection: 'column' } : { overflowY: 'auto' }) } : {}),
  };

  return (
    <motion.div
      className="modal-overlay" style={overlayStyle} onClick={e => e.target === e.currentTarget && onCerrar()}
      initial={reducido ? { opacity: 1 } : { opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: reducido ? 0 : DURACION.estado }}
    >
      <motion.div className="modal-card" style={cardStyle} role="dialog" aria-modal="true" aria-label={titulo} {...entradaProtagonista(reducido)}>
        <div style={headerRowStyle}>
          <h2 style={tituloStyle}>{titulo}</h2>
          <button onClick={onCerrar} className="btn-icon" aria-label="Cerrar"><i className="ti ti-x" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
