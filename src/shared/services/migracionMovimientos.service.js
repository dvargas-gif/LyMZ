import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000;

/**
 * Plan de recolección por destino MZ (`migracion_movimientos`, F1.5-C) --
 * generado desde `inventario_slotting` + `inventario_rcl_actual` (ver
 * generarMovimientos.js), nunca subido a mano. RLS: insertar/reemplazar es
 * Supervisor/Administrador; marcar recolectado es cualquier rol operativo
 * (ver supabase/sql/2026-07-13_migracion_rcl_mz_rls.sql).
 */
export const migracionMovimientosService = {
  /** id -> destino MZ, para TODOS los movimientos pendientes -- liviano (sin cantidad/orden/estado), pensado para que MapaCanvas.jsx resuelva el destino real de cada artículo del buffer (via migracion_buffer.movimiento_id) sin otro round-trip por destino. */
  async listarTodos() {
    const { data, error } = await supabase.from('migracion_movimientos').select('id, mz_pasillo, mz_columna').eq('estado', 'pendiente');
    if (error) throw error;
    return data.map(d => ({ id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna }));
  },

  /** TODOS los movimientos pendientes, con su origen RCL -- lo que necesita planificarSecuencia.js para armar el grafo de dependencias entre racks (a diferencia de listarTodos(), acá sí hace falta rcl_codigo/rcl_nivel). */
  async listarPendientesParaSecuencia() {
    const { data, error } = await supabase
      .from('migracion_movimientos')
      .select('id, mz_pasillo, mz_columna, rcl_codigo, rcl_nivel, articulo')
      .eq('estado', 'pendiente');
    if (error) throw error;
    return data.map(d => ({ id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, rclCodigo: d.rcl_codigo, rclNivel: d.rcl_nivel, articulo: d.articulo }));
  },

  /** Lista de pick de UNA posición MZ destino, en orden de recolección. */
  async listarPorDestino(mzPasillo, mzColumna) {
    const { data, error } = await supabase
      .from('migracion_movimientos')
      .select('id, mz_nivel, rcl_codigo, rcl_nivel, articulo, cantidad, orden, estado, recolectado_por, recolectado_en')
      .eq('mz_pasillo', mzPasillo).eq('mz_columna', mzColumna)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data.map(d => ({
      id: d.id, mzNivel: d.mz_nivel, rclCodigo: d.rcl_codigo, rclNivel: d.rcl_nivel,
      articulo: d.articulo, cantidad: d.cantidad, orden: d.orden, estado: d.estado,
      recolectadoPor: d.recolectado_por, recolectadoEn: d.recolectado_en,
    }));
  },

  /**
   * Reemplaza el plan PENDIENTE (borra las filas en estado 'pendiente' y
   * vuelve a insertar las recién generadas) -- nunca toca una fila ya
   * 'recolectado' (sería perder progreso real de un operador). Se puede
   * correr de nuevo cuando se reimporte un inventario RCL más fresco.
   *
   * `upsert` con `ignoreDuplicates` (no `insert`) -- sobre el índice único
   * parcial `migracion_movimientos_pendiente_unique` (mz_pasillo,mz_columna,
   * mz_nivel,rcl_codigo,rcl_nivel,articulo where estado='pendiente'), para
   * que un doble-click en "Aplicar" (dos llamadas en carrera) nunca pueda
   * duplicar una fila -- la segunda simplemente no inserta la que ya existe,
   * en vez de fallar o generar un duplicado silencioso.
   */
  async reemplazarPendientes(movimientos, usuarioId) {
    const { error: errorBorrado } = await supabase.from('migracion_movimientos').delete().eq('estado', 'pendiente');
    if (errorBorrado) throw errorBorrado;

    const ahora = new Date().toISOString();
    const filasDb = movimientos.map(m => ({
      mz_pasillo: m.mzPasillo, mz_columna: m.mzColumna, mz_nivel: m.mzNivel,
      rcl_codigo: m.rclCodigo, rcl_nivel: String(m.rclNivel),
      articulo: m.articulo, cantidad: m.cantidad, orden: m.orden,
      importado_por: usuarioId, importado_en: ahora,
    }));
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('migracion_movimientos')
        .upsert(filasDb.slice(i, i + TAMANO_PAGINA), {
          onConflict: 'mz_pasillo,mz_columna,mz_nivel,rcl_codigo,rcl_nivel,articulo',
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }
  },

  /** Paso 2 del flujo guiado (recolectando): el operador marca UN artículo puntual como ya recolectado. */
  async marcarRecolectado(id, usuarioId) {
    const { error } = await supabase.from('migracion_movimientos')
      .update({ estado: 'recolectado', recolectado_por: usuarioId, recolectado_en: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** % del plan ya recolectado, para el resumen del Panel de Migración -- `count:'exact', head:true` trae solo el número, sin bajar ninguna fila (el plan puede tener miles). */
  async contarProgreso() {
    const [total, recolectados] = await Promise.all([
      supabase.from('migracion_movimientos').select('id', { count: 'exact', head: true }),
      supabase.from('migracion_movimientos').select('id', { count: 'exact', head: true }).eq('estado', 'recolectado'),
    ]);
    if (total.error) throw total.error;
    if (recolectados.error) throw recolectados.error;
    return { total: total.count ?? 0, recolectados: recolectados.count ?? 0 };
  },
};
