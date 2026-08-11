import { supabase } from './supabaseClient.js';
import { posicionesService } from './posiciones.service.js';

const TAMANO_PAGINA = 1000;

/**
 * I/O de Supabase para el motor de distribución (Fase 5, ver
 * supabase/sql/2026-08-07_distribucion_motor.sql). El motor en sí
 * (`src/engines/optimization/`) es puro y no sabe nada de Supabase --
 * este archivo es la única pieza que conecta su resultado con la base,
 * siguiendo el mismo patrón que ya usan articuloDimensiones.service.js/
 * migracionMovimientos.service.js.
 *
 * "Aprobar" es la ÚNICA función que escribe algo REAL (posiciones_actuales,
 * vía posicionesService.guardarLote() -- ya existente, no se reinventa) --
 * todo lo demás son tablas de propuesta/auditoría, nunca tocan el mapa real
 * hasta que alguien aprueba explícitamente (Ley 9).
 */
export const distribucionPropuestaService = {
  /**
   * Guarda una propuesta recién calculada -- 1 fila en `distribucion_lotes`
   * + N filas en `inventario_slotting_propuesto` (el diff completo).
   * @param {{resumen, diff, variante, resultadosPorVariante}} propuesta -- salida de generarPropuestaDistribucion()
   * @param {object} parametros -- snapshot de pesos/zonas/reglas usados (trazabilidad, Ley 8)
   * @param {string} usuarioId
   * @returns {Promise<number>} el id del lote creado
   */
  async guardarPropuesta(propuesta, parametros, usuarioId) {
    const { data: lote, error: errorLote } = await supabase
      .from('distribucion_lotes')
      .insert({
        generado_por: usuarioId,
        parametros: { ...parametros, variante: propuesta.variante, resultadosPorVariante: propuesta.resultadosPorVariante },
        total_articulos: propuesta.resumen.totalArticulos,
        total_movimientos: propuesta.resumen.totalMovimientos,
        total_sin_asignar: propuesta.resumen.totalSinAsignar,
        metricas_agregadas: propuesta.resumen,
      })
      .select('id')
      .single();
    if (errorLote) throw errorLote;

    const filas = propuesta.diff.map(d => ({
      lote_id: lote.id,
      articulo: d.articulo,
      pasillo_destino: d.destino.pasillo, columna_destino: d.destino.columna, nivel_destino: d.destino.nivel,
      pasillo_origen: d.origen?.pasillo ?? null, columna_origen: d.origen?.columna ?? null, nivel_origen: d.origen?.nivel ?? null,
      utilizacion_resultante: d.utilizacionResultante,
      afinidad: d.afinidad,
      violaciones: 0,
      costo_total: d.costo,
      motivo: d.motivo,
      cambia_ubicacion: d.cambiaUbicacion,
    }));
    for (let i = 0; i < filas.length; i += TAMANO_PAGINA) {
      const { error } = await supabase.from('inventario_slotting_propuesto').insert(filas.slice(i, i + TAMANO_PAGINA));
      if (error) throw error;
    }
    return lote.id;
  },

  /** El lote más reciente que sigue en estado 'calculado' (todavía no aprobado ni descartado), o null si no hay ninguno pendiente. */
  async obtenerLoteVigente() {
    const { data, error } = await supabase
      .from('distribucion_lotes')
      .select('*')
      .eq('estado', 'calculado')
      .order('generado_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** El diff completo de un lote -- para mostrarlo en pantalla o exportarlo. */
  async listarDiff(loteId) {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('inventario_slotting_propuesto')
        .select('*')
        .eq('lote_id', loteId)
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  /**
   * Aprueba un lote -- lo único que toca algo REAL. Congela primero la
   * auditoría (hecho histórico), después escribe posiciones_actuales
   * (única fuente real que cambia), y por último marca el lote aprobado.
   * Solo mueve las filas con `cambia_ubicacion=true` -- si ya estaba donde
   * el motor lo puso, no hay nada que escribir de nuevo.
   *
   * `ocupacionesOrigenDestino` es opcional -- un Map articulo -> {ocupacionOrigenAntes, ocupacionDestinoAntes},
   * calculado por quien llama (UI, con el WarehouseModel en memoria) si lo
   * tiene disponible. Si no se pasa, esos 2 campos quedan NULL explícito
   * en la auditoría -- nunca se inventa un número.
   */
  async aprobarPropuesta(loteId, usuarioId, ocupacionesOrigenDestino = new Map()) {
    const diff = await this.listarDiff(loteId);
    const filasAMover = diff.filter(d => d.cambia_ubicacion);

    const eventosAuditoria = diff.map(d => {
      const previas = ocupacionesOrigenDestino.get(d.articulo) ?? {};
      return {
        lote_id: loteId,
        articulo: d.articulo,
        pasillo_origen: d.pasillo_origen, columna_origen: d.columna_origen, nivel_origen: d.nivel_origen,
        pasillo_destino: d.pasillo_destino, columna_destino: d.columna_destino, nivel_destino: d.nivel_destino,
        motivo: d.motivo,
        reglas_evaluadas: [], // el detalle regla-por-regla vive en el motor en el momento del cálculo; acá se congela el resultado final
        ocupacion_origen_antes: previas.ocupacionOrigenAntes ?? null,
        ocupacion_destino_antes: previas.ocupacionDestinoAntes ?? null,
        ocupacion_destino_despues: d.utilizacion_resultante,
        costo_total: d.costo_total,
        aprobado_por: usuarioId,
      };
    });
    for (let i = 0; i < eventosAuditoria.length; i += TAMANO_PAGINA) {
      const { error } = await supabase.from('distribucion_auditoria').insert(eventosAuditoria.slice(i, i + TAMANO_PAGINA));
      if (error) throw error;
    }

    if (filasAMover.length > 0) {
      const posiciones = filasAMover.map(d => ({
        articulo: d.articulo, pasillo: d.pasillo_destino, columna: d.columna_destino, nivel: d.nivel_destino,
      }));
      await posicionesService.guardarLote(posiciones, usuarioId);
    }

    const { error: errorLote } = await supabase
      .from('distribucion_lotes')
      .update({ estado: 'aprobado', aprobado_por: usuarioId, aprobado_en: new Date().toISOString() })
      .eq('id', loteId);
    if (errorLote) throw errorLote;
  },

  /** Descarta un lote sin aplicarlo -- no toca nada real. */
  async descartarPropuesta(loteId) {
    const { error } = await supabase.from('distribucion_lotes').update({ estado: 'descartado' }).eq('id', loteId);
    if (error) throw error;
  },
};
