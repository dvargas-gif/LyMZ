import { supabase } from '../../shared/services/supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/**
 * Artículos borrados dentro de UNA sala ("Limpiar slot") — nunca toca el mapa
 * real. A diferencia de escenario_bloqueos (con techo físico de 288 slots),
 * acá el techo teórico es el inventario completo (3016 artículos), que SÍ
 * supera 1000 — por eso esta lista pagina y bloqueos no.
 */
export const escenarioEliminadosService = {
  /** Trae TODAS las filas paginando — un solo select() se corta en 1000 filas. */
  async listar(escenarioId) {
    const todos = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase.from('escenario_eliminados').select('*').eq('escenario_id', escenarioId).range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todos;
  },

  async marcarEliminado({ escenarioId, articulo, usuarioId }) {
    await supabase.from('escenario_posiciones').delete().eq('escenario_id', escenarioId).eq('articulo', articulo);
    const { error } = await supabase.from('escenario_eliminados').upsert({
      escenario_id: escenarioId, articulo, eliminado_por: usuarioId, eliminado_en: new Date().toISOString(),
    });
    if (error) throw error;
  },

  /** Usado por "Volver al acomodo base": los artículos "limpiados" dejan de estarlo. */
  async borrarTodos(escenarioId) {
    const { error } = await supabase.from('escenario_eliminados').delete().eq('escenario_id', escenarioId);
    if (error) throw error;
  },
};
