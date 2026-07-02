import { supabase } from './supabaseClient.js';
import { inventarioService } from './inventario.service.js';
import { posicionesService } from './posiciones.service.js';
import { articulosService } from './articulos.service.js';

/**
 * Reporte de posiciones = plan base (inventario_slotting) con los
 * movimientos reales (posiciones_actuales) superpuestos encima, más la
 * descripción de cada artículo. Es la misma lógica que ya usa el mapa
 * legacy (base + overrides), pero calculada acá para poder mostrarla en
 * una tabla sin necesitar el iframe.
 */
export const reporteService = {
  async obtener() {
    const [base, movidas, descripciones] = await Promise.all([
      inventarioService.listar(),
      posicionesService.listar(),
      articulosService.listarDescripciones(),
    ]);

    const descPorArticulo = new Map(descripciones.map(d => [d.articulo, d.descripcion]));
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

    return [...filas.values()]
      .map(f => ({ ...f, descripcion: descPorArticulo.get(f.articulo) || 'Sin descripción disponible' }))
      .sort((a, b) => (a.pasillo + a.columna).localeCompare(b.pasillo + b.columna));
  },

  /** Se dispara cada vez que cambia algo en posiciones_actuales (movimientos reales). */
  suscribirCambios(callback) {
    const canal = supabase
      .channel('reporte-posiciones')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posiciones_actuales' }, callback)
      .subscribe();
    return () => supabase.removeChannel(canal);
  },
};
