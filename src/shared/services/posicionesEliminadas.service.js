import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/**
 * Artículos removidos del MAPA REAL -- equivalente de escenarioEliminados.service.js
 * pero sin escenario_id (nunca existió esta capacidad para el mapa real, ver
 * crearWarehouseModel.js). Solo Administrador puede usar esto (ver roles.js
 * y la RLS de la tabla) -- a diferencia de una sala, acá no hay "volver al
 * acomodo base": si hace falta deshacer, se borra la fila de esta tabla.
 */
export const posicionesEliminadasService = {
  /** Trae TODAS las filas paginando -- un solo select() se corta en 1000 filas. */
  async listar() {
    const todos = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase.from('posiciones_eliminadas').select('*').range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todos;
  },

  /**
   * Quita del mapa real un lote de artículos: borra su override de posición
   * (si tenían uno) y los marca en posiciones_eliminadas, en tandas de 1000
   * (mismo límite que posicionesService.guardarLote). Idempotente -- volver
   * a marcar un artículo ya eliminado solo actualiza el upsert.
   */
  async marcarEliminados(articulos, usuarioId, motivo) {
    const ahora = new Date().toISOString();
    for (let i = 0; i < articulos.length; i += TAMANO_PAGINA) {
      const lote = articulos.slice(i, i + TAMANO_PAGINA);
      const { error: errorBorrado } = await supabase.from('posiciones_actuales').delete().in('articulo', lote);
      if (errorBorrado) throw errorBorrado;
      const filas = lote.map(articulo => ({ articulo, eliminado_por: usuarioId, eliminado_en: ahora, motivo }));
      const { error: errorUpsert } = await supabase.from('posiciones_eliminadas').upsert(filas);
      if (errorUpsert) throw errorUpsert;
    }
  },

  /** Cuenta cuántos artículos eliminados tienen un motivo que empieza con `prefijo` (ej. "Exiliado") -- head:true, no descarga filas, solo el total. Para el KPI de "cuántos exiliados hasta ahora" del panel de limpieza. */
  async contarPorMotivoPrefijo(prefijo) {
    const { count, error } = await supabase.from('posiciones_eliminadas').select('*', { count: 'exact', head: true }).ilike('motivo', `${prefijo}%`);
    if (error) throw error;
    return count ?? 0;
  },

  /** Lista completa (paginada) de artículos eliminados cuyo motivo empieza con `prefijo` -- a diferencia de contarPorMotivoPrefijo (solo el número), acá sí hace falta el detalle (ver PanelMigracion.jsx: cruzar contra inventario_slotting). */
  async listarPorMotivoPrefijo(prefijo) {
    const todos = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase.from('posiciones_eliminadas').select('*').ilike('motivo', `${prefijo}%`).range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todos;
  },
};
