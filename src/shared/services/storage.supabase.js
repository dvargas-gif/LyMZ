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

  /**
   * Página de filas, más recientes primero por `id` -- a diferencia de
   * getAll(), nunca descarga más que la página pedida. Hoy solo la usa
   * `intentos_login` desde AuditoriaView.jsx (no necesita filtros, solo
   * orden+recorte); `auditoria` tiene su propio paginado con filtros en
   * audit.service.js.listarPaginado() porque necesita más que un simple range.
   */
  async getPagina(coleccion, { desde = 0, hasta = 49 } = {}) {
    const { data, error, count } = await supabase.from(coleccion).select('*', { count: 'exact' }).order('id', { ascending: false }).range(desde, hasta);
    if (error) throw error;
    return { filas: data, total: count ?? 0 };
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

  /** Cuenta filas que matchean una igualdad simple, SIN descargar sus datos (head:true) -- para KPIs tipo "cuántos" sin traer todo a memoria (ej. intentos de login fallidos en AuditoriaView.jsx). */
  async contarPorIgualdad(coleccion, columna, valor) {
    const { count, error } = await supabase.from(coleccion).select('*', { count: 'exact', head: true }).eq(columna, valor);
    if (error) throw error;
    return count ?? 0;
  }
}

export const storage = new SupabaseAdapter();
