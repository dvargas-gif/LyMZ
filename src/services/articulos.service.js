import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/** Catálogo de descripciones de artículo (dato maestro, solo lectura desde la app). */
export const articulosService = {
  /** Trae TODAS las filas paginando — un solo select() se corta en 1000 filas. */
  async listarDescripciones() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('articulos_info')
        .select('articulo,descripcion')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },
};
