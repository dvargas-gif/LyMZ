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
 * completo (patrón de UsuariosPanel, donde todo el modal se desplaza junto).
 *
 * Escape cierra el modal — si algún contenido adentro también usa Escape
 * para algo propio (ej. cancelar una edición inline), tiene que frenar la
 * propagación en su propio onKeyDown para que no le gane a este cierre.
 */
import { useEffect } from 'react';

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(28,58,62,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 };
const headerRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 };
const tituloStyle = { fontSize: 18, fontWeight: 600 };

export default function ModalBase({ titulo, onCerrar, maxWidth = 460, maxHeight, scrollContenido = false, children }) {
  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onCerrar(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  const cardStyle = {
    background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth,
    boxShadow: '0 20px 60px rgba(0,0,0,.35)',
    ...(maxHeight ? { maxHeight, ...(scrollContenido ? { display: 'flex', flexDirection: 'column' } : { overflowY: 'auto' }) } : {}),
  };

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div style={cardStyle} role="dialog" aria-modal="true" aria-label={titulo}>
        <div style={headerRowStyle}>
          <h2 style={tituloStyle}>{titulo}</h2>
          <button onClick={onCerrar} className="btn-icon" aria-label="Cerrar"><i className="ti ti-x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
