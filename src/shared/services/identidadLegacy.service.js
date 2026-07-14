import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // mismo límite de PostgREST/Supabase por página que posiciones.service.js

/**
 * Tabla maestra RCL<->MZ por posición (`identidad_legacy`, ver
 * supabase/sql/2026-07-09_migracion_rcl_mz_borrador.sql) -- la identidad
 * legacy que el usuario arma a mano y sube por el import de F1. Acceso a
 * Supabase únicamente; el parseo/validación del archivo vive en
 * src/features/migracion/identidadLegacy.service.js (puro, sin esto).
 */
export const identidadLegacyService = {
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('identidad_legacy')
        .select('mz_pasillo, mz_columna, rcl_codigo, estado_rcl')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data.map(d => ({ mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, rclCodigo: d.rcl_codigo, estadoRcl: d.estado_rcl })));
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  /** Upsert por (mz_pasillo, mz_columna) -- idempotente por MZ, confirmado con el usuario: re-importar el mismo MZ actualiza su rcl_codigo/estado_rcl en vez de fallar. */
  async guardarLote(filas, usuarioId) {
    const ahora = new Date().toISOString();
    const filasDb = filas.map(f => ({
      mz_pasillo: f.mzPasillo, mz_columna: f.mzColumna, rcl_codigo: f.rclCodigo, estado_rcl: f.estadoRcl,
      importado_por: usuarioId, importado_en: ahora,
    }));
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('identidad_legacy')
        .upsert(filasDb.slice(i, i + TAMANO_PAGINA), { onConflict: 'mz_pasillo,mz_columna' });
      if (error) throw error;
    }
  },
};
