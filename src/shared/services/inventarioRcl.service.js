import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000;

/** Inventario actual por sub-posición RCL (F1.5-B, `inventario_rcl_actual`) -- se re-importa periódicamente, upsert por sub-posición, nunca un historial. */
export const inventarioRclService = {
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('inventario_rcl_actual')
        .select('rcl_codigo, rcl_nivel, rcl_subnivel, articulo, cantidad')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data.map(d => ({ rclCodigo: d.rcl_codigo, rclNivel: d.rcl_nivel, rclSubnivel: d.rcl_subnivel, articulo: d.articulo, cantidad: d.cantidad })));
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  async guardarLote(filas, usuarioId) {
    const ahora = new Date().toISOString();
    const filasDb = filas.map(f => ({
      rcl_codigo: f.rclCodigo, rcl_nivel: f.rclNivel, rcl_subnivel: f.rclSubnivel,
      articulo: f.articulo, cantidad: f.cantidad,
      actualizado_por: usuarioId, actualizado_en: ahora,
    }));
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('inventario_rcl_actual')
        .upsert(filasDb.slice(i, i + TAMANO_PAGINA), { onConflict: 'rcl_codigo,rcl_nivel,rcl_subnivel' });
      if (error) throw error;
    }
  },
};
