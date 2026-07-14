import { supabase } from './supabaseClient.js';

/**
 * Estado de migración por slot MZ (`migracion_slots`, F1/F2, ver
 * DECISIONES.md ADR-015) -- máquina de estados: pendiente -> vaciando ->
 * recolectando -> bloqueado -> confirmado. La transición a "confirmado" ya
 * está protegida a nivel de base (trigger `migracion_slots_forzar_confirmacion_rol`,
 * ver 2026-07-13_migracion_rcl_mz_rls.sql) -- este servicio no reimplementa
 * ese chequeo, solo llama.
 */
export const migracionSlotsService = {
  /** Todos los slots con algún progreso -- Map("MZ01|1" -> {...}), solo mapa real (nunca escenario_id). */
  async listar() {
    const { data, error } = await supabase
      .from('migracion_slots')
      .select('id, mz_pasillo, mz_columna, estado, iniciado_por, iniciado_en, vaciado_en, bloqueado_por, bloqueado_en, confirmado_por, confirmado_en');
    if (error) throw error;
    return new Map(data.map(s => [
      `${s.mz_pasillo}|${s.mz_columna}`,
      {
        id: s.id, estado: s.estado,
        iniciadoPor: s.iniciado_por, iniciadoEn: s.iniciado_en,
        vaciadoEn: s.vaciado_en,
        bloqueadoPor: s.bloqueado_por, bloqueadoEn: s.bloqueado_en,
        confirmadoPor: s.confirmado_por, confirmadoEn: s.confirmado_en,
      },
    ]));
  },

  /** Paso 1: "Iniciar traslado" -- crea el slot directo en 'vaciando' (no existe un estado 'pendiente' persistido: ausencia de fila = pendiente). */
  async iniciar({ mzPasillo, mzColumna, usuarioId }) {
    const { data, error } = await supabase
      .from('migracion_slots')
      .insert({ mz_pasillo: mzPasillo, mz_columna: mzColumna, estado: 'vaciando', iniciado_por: usuarioId, iniciado_en: new Date().toISOString() })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  /** vaciando -> recolectando: el rack de origen llegó a 0 artículos. Ver migracionBuffer.service.js para la confirmación en lote que acompaña esta transición. */
  async marcarVaciadoCompleto(slotId) {
    const { error } = await supabase.from('migracion_slots').update({ estado: 'recolectando', vaciado_en: new Date().toISOString() }).eq('id', slotId);
    if (error) throw error;
  },

  /** Paso 3 (operador): recolectando -> bloqueado, habilita "Confirmar finalizado". */
  async marcarBloqueado(slotId, usuarioId) {
    const { error } = await supabase.from('migracion_slots').update({ estado: 'bloqueado', bloqueado_por: usuarioId, bloqueado_en: new Date().toISOString() }).eq('id', slotId);
    if (error) throw error;
  },

  /** Paso 4 (supervisor/administrador): bloqueado -> confirmado. */
  async confirmar(slotId, usuarioId) {
    const { error } = await supabase.from('migracion_slots').update({ estado: 'confirmado', confirmado_por: usuarioId, confirmado_en: new Date().toISOString() }).eq('id', slotId);
    if (error) throw error;
  },

  /** Cancelar un traslado en curso (vaciando/recolectando) -- vuelve a 'pendiente' borrando la fila (no hay estado 'pendiente' persistido, ver iniciar()). El buffer de este slot se libera aparte (ver migracionBuffer.service.js.eliminarPorSlot) antes de llamar a esto. */
  async cancelar(slotId) {
    const { error } = await supabase.from('migracion_slots').delete().eq('id', slotId);
    if (error) throw error;
  },
};
