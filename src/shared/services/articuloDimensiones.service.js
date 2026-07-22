import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000;

/**
 * Dimensiones reales por artículo (`articulo_dimensiones`, ver
 * supabase/sql/2026-07-21_articulo_dimensiones.sql) -- `volumen_m3` es una
 * columna GENERADA por Postgres, nunca se lee ni se escribe desde acá.
 */
export const articuloDimensionesService = {
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('articulo_dimensiones')
        .select('articulo, descripcion, largo_cm, ancho_cm, alto_cm, peso_kg, cantidad_maxima, volumen_m3')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data.map(d => ({
        articulo: d.articulo, descripcion: d.descripcion,
        largo: d.largo_cm, ancho: d.ancho_cm, alto: d.alto_cm, peso: d.peso_kg,
        cantidadMaxima: d.cantidad_maxima, volumenM3: d.volumen_m3,
      })));
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  /** Upsert por artículo -- re-importar el mismo código actualiza sus dimensiones en vez de duplicar. */
  async guardarLote(filas, usuarioId) {
    const ahora = new Date().toISOString();
    const filasDb = filas.map(f => ({
      articulo: f.articulo, descripcion: f.descripcion || null,
      largo_cm: f.largo, ancho_cm: f.ancho, alto_cm: f.alto, peso_kg: f.peso,
      cantidad_maxima: f.cantidadMaxima,
      importado_por: usuarioId, importado_en: ahora,
    }));
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('articulo_dimensiones')
        .upsert(filasDb.slice(i, i + TAMANO_PAGINA), { onConflict: 'articulo' });
      if (error) throw error;
    }
  },
};
