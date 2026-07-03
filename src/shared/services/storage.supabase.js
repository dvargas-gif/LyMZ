import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/**
 * Adapter de persistencia contra las tablas de Supabase (hoy usado solo por
 * auditoria). Los permisos de lectura/escritura los impone Postgres (RLS),
 * no esta capa.
 */
class SupabaseAdapter {
  /**
   * Trae TODAS las filas paginando — un solo select() se corta en 1000
   * filas. Esto es genérico (cualquier `coleccion`), pero en la práctica
   * lo único que hoy pasa por acá es `auditoria`: es la única tabla de
   * todo el proyecto sin un techo natural (crece con cada login/movimiento
   * mientras la app se use), así que era la candidata real a superar 1000
   * filas silenciosamente.
   */
  async getAll(coleccion) {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase.from(coleccion).select('*').range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  }

  async insert(coleccion, registro) {
    const { data, error } = await supabase.from(coleccion).insert(registro).select().single();
    if (error) throw error;
    return data;
  }

  async update(coleccion, id, cambios) {
    const { data, error } = await supabase.from(coleccion).update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  /** predicado es una función JS; se filtra en memoria tras traer todo. */
  async find(coleccion, predicado) {
    const todos = await this.getAll(coleccion);
    return todos.filter(predicado);
  }
}

export const storage = new SupabaseAdapter();
