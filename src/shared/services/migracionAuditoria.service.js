import { supabase } from './supabaseClient.js';

function filaAEvento(d) {
  return {
    id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna,
    evento: d.evento, detalle: d.detalle, usuarioId: d.usuario_id, fechaHora: d.fecha_hora,
  };
}

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

  /** Últimos N eventos, más reciente primero -- para la bitácora en vivo del mapa (2026-08-26, pedido explícito: "quiero un real time de los movimientos"). */
  async listarRecientes(limite = 50) {
    const { data, error } = await supabase
      .from('migracion_auditoria')
      .select('id, mz_pasillo, mz_columna, evento, detalle, usuario_id, fecha_hora')
      .order('fecha_hora', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data.map(filaAEvento);
  },
};
