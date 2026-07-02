import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { auditService } from '../audit/audit.service.js';
import { posicionesService } from '../services/posiciones.service.js';
import { bloqueosService } from '../services/bloqueos.service.js';
import { articulosService } from '../services/articulos.service.js';
import { escenarioPosicionesService } from '../services/escenarioPosiciones.service.js';
import { escenarioEliminadosService } from '../services/escenarioEliminados.service.js';
import { escenarioBloqueosService } from '../services/escenarioBloqueos.service.js';
import { configMapaService } from '../services/configMapa.service.js';
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
 * enrutamos: en modo sala las posiciones Y los bloqueos van a las tablas
 * `escenario_*` (nunca a las reales) y se ignora la auditoría real — una
 * sala nunca puede escribir en el mapa real.
 *
 * Comandos remotos (forwardRef): la barra de acciones de una sala vive en
 * React (SalasView), fuera del iframe, así que expone `activarModoBloqueo`,
 * `activarModoSeleccion` y `limpiarSeleccion` — cada uno solo reenvía un
 * postMessage que el propio mapa legacy ya sabe escuchar y resolver con una
 * función que ya existía ahí (no se duplica nada de esa lógica acá).
 * `onCambio` avisa a React cada vez que algo se modificó de verdad en la
 * sala (para el contador de "cambios sin guardar" de la barra de acciones).
 */
const SlottingFrame = forwardRef(function SlottingFrame({ sesion, escenario, onCambio, onSeleccionCambia }, refExterno) {
  const ref = useRef(null);
  const soloLectura = !puede(sesion.rol, escenario ? 'usar_salas' : 'mover');
  const [anchoContenedor, setAnchoContenedor] = useState(null);

  useImperativeHandle(refExterno, () => ({
    activarModoBloqueo() {
      ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'activarModoBloqueo' } }, '*');
    },
    activarModoSeleccion() {
      ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'activarModoSeleccion' } }, '*');
    },
    limpiarSeleccion() {
      ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'limpiarSeleccion' } }, '*');
    },
    recargar() {
      try { ref.current?.contentWindow?.location.reload(); } catch { /* noop */ }
    },
  }), []);

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
          onCambio?.();
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

      if (ev.data.type === 'slotting:limpiarArticulo') {
        const { articulo, escenarioId } = ev.data.payload;
        if (escenarioId) {
          escenarioEliminadosService.marcarEliminado({ escenarioId, articulo, usuarioId: sesion.usuarioId });
          onCambio?.();
        }
        return;
      }

      if (ev.data.type === 'slotting:bloqueo') {
        const { key, pasillo, columna, bloqueada, escenarioId } = ev.data.payload;
        if (escenarioId) {
          // Si supabase/sql/2026-07-02_salas_simulacion_avanzado.sql todavía no
          // corrió, `escenario_bloqueos` no existe — esto NO debe tumbar el
          // resto de la sala (mover artículos, limpiar, etc.), solo el bloqueo
          // en sí queda sin persistir hasta que se corra ese script.
          const accion = bloqueada
            ? escenarioBloqueosService.bloquear({ escenarioId, key, pasillo, columna, usuarioId: sesion.usuarioId })
            : escenarioBloqueosService.desbloquear(escenarioId, key);
          accion.then(() => onCambio?.()).catch(err => console.error('No se pudo guardar el bloqueo de la sala (¿corriste el SQL de salas avanzado?)', err));
        } else {
          if (bloqueada) bloqueosService.bloquear({ key, pasillo, columna, usuarioId: sesion.usuarioId });
          else bloqueosService.desbloquear(key);
        }
        return;
      }

      if (ev.data.type === 'slotting:seleccionArea') {
        onSeleccionCambia?.(ev.data.payload?.cantidad ?? 0);
        return;
      }

      if (ev.data.type === 'slotting:solicitarEstado') {
        const escenarioId = ev.data.payload?.escenarioId;
        // Cada pieza del estado se resuelve SOLA: si una tabla todavía no
        // existe (por ejemplo escenario_bloqueos antes de correr el SQL
        // nuevo), esa pieza queda vacía pero las demás (posiciones,
        // eliminados, descripciones) igual llegan — antes un solo fallo acá
        // tiraba todo el estado a cero y la sala parecía "no funcionar".
        const seguro = (promesa, porDefecto, etiqueta) => promesa.catch(err => { console.error(`No se pudo cargar ${etiqueta} (¿corriste el SQL de salas avanzado?)`, err); return porDefecto; });

        const posicionesProm = seguro(escenarioId ? escenarioPosicionesService.listar(escenarioId) : posicionesService.listar(), [], 'posiciones');
        const bloqueosProm = seguro(escenarioId ? escenarioBloqueosService.listar(escenarioId) : bloqueosService.listar(), [], 'bloqueos');
        const eliminadosProm = escenarioId ? seguro(escenarioEliminadosService.listar(escenarioId), [], 'artículos limpiados') : Promise.resolve([]);
        const descripcionesProm = seguro(articulosService.listarDescripciones(), [], 'descripciones');
        const configProm = configMapaService.obtener().catch(() => ({ tema: 'claro', orientacion: 'horizontal' }));

        Promise.all([posicionesProm, bloqueosProm, descripcionesProm, configProm, eliminadosProm])
          .then(([posiciones, bloqueos, descripciones, configuracion, eliminados]) => ev.source.postMessage({ type: 'slotting:estadoInicial', payload: { posiciones, bloqueos, descripciones, configuracion, eliminados } }, '*'));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sesion, onCambio, onSeleccionCambia]);

  // Cuando se cambia el tema/orientación desde el menú de administración,
  // simplemente recargamos el iframe — el propio mapa vuelve a pedir su
  // estado (incluida la config nueva) al arrancar, sin lógica extra acá.
  useEffect(() => {
    function onConfigCambiada() {
      try { ref.current?.contentWindow?.location.reload(); } catch { /* noop */ }
    }
    window.addEventListener('mapa:config-cambiada', onConfigCambiada);
    return () => window.removeEventListener('mapa:config-cambiada', onConfigCambiada);
  }, []);

  function onIframeLoad() {
    try {
      const grid = ref.current.contentDocument.getElementById('grid');
      if (!grid) return;
      // scrollWidth (no getBoundingClientRect) porque el propio mapa puede
      // aplicarle un transform:scale para evitar su scroll horizontal interno
      // — getBoundingClientRect reflejaría el tamaño YA achicado y este
      // cálculo terminaría pidiendo un contenedor cada vez más chico.
      const anchoGrid = grid.scrollWidth;
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
});

export default SlottingFrame;
