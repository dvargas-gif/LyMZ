import { useEffect, useRef, useState } from 'react';
import { auditService } from '../audit/audit.service.js';
import { posicionesService } from '../services/posiciones.service.js';
import { puede } from '../auth/roles.js';

/**
 * Envuelve el mapa de slotting EXISTENTE (public/legacy/mapa_editable_slotting.html)
 * en un iframe, sin tocar su lógica interna más que los hooks de postMessage
 * ya agregados dentro de logMov()/confirmar()/soltarCuerpoEn()/deshacer().
 *
 * Esto garantiza el requisito "no modificar ninguna funcionalidad existente":
 * el iframe es una caja negra, React nunca mete la mano en su DOM (solo LEE
 * el ancho ya renderizado de #grid para autoajustar el contenedor — nunca
 * escribe ni modifica nada adentro del iframe).
 *
 * Persistencia: cada movimiento avisa su nueva posición ('slotting:posicion')
 * y se guarda en la tabla `posiciones_actuales` de Supabase. Al cargar, el
 * mapa pide ese estado ('slotting:solicitarEstado') y se lo devolvemos
 * ('slotting:estadoInicial') para que reconstruya dónde quedó cada artículo.
 */
export default function SlottingFrame({ sesion }) {
  const ref = useRef(null);
  const soloLectura = !puede(sesion.rol, 'mover');
  const [anchoContenedor, setAnchoContenedor] = useState(null);

  useEffect(() => {
    function onMessage(ev) {
      if (!ev.data || !ev.data.type) return;

      if (ev.data.type === 'slotting:audit') {
        const { articulo, desde, hacia, tipoMovimiento } = ev.data.payload;
        auditService.registrarMovimiento({
          usuarioId: sesion.usuarioId,
          usuarioNombre: sesion.nombre,
          ip: sesion.ip,
          desde, hacia, articulo, tipoMovimiento,
        });
        return;
      }

      if (ev.data.type === 'slotting:posicion') {
        const { articulo, pasillo, columna, nivel } = ev.data.payload;
        posicionesService.guardar({ articulo, pasillo, columna, nivel, usuarioId: sesion.usuarioId });
        return;
      }

      if (ev.data.type === 'slotting:deshecho') {
        const { articulo, desde, hacia } = ev.data.payload;
        auditService.registrarDeshecho({
          usuarioId: sesion.usuarioId,
          usuarioNombre: sesion.nombre,
          ip: sesion.ip,
          desde, hacia, articulo,
        });
        return;
      }

      if (ev.data.type === 'slotting:solicitarEstado') {
        posicionesService.listar()
          .then(posiciones => ev.source.postMessage({ type: 'slotting:estadoInicial', payload: posiciones }, '*'))
          .catch(() => ev.source.postMessage({ type: 'slotting:estadoInicial', payload: [] }, '*'));
      }
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
