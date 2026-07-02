import { supabase } from './supabaseClient.js';
import { inventarioService } from './inventario.service.js';
import { posicionesService } from './posiciones.service.js';
import { articulosService } from './articulos.service.js';
import { escenarioPosicionesService } from './escenarioPosiciones.service.js';
import { escenarioEliminadosService } from './escenarioEliminados.service.js';

/**
 * Reporte de posiciones = plan base (inventario_slotting) con los
 * movimientos superpuestos encima, más la descripción de cada artículo. Es
 * la misma lógica que ya usa el mapa legacy (base + overrides), pero
 * calculada acá para poder mostrarla en una tabla sin necesitar el iframe.
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
    const eliminadosSet = new Set(eliminados.map(e => e.articulo));
    const filas = new Map(base.map(b => [b.articulo, { ...b, movido: false }]));
    for (const m of movidas) {
      const actual = filas.get(m.articulo) || { articulo: m.articulo };
      filas.set(m.articulo, {
        ...actual,
        pasillo: m.pasillo, columna: m.columna, nivel: m.nivel,
        clase: m.clase ?? actual.clase, tipo: m.tipo ?? actual.tipo,
        movido: true,
      });
    }
    for (const art of eliminadosSet) filas.delete(art);

    return [...filas.values()]
      .map(f => ({ ...f, descripcion: descPorArticulo.get(f.articulo) || 'Sin descripción disponible' }))
      .sort((a, b) => (a.pasillo + a.columna).localeCompare(b.pasillo + b.columna));
  },

  /** Se dispara con cualquier cambio real de posiciones (o de la sala, si se pasa escenarioId). */
  suscribirCambios(callback, escenarioId = null) {
    const canal = escenarioId
      ? supabase
          .channel(`reporte-escenario-${escenarioId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'escenario_posiciones', filter: `escenario_id=eq.${escenarioId}` }, callback)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'escenario_eliminados', filter: `escenario_id=eq.${escenarioId}` }, callback)
          .subscribe()
      : supabase
          .channel('reporte-posiciones')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'posiciones_actuales' }, callback)
          .subscribe();
    return () => supabase.removeChannel(canal);
  },
};
