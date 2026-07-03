import { supabase } from '../../shared/services/supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/**
 * Datos de picks cargados DENTRO de una sala, para simular rotación/demanda
 * y compararla contra el acomodo de esa sala. Nunca toca ninguna tabla real.
 */
export const escenarioPicksService = {
  async listar(escenarioId) {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('escenario_picks')
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

  /** Cada carga REEMPLAZA la anterior (es el "dataset de trabajo" actual de la sala, no un histórico acumulativo). */
  async cargarLote({ escenarioId, filas, usuarioId }) {
    const { error: errBorrar } = await supabase.from('escenario_picks').delete().eq('escenario_id', escenarioId);
    if (errBorrar) throw errBorrar;
    if (filas.length === 0) return;
    const filasDb = filas.map(f => ({
      escenario_id: escenarioId,
      articulo: f.articulo,
      nombre: f.nombre || null,
      cantidad_picks: f.cantidad_picks || 0,
      frecuencia: f.frecuencia,
      prioridad: f.prioridad,
      periodo: f.periodo,
      cargado_por: usuarioId,
    }));
    // Insertar en tandas: un solo insert con miles de filas puede exceder el límite del request.
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase.from('escenario_picks').insert(filasDb.slice(i, i + TAMANO_PAGINA));
      if (error) throw error;
    }
  },
};
