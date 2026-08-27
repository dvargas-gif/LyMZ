import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000;

/** Máximos/mínimos de pick por artículo (`zonas_pick`, ver supabase/sql/2026-08-22_zonas_pick.sql). */
export const zonasPickService = {
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('zonas_pick')
        .select('articulo, cantidad_minima, cantidad_maxima, ubicacion_rcl')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data.map(d => ({
        articulo: d.articulo, cantidadMinima: d.cantidad_minima, cantidadMaxima: d.cantidad_maxima,
        ubicacionRcl: d.ubicacion_rcl,
      })));
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  /** Upsert por artículo -- re-importar el mismo código actualiza sus máximos/mínimos en vez de duplicar. */
  async guardarLote(filas, usuarioId) {
    const ahora = new Date().toISOString();
    const filasDb = filas.map(f => ({
      articulo: f.articulo,
      cantidad_minima: f.cantidadMinima, cantidad_maxima: f.cantidadMaxima,
      ubicacion_rcl: f.ubicacionRcl ?? null,
      importado_por: usuarioId, importado_en: ahora,
    }));
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('zonas_pick')
        .upsert(filasDb.slice(i, i + TAMANO_PAGINA), { onConflict: 'articulo' });
      if (error) throw error;
    }
  },
};
