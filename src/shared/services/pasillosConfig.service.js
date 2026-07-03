import { supabase } from './supabaseClient.js';

/**
 * Hasta qué columna dibuja cada pasillo (por defecto: MZ01 hasta C027, el
 * resto hasta C036 — igual que hoy vive hardcodeado en el mapa legacy).
 * "Añadir rack" solo sube este número; no crea filas de artículos.
 */
export const pasillosConfigService = {
  // Sin paginación a propósito: esta tabla tiene un techo estructural de 8
  // filas (MZ01-MZ08, un pasillo fijo cada una — "Añadir rack" extiende un
  // pasillo existente, nunca crea uno nuevo). No hay escenario en el que
  // esto llegue ni cerca de las 1000 filas del límite de PostgREST.
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
