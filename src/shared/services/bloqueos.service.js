import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/** Posiciones bloqueadas físicamente en el mapa (presencia = bloqueada). */
export const bloqueosService = {
  /** Trae TODAS las filas paginando — un solo select() se corta en 1000 filas. */
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('bloqueos')
        .select('*')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  async bloquear({ key, pasillo, columna, usuarioId }) {
    const { error } = await supabase.from('bloqueos').upsert({
      rack_key: key, pasillo, columna,
      actualizado_por: usuarioId,
      actualizado_en: new Date().toISOString(),
    });
    if (error) throw error;
  },

  async desbloquear(key) {
    const { error } = await supabase.from('bloqueos').delete().eq('rack_key', key);
    if (error) throw error;
  },
};
