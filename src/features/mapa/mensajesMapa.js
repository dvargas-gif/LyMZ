import { auditService } from '../auditoria/audit.service.js';
import { posicionesService } from '../../shared/services/posiciones.service.js';
import { bloqueosService } from '../../shared/services/bloqueos.service.js';
import { articulosService } from '../../shared/services/articulos.service.js';
import { escenarioPosicionesService } from '../salas/escenarioPosiciones.service.js';
import { escenarioEliminadosService } from '../salas/escenarioEliminados.service.js';
import { escenarioBloqueosService } from '../salas/escenarioBloqueos.service.js';
import { configMapaService } from '../../shared/services/configMapa.service.js';
import { pasillosConfigService } from '../../shared/services/pasillosConfig.service.js';

/**
 * Un handler por cada tipo de mensaje que manda el mapa legacy por
 * postMessage. SlottingFrame.jsx solo arma este mapa con `crearManejadoresMensajes`
 * y despacha `manejadores[ev.data.type](payload, ev, enSala)` — no conoce el
 * detalle de qué hace cada uno. Cada función es EXACTAMENTE la misma rama
 * que tenía el if/else de SlottingFrame antes de este refactor (nada de
 * lógica nueva) — agregar un tipo de mensaje futuro es agregar una entrada
 * acá, no otro `if` a una cadena cada vez más larga.
 */
export function crearManejadoresMensajes({ sesion, onCambio, onSeleccionCambia, onSolicitarAddRack }) {
  return {
    'slotting:audit'(payload, ev, enSala) {
      if (enSala) return; // una sala no deja rastro en la auditoría real
      const { articulo, desde, hacia, tipoMovimiento } = payload;
      auditService.registrarMovimiento({
        usuarioId: sesion.usuarioId,
        usuarioNombre: sesion.nombre,
        ip: sesion.ip,
        desde, hacia, articulo, tipoMovimiento,
      });
    },

    'slotting:posicion'(payload, ev) {
      const { articulo, pasillo, columna, nivel, clase, grupo, tipo, escenarioId } = payload;
      const guardado = escenarioId
        ? escenarioPosicionesService.guardar({ escenarioId, articulo, pasillo, columna, nivel, clase, grupo, tipo, usuarioId: sesion.usuarioId })
        : posicionesService.guardar({ articulo, pasillo, columna, nivel, clase, grupo, tipo, usuarioId: sesion.usuarioId });
      guardado
        .then(() => { if (escenarioId) onCambio?.(); })
        .catch(err => {
          console.error('No se pudo guardar la posición', err);
          // El mapa ya movió el artículo visualmente (optimista, igual que
          // siempre) — esto solo avisa que NO quedó persistido, para que
          // el usuario sepa que tiene que reintentar (no hace rollback
          // automático del dibujo, sería un cambio mucho más grande).
          ev.source?.postMessage({ type: 'slotting:errorGuardado', payload: { articulo } }, '*');
        });
    },

    'slotting:deshecho'(payload, ev, enSala) {
      if (enSala) return; // ídem: deshacer en una sala no toca la auditoría real
      const { articulo, desde, hacia } = payload;
      auditService.registrarDeshecho({
        usuarioId: sesion.usuarioId,
        usuarioNombre: sesion.nombre,
        ip: sesion.ip,
        desde, hacia, articulo,
      });
    },

    'slotting:limpiarArticulo'(payload) {
      const { articulo, escenarioId } = payload;
      if (escenarioId) {
        escenarioEliminadosService.marcarEliminado({ escenarioId, articulo, usuarioId: sesion.usuarioId });
        onCambio?.();
      }
    },

    'slotting:bloqueo'(payload) {
      const { key, pasillo, columna, bloqueada, escenarioId } = payload;
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
    },

    'slotting:seleccionArea'(payload) {
      onSeleccionCambia?.(payload?.cantidad ?? 0);
    },

    'slotting:solicitarAddRack'() {
      onSolicitarAddRack?.();
    },

    'slotting:solicitarEstado'(payload, ev) {
      const escenarioId = payload?.escenarioId;
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
      const pasillosProm = seguro(pasillosConfigService.listar(), [], 'la extensión de pasillos');

      Promise.all([posicionesProm, bloqueosProm, descripcionesProm, configProm, eliminadosProm, pasillosProm])
        .then(([posiciones, bloqueos, descripciones, configuracion, eliminados, pasillosConfig]) => {
          const maxColumnas = Object.fromEntries(pasillosConfig.map(p => [p.pasillo, p.max_columna]));
          ev.source.postMessage({ type: 'slotting:estadoInicial', payload: { posiciones, bloqueos, descripciones, configuracion, eliminados, maxColumnas } }, '*');
        });
    },
  };
}
