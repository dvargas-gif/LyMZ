import { supabase } from '../../shared/services/supabaseClient.js';

/** Artículos borrados dentro de UNA sala ("Limpiar slot") — nunca toca el mapa real. */
export const escenarioEliminadosService = {
  async listar(escenarioId) {
    const { data, error } = await supabase.from('escenario_eliminados').select('*').eq('escenario_id', escenarioId);
    if (error) throw error;
    return data;
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
