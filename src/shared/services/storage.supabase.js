import { supabase } from './supabaseClient.js';
import { StorageInterface } from './storage.interface.js';

/**
 * Adapter real: cumple el mismo contrato que storage.local.js pero contra
 * las tablas de Supabase. Los permisos de lectura/escritura los impone
 * Postgres (RLS), no esta capa.
 */
class SupabaseAdapter extends StorageInterface {
  async getAll(coleccion) {
    const { data, error } = await supabase.from(coleccion).select('*');
    if (error) throw error;
    return data;
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
