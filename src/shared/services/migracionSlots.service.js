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
      .select('id, mz_pasillo, mz_columna, estado, iniciado_por, iniciado_en, vaciado_en, bloqueado_por, bloqueado_en, confirmado_por, confirmado_en, aprobado_por, aprobado_en');
    if (error) throw error;
    return new Map(data.map(s => [
      `${s.mz_pasillo}|${s.mz_columna}`,
      {
        id: s.id, estado: s.estado,
        iniciadoPor: s.iniciado_por, iniciadoEn: s.iniciado_en,
        vaciadoEn: s.vaciado_en,
        bloqueadoPor: s.bloqueado_por, bloqueadoEn: s.bloqueado_en,
        confirmadoPor: s.confirmado_por, confirmadoEn: s.confirmado_en,
        aprobadoPor: s.aprobado_por, aprobadoEn: s.aprobado_en,
      },
    ]));
  },

  /**
   * Paso 1: "Iniciar traslado" -- intenta crear el slot directo en
   * 'vaciando' (no existe un estado 'pendiente' persistido: ausencia de
   * fila = pendiente). El cupo de equipos activos (2 cuerpos = 10 niveles
   * cada uno, máximo 3 concurrentes) lo decide un trigger de la base
   * (`migracion_slots_forzar_cupo_equipos`, ver
   * 2026-07-17_migracion_cupo_aprobacion.sql) -- si ya hay 1 o 2 equipos
   * activos, la fila queda en 'esperando_aprobacion' en vez de 'vaciando'
   * aunque acá se haya pedido lo segundo; si ya hay 3, el insert falla con
   * una excepción. Por eso se devuelve el `estado` REAL de la fila
   * insertada, no se asume 'vaciando' a ciegas.
   */
  async iniciar({ mzPasillo, mzColumna, usuarioId }) {
    const { data, error } = await supabase
      .from('migracion_slots')
      .insert({ mz_pasillo: mzPasillo, mz_columna: mzColumna, estado: 'vaciando', iniciado_por: usuarioId, iniciado_en: new Date().toISOString() })
      .select('id, estado')
      .single();
    if (error) throw error;
    return { id: data.id, estado: data.estado };
  },

  /** Cola de aprobación (Supervisor/Administrador): slots que pidieron ser el 2do/3er equipo concurrente. */
  async listarEsperandoAprobacion() {
    const { data, error } = await supabase
      .from('migracion_slots')
      .select('id, mz_pasillo, mz_columna, iniciado_por, iniciado_en')
      .eq('estado', 'esperando_aprobacion')
      .order('iniciado_en', { ascending: true });
    if (error) throw error;
    return data.map(s => ({ id: s.id, mzPasillo: s.mz_pasillo, mzColumna: s.mz_columna, iniciadoPor: s.iniciado_por, iniciadoEn: s.iniciado_en }));
  },

  /** Aprueba un equipo adicional en espera -- esperando_aprobacion -> vaciando. Rol restringido por trigger (migracion_slots_forzar_aprobacion_rol), no solo acá. */
  async aprobar(slotId, usuarioId) {
    const { error } = await supabase
      .from('migracion_slots')
      .update({ estado: 'vaciando', aprobado_por: usuarioId, aprobado_en: new Date().toISOString() })
      .eq('id', slotId);
    if (error) throw error;
  },

  /** Rechaza (o el propio equipo retira) una solicitud en espera -- mismo criterio que cancelar: borra la fila, nunca se ejecutó nada real todavía. */
  async rechazar(slotId) {
    const { error } = await supabase.from('migracion_slots').delete().eq('id', slotId);
    if (error) throw error;
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

  /**
   * Cancelar/eliminar un traslado -- vuelve a 'pendiente' borrando la fila
   * (no hay estado 'pendiente' persistido, ver iniciar()). El buffer de
   * este slot se libera aparte (ver migracionBuffer.service.js.eliminarPorSlot)
   * ANTES de llamar a esto -- `migracion_buffer.slot_origen_id` referencia
   * esta fila sin ON DELETE CASCADE, así que Postgres rechaza el delete si
   * todavía queda algo del buffer sin liberar primero.
   *
   * Reutilizado también como el "Eliminar" de vista de administrador
   * (`PanelMigracion.jsx`) sobre CUALQUIER estado, no solo
   * vaciando/recolectando -- a diferencia del botón del operador
   * (`puedeCancelar`, acotado a antes de "bloqueado"), acá es una
   * corrección administrativa explícita, sin esa restricción de flujo.
   */
  async cancelar(slotId) {
    const { error } = await supabase.from('migracion_slots').delete().eq('id', slotId);
    if (error) throw error;
  },

  /** Vista de administrador: deshace una confirmación hecha por error -- confirmado -> bloqueado, vuelve a esperar confirmación. Restringido por el mismo trigger de rol que la confirmación (migracion_slots_forzar_confirmacion_rol). */
  async desconfirmar(slotId) {
    const { error } = await supabase.from('migracion_slots').update({ estado: 'bloqueado', confirmado_por: null, confirmado_en: null }).eq('id', slotId);
    if (error) throw error;
  },

  /** recolectando -> vaciando: se "devolvió" un artículo del buffer (deshecho por error) y el rack ya no está realmente vacío -- mismo invariante que dispara marcarVaciadoCompleto, pero en reversa. */
  async revertirAVaciando(slotId) {
    const { error } = await supabase.from('migracion_slots').update({ estado: 'vaciando', vaciado_en: null }).eq('id', slotId);
    if (error) throw error;
  },
};
