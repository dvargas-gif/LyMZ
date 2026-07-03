import { supabase } from '../../shared/services/supabaseClient.js';

/** Bloqueos DENTRO de una sala de simulación — nunca toca la tabla real `bloqueos`. */
export const escenarioBloqueosService = {
  // Sin paginación a propósito: acá el techo es la grilla física (8
  // pasillos × 36 columnas = 288 slots como máximo). Aunque una sala
  // bloqueara literalmente TODO el mapa, nunca llega a las 1000 filas del
  // límite de PostgREST.
  async listar(escenarioId) {
    const { data, error } = await supabase.from('escenario_bloqueos').select('*').eq('escenario_id', escenarioId);
    if (error) throw error;
    return data;
  },

  async bloquear({ escenarioId, key, pasillo, columna, usuarioId }) {
    const { error } = await supabase.from('escenario_bloqueos').upsert({
      escenario_id: escenarioId, rack_key: key, pasillo, columna,
      actualizado_por: usuarioId,
      actualizado_en: new Date().toISOString(),
    });
    if (error) throw error;
  },

  async desbloquear(escenarioId, key) {
    const { error } = await supabase.from('escenario_bloqueos').delete().eq('escenario_id', escenarioId).eq('rack_key', key);
    if (error) throw error;
  },

  async borrarTodos(escenarioId) {
    const { error } = await supabase.from('escenario_bloqueos').delete().eq('escenario_id', escenarioId);
    if (error) throw error;
  },
};
