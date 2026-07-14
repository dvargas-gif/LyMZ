import { supabase } from './supabaseClient.js';

/** Eventos dedicados por slot de migración (`migracion_auditoria`, F1/F2) -- append-only, mismo criterio que `auditoria`: sin update/delete. */
export const migracionAuditoriaService = {
  async registrar({ mzPasillo, mzColumna, evento, detalle, usuarioId }) {
    const { data, error } = await supabase
      .from('migracion_auditoria')
      .insert({ mz_pasillo: mzPasillo, mz_columna: mzColumna, evento, detalle, usuario_id: usuarioId })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },
};
