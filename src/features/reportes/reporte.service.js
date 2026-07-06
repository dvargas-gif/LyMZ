import { inventarioService } from '../../shared/services/inventario.service.js';
import { posicionesService } from '../../shared/services/posiciones.service.js';
import { articulosService } from '../../shared/services/articulos.service.js';
import { escenarioPosicionesService } from '../salas/escenarioPosiciones.service.js';
import { escenarioEliminadosService } from '../salas/escenarioEliminados.service.js';
import { resolverPosicionesActuales } from '../../domain/resolverPosicionesActuales.js';
import { obtenerWarehouseModel } from '../../domain/crearWarehouseModel.js';

/**
 * Reporte de posiciones = plan base (inventario_slotting) con los
 * movimientos superpuestos encima, más la descripción de cada artículo.
 * El merge base+overrides ya no se calcula acá -- lo resuelve
 * `resolverPosicionesActuales()` (src/domain/), la misma función que
 * reemplaza el cálculo que antes estaba duplicado con el mapa legacy
 * (ver DECISIONES.md ADR-001/ADR-003). Este archivo solo aplana el
 * resultado del dominio a la forma plana que ya consumía ReportePanel.jsx
 * (verificado byte a byte contra el algoritmo anterior antes de este
 * cambio, ver PROGRESO.md sesión G1b).
 *
 * Con `escenarioId`: los "movimientos" salen de `escenario_posiciones` (no
 * de `posiciones_actuales`) y los artículos de `escenario_eliminados` se
 * sacan del todo — nunca se mezcla con datos reales, es la MISMA función
 * pero apuntando a las tablas de la sala.
 */
export const reporteService = {
  async obtener(escenarioId = null) {
    const [base, movidas, descripciones, eliminados] = await Promise.all([
      inventarioService.listar(),
      escenarioId ? escenarioPosicionesService.listar(escenarioId) : posicionesService.listar(),
      articulosService.listarDescripciones(),
      escenarioId ? escenarioEliminadosService.listar(escenarioId) : Promise.resolve([]),
    ]);

    const descPorArticulo = new Map(descripciones.map(d => [d.articulo, d.descripcion]));
    const resueltas = resolverPosicionesActuales(base, movidas, eliminados);

    return resueltas
      .filter(r => r.posicionActual !== null) // eliminado (solo pasa dentro de una sala) -- mismo efecto que el filas.delete() de antes
      .map(r => {
        // Misma forma plana que devolvía el algoritmo anterior: si el
        // artículo no tiene posición base (sinBase), nunca tuvo
        // picks/consumo/rack_actual/niveles_a_armar -- no se inventan acá.
        const fila = r.sinBase
          ? {
              articulo: r.articulo,
              pasillo: r.posicionActual.pasillo, columna: r.posicionActual.columna, nivel: r.posicionActual.nivel,
              clase: r.posicionActual.clase, tipo: r.posicionActual.tipo,
              movido: r.movido,
            }
          : {
              articulo: r.articulo,
              pasillo: r.posicionActual.pasillo, columna: r.posicionActual.columna, nivel: r.posicionActual.nivel,
              clase: r.posicionActual.clase, tipo: r.posicionActual.tipo,
              picks: r.posicionBase.picks, consumo: r.posicionBase.consumo,
              rack_actual: r.posicionBase.rack_actual, niveles_a_armar: r.posicionBase.niveles_a_armar,
              movido: r.movido,
            };
        return { ...fila, descripcion: descPorArticulo.get(r.articulo) || 'Sin descripción disponible' };
      })
      .sort((a, b) => (a.pasillo + a.columna).localeCompare(b.pasillo + b.columna));
  },

  /**
   * Se dispara con cualquier cambio real de posiciones (o de la sala, si se
   * pasa escenarioId). Ya NO abre su propio canal de Realtime -- delega en
   * la instancia compartida de WarehouseModel (Ley 4: un solo suscriptor,
   * ver DECISIONES.md ADR-008). El canal en sí es el mismo de siempre
   * (mismas tablas, mismos filtros), solo que ahora vive en un solo lugar
   * del que cualquier otro consumidor futuro (Dashboard, mapa bridge) puede
   * depender sin duplicar la suscripción.
   */
  suscribirCambios(callback, escenarioId = null) {
    const modelo = obtenerWarehouseModel(escenarioId);
    modelo.asegurarSuscripcion();
    return modelo.suscribir(callback);
  },
};
