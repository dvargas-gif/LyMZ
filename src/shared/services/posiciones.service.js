import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/**
 * Estado ACTUAL (última posición conocida) de cada artículo movido en el
 * mapa. Es un complemento de `auditoria` (que es el historial completo,
 * append-only): esta tabla solo guarda la foto más reciente por artículo,
 * para poder reconstruir el mapa tal como quedó al reabrir la app.
 */
export const posicionesService = {
  /** Trae TODAS las filas paginando — un solo select() se corta en 1000 filas. */
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('posiciones_actuales')
        .select('*')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  async guardar({ articulo, pasillo, columna, nivel, clase, grupo, tipo, usuarioId }) {
    const { error } = await supabase.from('posiciones_actuales').upsert({
      articulo, pasillo, columna, nivel, clase, grupo, tipo,
      actualizado_por: usuarioId,
      actualizado_en: new Date().toISOString(),
    });
    if (error) throw error;
  },

  /** Carga masiva (ej. desde Excel): un solo upsert con todas las filas, en tandas de a 1000. */
  async guardarLote(filas, usuarioId) {
    const ahora = new Date().toISOString();
    const filasDb = filas.map(f => ({ ...f, actualizado_por: usuarioId, actualizado_en: ahora }));
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase.from('posiciones_actuales').upsert(filasDb.slice(i, i + TAMANO_PAGINA));
      if (error) throw error;
    }
  },
};
