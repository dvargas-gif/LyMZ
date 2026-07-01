import { useEffect, useRef, useState } from 'react';
import { auditService } from '../audit/audit.service.js';
import { puede } from '../auth/roles.js';

/**
 * Envuelve el mapa de slotting EXISTENTE (public/legacy/mapa_editable_slotting.html)
 * en un iframe, sin tocar su lógica interna más que el hook de postMessage
 * ya agregado dentro de logMov().
 *
 * Esto garantiza el requisito "no modificar ninguna funcionalidad existente":
 * el iframe es una caja negra, React nunca mete la mano en su DOM (solo LEE
 * el ancho ya renderizado de #grid para autoajustar el contenedor — nunca
 * escribe ni modifica nada adentro del iframe).
 */
export default function SlottingFrame({ sesion }) {
  const ref = useRef(null);
  const soloLectura = !puede(sesion.rol, 'mover');
  const [anchoContenedor, setAnchoContenedor] = useState(null);

  useEffect(() => {
    function onMessage(ev) {
      if (!ev.data || ev.data.type !== 'slotting:audit') return;
      const { articulo, desde, hacia, tipoMovimiento } = ev.data.payload;
      auditService.registrarMovimiento({
        usuarioId: sesion.usuarioId,
        usuarioNombre: sesion.nombre,
        ip: sesion.ip,
        desde, hacia, articulo, tipoMovimiento,
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sesion]);

  function onIframeLoad() {
    try {
      const grid = ref.current.contentDocument.getElementById('grid');
      if (!grid) return;
      const anchoGrid = grid.getBoundingClientRect().width;
      setAnchoContenedor(Math.round(anchoGrid) + 60); // + padding del body + margen de respiro
    } catch {
      // Si por algún motivo no se puede medir, se queda con el 95vw de respaldo del CSS.
    }
  }

  return (
    <div className="slotting-frame" style={anchoContenedor ? { width: `${anchoContenedor}px` } : undefined}>
      {soloLectura && (
        <div className="slotting-frame__aviso">
          <i className="ti ti-lock" /> Tu rol ({sesion.rol}) tiene acceso de solo lectura al mapa.
        </div>
      )}
      <iframe
        ref={ref}
        src="/legacy/mapa_editable_slotting.html"
        title="Mapa editable de slotting"
        className="slotting-frame__iframe"
        onLoad={onIframeLoad}
      />
    </div>
  );
}
