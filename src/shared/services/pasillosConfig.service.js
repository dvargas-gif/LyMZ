import { supabase } from './supabaseClient.js';

/**
 * Hasta qué columna dibuja cada pasillo (por defecto: MZ01 hasta C027, el
 * resto hasta C036 — igual que hoy vive hardcodeado en el mapa legacy).
 * "Añadir rack" solo sube este número; no crea filas de artículos.
 */
export const pasillosConfigService = {
  async listar() {
    const { data, error } = await supabase.from('pasillos_config').select('*');
    if (error) throw error;
    return data;
  },

  async extender({ pasillo, maxColumna, usuarioId }) {
    const { error } = await supabase.from('pasillos_config').upsert({
      pasillo, max_columna: maxColumna,
      actualizado_por: usuarioId,
      actualizado_en: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
