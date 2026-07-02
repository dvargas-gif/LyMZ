import { useEffect, useRef, useState } from 'react';
import { auditService } from '../audit/audit.service.js';
import { posicionesService } from '../services/posiciones.service.js';
import { bloqueosService } from '../services/bloqueos.service.js';
import { articulosService } from '../services/articulos.service.js';
import { escenarioPosicionesService } from '../services/escenarioPosiciones.service.js';
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
 * y cada bloqueo/desbloqueo ('slotting:bloqueo'), y se guardan en Supabase
 * (`posiciones_actuales` / `bloqueos`). Al cargar, el mapa pide ese estado
 * ('slotting:solicitarEstado') y se lo devolvemos ('slotting:estadoInicial')
 * para que reconstruya dónde quedó cada artículo y qué posiciones siguen
 * bloqueadas.
 *
 * Modo sala: si se pasa `escenario={id,nombre}`, el MISMO mapa se abre con
 * ?escenario=<id> en la URL — el propio HTML legacy se encarga de avisar
 * ese id en cada mensaje (sin tocar su lógica de mover/deshacer). Acá solo
 * enrutamos: en modo sala las posiciones van a `escenario_posiciones` (nunca
 * a `posiciones_actuales`) y se ignoran auditoría/bloqueos reales — una sala
 * nunca puede escribir en el mapa real.
 */
export default function SlottingFrame({ sesion, escenario }) {
  const ref = useRef(null);
  const soloLectura = !puede(sesion.rol, escenario ? 'usar_salas' : 'mover');
  const [anchoContenedor, setAnchoContenedor] = useState(null);

  const src = escenario
    ? `/legacy/mapa_editable_slotting.html?escenario=${escenario.id}&nombre=${encodeURIComponent(escenario.nombre)}`
    : '/legacy/mapa_editable_slotting.html';

  useEffect(() => {
    function onMessage(ev) {
      if (!ev.data || !ev.data.type) return;
      const enSala = !!ev.data.payload?.escenarioId;

      if (ev.data.type === 'slotting:audit') {
        if (enSala) return; // una sala no deja rastro en la auditoría real
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
        const { articulo, pasillo, columna, nivel, clase, grupo, tipo, escenarioId } = ev.data.payload;
        if (escenarioId) {
          escenarioPosicionesService.guardar({ escenarioId, articulo, pasillo, columna, nivel, clase, grupo, tipo, usuarioId: sesion.usuarioId });
        } else {
          posicionesService.guardar({ articulo, pasillo, columna, nivel, clase, grupo, tipo, usuarioId: sesion.usuarioId });
        }
        return;
      }

      if (ev.data.type === 'slotting:deshecho') {
        if (enSala) return; // ídem: deshacer en una sala no toca la auditoría real
        const { articulo, desde, hacia } = ev.data.payload;
        auditService.registrarDeshecho({
          usuarioId: sesion.usuarioId,
          usuarioNombre: sesion.nombre,
          ip: sesion.ip,
          desde, hacia, articulo,
        });
        return;
      }

      if (ev.data.type === 'slotting:bloqueo') {
        if (enSala) return; // las salas no manejan bloqueos físicos reales
        const { key, pasillo, columna, bloqueada } = ev.data.payload;
        if (bloqueada) bloqueosService.bloquear({ key, pasillo, columna, usuarioId: sesion.usuarioId });
        else bloqueosService.desbloquear(key);
        return;
      }

      if (ev.data.type === 'slotting:solicitarEstado') {
        const escenarioId = ev.data.payload?.escenarioId;
        const posicionesProm = escenarioId ? escenarioPosicionesService.listar(escenarioId) : posicionesService.listar();
        const bloqueosProm = escenarioId ? Promise.resolve([]) : bloqueosService.listar();
        Promise.all([posicionesProm, bloqueosProm, articulosService.listarDescripciones()])
          .then(([posiciones, bloqueos, descripciones]) => ev.source.postMessage({ type: 'slotting:estadoInicial', payload: { posiciones, bloqueos, descripciones } }, '*'))
          .catch(() => ev.source.postMessage({ type: 'slotting:estadoInicial', payload: { posiciones: [], bloqueos: [], descripciones: [] } }, '*'));
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
          <i className="ti ti-lock" /> Tu rol ({sesion.rol}) tiene acceso de solo lectura {escenario ? 'a esta sala' : 'al mapa'}.
        </div>
      )}
      <iframe
        ref={ref}
        src={src}
        title="Mapa editable de slotting"
        className="slotting-frame__iframe"
        onLoad={onIframeLoad}
      />
    </div>
  );
}
