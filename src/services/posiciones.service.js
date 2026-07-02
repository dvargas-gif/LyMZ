import { supabase } from './supabaseClient.js';

/**
 * Estado ACTUAL (última posición conocida) de cada artículo movido en el
 * mapa. Es un complemento de `auditoria` (que es el historial completo,
 * append-only): esta tabla solo guarda la foto más reciente por artículo,
 * para poder reconstruir el mapa tal como quedó al reabrir la app.
 */
export const posicionesService = {
  async listar() {
    const { data, error } = await supabase.from('posiciones_actuales').select('*');
    if (error) throw error;
    return data;
  },

  async guardar({ articulo, pasillo, columna, nivel, usuarioId }) {
    const { error } = await supabase.from('posiciones_actuales').upsert({
      articulo, pasillo, columna, nivel,
      actualizado_por: usuarioId,
      actualizado_en: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
