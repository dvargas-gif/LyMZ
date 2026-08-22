import { motion } from 'framer-motion';
import { DURACION, EASING } from '../../ui/motion/tokens.js';
import { useReducedMotion } from '../../ui/motion/prefersReducedMotion.js';

const NIVELES = 5; // el mismo número real de niveles de un rack en toda la app -- no una barra genérica

/**
 * Avance de una orden como un rack esquemático que se llena de abajo hacia
 * arriba (pedido explícito 2026-08-21: "una forma representativa, tipo si
 * se vaciara o se llenara un rack" -- versión simple en CSS, no la escena
 * 3D del Login: esa reusa poco más que la cámara/luces, el modelo de
 * mercadería es 100% decorativo y habría que reescribirlo entero).
 *
 * `proporcion` es agnóstico de qué representa exactamente (tareas
 * confirmadas / total, hoy) -- 0 = vacío, 1 = completo. Cada uno de los 5
 * niveles se anima por separado (no un solo relleno continuo) para que se
 * lea como "niveles llenándose", no como una barra de progreso genérica.
 */
export default function AvanceOrdenVisual({ proporcion, etiqueta }) {
  const reducido = useReducedMotion();
  const nivelesLlenos = Math.max(0, Math.min(1, proporcion)) * NIVELES;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 46, height: 92, border: '2px solid var(--borde-claro)', borderRadius: 6, padding: 4, background: 'var(--card)', flexShrink: 0 }}>
        {[4, 3, 2, 1, 0].map(nivel => {
          const fraccion = Math.max(0, Math.min(1, nivelesLlenos - nivel));
          return (
            <div key={nivel} style={{ flex: 1, borderRadius: 3, background: 'rgba(0,0,0,.06)', overflow: 'hidden', position: 'relative' }}>
              <motion.div
                initial={false}
                animate={{ height: `${fraccion * 100}%` }}
                transition={{ duration: reducido ? 0 : DURACION.estado, ease: EASING.cambio }}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--green)', borderRadius: 3 }}
              />
            </div>
          );
        })}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{Math.round(proporcion * 100)}%</div>
        {etiqueta && <div style={{ fontSize: 11.5, color: 'var(--texto-tenue)' }}>{etiqueta}</div>}
      </div>
    </div>
  );
}
