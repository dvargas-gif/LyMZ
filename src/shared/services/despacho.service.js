import { supabase } from './supabaseClient.js';
import { migracionMovimientosService } from './migracionMovimientos.service.js';
import { migracionSlotsService } from './migracionSlots.service.js';
import { migracionBufferService } from './migracionBuffer.service.js';
import { identidadLegacyService } from './identidadLegacy.service.js';
import { inventarioRclService } from './inventarioRcl.service.js';
import { inventarioService } from './inventario.service.js';
import { planificarSecuencia } from '../../features/migracion/planificarSecuencia.js';
import { generarLoteDespacho, contenidoActualDeRacks } from '../../features/despacho/generarLoteDespacho.js';

function tareaDesdeFila(t) {
  return {
    id: t.id, orden: t.orden, tipo: t.tipo,
    mzPasillo: t.mz_pasillo, mzColumna: t.mz_columna, movimientoId: t.movimiento_id,
    articulo: t.articulo, rclCodigo: t.rcl_codigo, rclNivel: t.rcl_nivel, cantidad: t.cantidad,
    estado: t.estado, resueltoPor: t.resuelto_por, resueltoEn: t.resuelto_en,
  };
}

/**
 * Módulo de Despacho (ver supabase/sql/2026-07-21_despacho_lotes_tareas.sql
 * y DECISIONES.md sesión 2026-07-21): genera y gestiona las hojas de
 * trabajo por oleada para trabajadores de piso numerados. Nunca reimplementa
 * el motor de migración -- consume `planificarSecuencia` tal cual, y CADA
 * confirmación (vaciar o recolectar) pasa por el mismo camino
 * (`migracion_slots`/`migracion_buffer`/`migracion_movimientos`) que ya usa
 * el flujo guiado del mapa, vía el RPC `confirmar_tarea_despacho` (todo en
 * una transacción del lado de la base, ver el SQL).
 */
