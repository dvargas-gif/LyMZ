import { supabase } from './supabaseClient.js';

/** Configuración global del croquis (tema de colores, orientación) — fila única, solo Admin la edita. */
export const configMapaService = {
  async obtener() {
    const { data, error } = await supabase.from('config_mapa').select('*').eq('id', 1).single();
    if (error) throw error;
    return data;
  },

  async actualizar({ tema, orientacion, usuarioId }) {
    const cambios = { actualizado_por: usuarioId, actualizado_en: new Date().toISOString() };
    if (tema) cambios.tema = tema;
    if (orientacion) cambios.orientacion = orientacion;
    const { error } = await supabase.from('config_mapa').update(cambios).eq('id', 1);
    if (error) throw error;
  },
};
