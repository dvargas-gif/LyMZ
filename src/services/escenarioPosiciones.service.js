import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/** Posiciones dentro de UNA sala de simulación — nunca toca el mapa real. */
export const escenarioPosicionesService = {
  async listar(escenarioId) {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('escenario_posiciones')
        .select('*')
        .eq('escenario_id', escenarioId)
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  async guardar({ escenarioId, articulo, pasillo, columna, nivel, clase, grupo, tipo, usuarioId }) {
    const { error } = await supabase.from('escenario_posiciones').upsert({
      escenario_id: escenarioId, articulo, pasillo, columna, nivel, clase, grupo, tipo,
      actualizado_por: usuarioId,
      actualizado_en: new Date().toISOString(),
    });
    if (error) throw error;
  },

  /** Usado por "Volver al acomodo base" antes de volver a copiar el estado real. */
  async borrarTodos(escenarioId) {
    const { error } = await supabase.from('escenario_posiciones').delete().eq('escenario_id', escenarioId);
    if (error) throw error;
  },
};