export const despachoService = {
  /** El lote activo (si hay uno) con sus tareas agrupadas por número de trabajador, en orden. `null` si no hay ningún lote activo ahora mismo. */
  async obtenerLoteActivo() {
    const { data: lote, error: errorLote } = await supabase
      .from('despacho_lotes')
      .select('id, generado_por, generado_en, cantidad_operadores, estado')
      .eq('estado', 'activo')
      .maybeSingle();
    if (errorLote) throw errorLote;
    if (!lote) return null;

    const { data: tareas, error: errorTareas } = await supabase
      .from('despacho_tareas')
      .select('id, trabajador_numero, orden, tipo, mz_pasillo, mz_columna, movimiento_id, articulo, rcl_codigo, rcl_nivel, cantidad, estado, resuelto_por, resuelto_en')
      .eq('lote_id', lote.id)
      .order('trabajador_numero', { ascending: true })
      .order('orden', { ascending: true });
    if (errorTareas) throw errorTareas;

    const porTrabajador = new Map();
    for (const t of tareas) {
      if (!porTrabajador.has(t.trabajador_numero)) porTrabajador.set(t.trabajador_numero, []);
      porTrabajador.get(t.trabajador_numero).push(tareaDesdeFila(t));
    }
    const trabajadores = [...porTrabajador.entries()]
      .sort(([a], [b]) => a - b)
      .map(([numero, tareasDelTrabajador]) => ({ numero, tareas: tareasDelTrabajador }));

    return {
      id: lote.id, generadoPor: lote.generado_por, generadoEn: lote.generado_en,
      cantidadOperadores: lote.cantidad_operadores, estado: lote.estado, trabajadores,
    };
  },

  /**
   * Genera el próximo lote a partir de la oleada más prioritaria de
   * `planificarSecuencia` -- falla con un mensaje claro (no un error crudo
   * de constraint) si ya hay un lote activo, o si no hay ningún rack listo
   * para despachar ahora mismo.
   *
   * Por cada rack de la oleada, ANTES de crear las tareas, se abre el
   * traslado real (`migracionSlotsService.iniciar()`, el mismo "Iniciar
   * traslado" que ya usaría un operador desde el mapa) -- sin esto,
   * `planificarSecuencia` nunca vería estos racks como activos y podría
   * volver a ofrecerlos en el próximo lote.
   */
  async generarLote({ cantidadOperadores, generadoPor }) {
    const activo = await this.obtenerLoteActivo();
    if (activo) throw new Error('Ya hay una orden de ejecución activa -- cerrala antes de generar la siguiente.');

    const [movimientosPendientes, identidadLegacy, slotsActuales, inventarioRclActual, inventarioSlotting, movimientosCualquierEstado] = await Promise.all([
      migracionMovimientosService.listarPendientesParaSecuencia(),
      identidadLegacyService.listar(),
      migracionSlotsService.listar(),
      inventarioRclService.listar(),
      inventarioService.listar(),
      migracionMovimientosService.listarTodosCualquierEstado(),
    ]);

    // Racks que HOY no tienen contenido real para vaciar (pedido explícito
    // 2026-07-22: "por qué solo esas oleadas, si sé que hay racks ya
    // vacíos") -- no consumen el cupo de 3 equipos (ese cupo protege el
    // buffer físico, y un rack vacío nunca lo toca, ver
    // planificarSecuencia.js). Se calcula sobre TODOS los destinos
    // posibles (no solo los de la oleada elegida) para que
    // planificarSecuencia los pueda sumar sin límite de cupo.
    const destinosUnicos = [...new Map(movimientosPendientes.map(m => [`${m.mzPasillo}|${m.mzColumna}`, { mzPasillo: m.mzPasillo, mzColumna: m.mzColumna }])).values()];
    const contenidoDeTodosLosDestinos = contenidoActualDeRacks(destinosUnicos, identidadLegacy, inventarioRclActual);
    const destinosConContenido = new Set(contenidoDeTodosLosDestinos.map(c => `${c.mzPasillo}|${c.mzColumna}`));
    const racksSinContenido = new Set(
      destinosUnicos.map(r => `${r.mzPasillo}|${r.mzColumna}`).filter(clave => !destinosConContenido.has(clave))
    );

    const { oleadas, equiposActivosIniciales, advertencias: advertenciasSecuencia } = planificarSecuencia(
      movimientosPendientes, identidadLegacy, slotsActuales, { racksSinContenido }
    );
    const oleada = oleadas[0] ?? [];
    if (oleada.length === 0) {
      throw new Error(advertenciasSecuencia[0] ?? 'No hay ningún rack listo para despachar ahora mismo.');
    }

    // Para detectar racks que van a quedar A MEDIAS por falta de stock real
    // (pedido explícito 2026-07-22, caso real: vaciar 14 para recolectar 1,
    // en un rack cuyo plan pedía más de eso) -- ver generarLoteDespacho.js.
    const totalPlanificadoPorRack = new Map();
    for (const fila of inventarioSlotting) {
      const clave = `${fila.pasillo}|${fila.columna}`;
      totalPlanificadoPorRack.set(clave, (totalPlanificadoPorRack.get(clave) ?? 0) + 1);
    }
    const totalConMovimientoPorRack = new Map();
    for (const m of movimientosCualquierEstado) {
      const clave = `${m.mzPasillo}|${m.mzColumna}`;
      totalConMovimientoPorRack.set(clave, (totalConMovimientoPorRack.get(clave) ?? 0) + 1);
    }

    const contenidoActual = contenidoActualDeRacks(oleada, identidadLegacy, inventarioRclActual);
    const { trabajadores, advertencias: advertenciasReparto } = generarLoteDespacho(
      oleada, contenidoActual, movimientosPendientes, cantidadOperadores,
      { totalPlanificadoPorRack, totalConMovimientoPorRack }
    );
    if (trabajadores.length === 0) {
      throw new Error(advertenciasReparto[0] ?? advertenciasSecuencia[0] ?? 'No se pudo generar ninguna tarea para esta oleada.');
    }
    // Transparencia sobre POR QUÉ la oleada trajo estos racks y no más --
    // pedido explícito (2026-07-22, sesión de pruebas antes del jueves):
    // sin esto, "solo 2 de 6 operadores recibieron tarea" no se distinguía
    // entre "cupo de equipos concurrentes lleno" (capacidadMax, atado a
    // capacidad física de carritos) y "el rack no tenía tarea real" -- son
    // causas distintas y requieren decisiones distintas del usuario.
    const advertencias = [
      ...advertenciasSecuencia,
      `Esta oleada trae ${oleada.length} rack(s) (con ${equiposActivosIniciales} equipo(s) ya activos antes de generar esta orden, cupo de equipos concurrentes de planificarSecuencia).`,
      ...advertenciasReparto,
    ];

    // Abre el traslado real de cada rack de la oleada -- mismo llamado que
    // "Iniciar traslado" en el mapa. Si el cupo real cambió entre el
    // momento en que planificarSecuencia leyó el estado y este instante
    // (alguien más inició un traslado mientras tanto), el trigger de la
    // base puede devolver 'esperando_aprobacion' en vez de 'vaciando' --
    // se acepta igual, el rack queda esperando aprobación como cualquier
    // otro, no se aborta la generación del lote por esto.
    for (const rack of oleada) {
      await migracionSlotsService.iniciar({ mzPasillo: rack.mzPasillo, mzColumna: rack.mzColumna, usuarioId: generadoPor });
    }

    const { data: loteInsertado, error: errorLote } = await supabase
      .from('despacho_lotes')
      .insert({ generado_por: generadoPor, cantidad_operadores: cantidadOperadores })
      .select('id')
      .single();
    if (errorLote) throw errorLote;

    const filasTareas = trabajadores.flatMap(t => t.tareas.map(tarea => ({
      lote_id: loteInsertado.id,
      trabajador_numero: t.numero,
      orden: tarea.orden,
      tipo: tarea.tipo,
      mz_pasillo: tarea.mzPasillo,
      mz_columna: tarea.mzColumna,
      movimiento_id: tarea.tipo === 'recolectar' ? tarea.movimientoId : null,
      articulo: tarea.articulo,
      rcl_codigo: tarea.rclCodigo,
      rcl_nivel: tarea.rclNivel,
      cantidad: tarea.tipo === 'vaciar' ? tarea.cantidad : null,
    })));

    const { error: errorTareas } = await supabase.from('despacho_tareas').insert(filasTareas);
    if (errorTareas) throw errorTareas;

    return { loteId: loteInsertado.id, cantidadTrabajadores: trabajadores.length, advertencias };
  },

  /**
   * Confirma UNA tarea puntual -- el RPC sincroniza migracion_slots /
   * migracion_buffer / migracion_movimientos según corresponda, en una
   * sola transacción (ver SQL). Después, best-effort y fuera de esa
   * transacción, se reutiliza `migracionBufferService.revincularConPlan()`
   * (la MISMA función que ya usa el resto de la app) para intentar resolver
   * el destino de cualquier artículo recién depositado -- no se reimplementa
   * esa lógica de desambiguación acá.
   */
  async confirmarTarea(tareaId) {
    const { error } = await supabase.rpc('confirmar_tarea_despacho', { p_tarea_id: tareaId });
    if (error) throw error;
    await migracionBufferService.revincularConPlan();
  },

  /** Solo Supervisor/Administrador -- una tarea puntual resultó imposible en la práctica. No toca ninguna tabla migracion_*. */
  async cancelarTarea(tareaId) {
    const { error } = await supabase.rpc('cancelar_tarea_despacho', { p_tarea_id: tareaId });
    if (error) throw error;
  },

  /** Solo Supervisor/Administrador -- descarta el lote completo (ej. se generó con la cantidad de operadores equivocada). Lo ya confirmado de verdad no se toca, solo lo pendiente. */
  async cancelarLote(loteId) {
    const { error } = await supabase.rpc('cancelar_lote_despacho', { p_lote_id: loteId });
    if (error) throw error;
  },

  /** El paso de auditoría final del cabecilla de equipo -- falla con el motivo exacto si queda alguna tarea sin resolver. */
  async cerrarLote(loteId) {
    const { error } = await supabase.rpc('cerrar_lote_despacho', { p_lote_id: loteId });
    if (error) throw error;
  },

  /**
   * Deshace el lote ENTERO -- a diferencia de `cancelarLote` (que solo
   * cancela lo pendiente), esto revierte lo que ya se confirmó de verdad
   * (migracion_movimientos vuelve a pendiente, se borra lo depositado en
   * migracion_buffer, se borra el migracion_slots creado) y borra el lote
   * completo, como si nunca hubiera existido. Pensado para limpiar lotes
   * de PRUEBA -- solo Supervisor/Administrador.
   */
  async deshacerLote(loteId) {
    const { error } = await supabase.rpc('deshacer_lote_despacho', { p_lote_id: loteId });
    if (error) throw error;
  },

  /** Lotes ya cerrados, más recientes primero -- trazabilidad. */
  async listarHistorial() {
    const { data, error } = await supabase
      .from('despacho_lotes')
      .select('id, generado_por, generado_en, cantidad_operadores, estado, cerrado_por, cerrado_en')
      .eq('estado', 'cerrado')
      .order('generado_en', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data.map(l => ({
      id: l.id, generadoPor: l.generado_por, generadoEn: l.generado_en,
      cantidadOperadores: l.cantidad_operadores, estado: l.estado,
      cerradoPor: l.cerrado_por, cerradoEn: l.cerrado_en,
    }));
  },
};
