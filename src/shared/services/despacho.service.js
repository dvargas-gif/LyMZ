import { supabase } from './supabaseClient.js';
import { migracionMovimientosService } from './migracionMovimientos.service.js';
import { migracionSlotsService } from './migracionSlots.service.js';
import { migracionBufferService } from './migracionBuffer.service.js';
import { identidadLegacyService } from './identidadLegacy.service.js';
import { inventarioRclService } from './inventarioRcl.service.js';
import { planificarSecuencia } from '../../features/migracion/planificarSecuencia.js';
import { generarLoteDespacho, contenidoActualDeRacks, seleccionarRacksCompletos } from '../../features/despacho/generarLoteDespacho.js';

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

    const [movimientosPendientes, identidadLegacy, slotsActuales, inventarioRclActual, movimientosCualquierEstado, bufferActual] = await Promise.all([
      migracionMovimientosService.listarPendientesParaSecuencia(),
      identidadLegacyService.listar(),
      migracionSlotsService.listar(),
      inventarioRclService.listar(),
      migracionMovimientosService.listarTodosCualquierEstado(),
      migracionBufferService.listarTodo(),
    ]);

    // Racks que HOY no tienen contenido real para vaciar (pedido explícito
    // 2026-07-22: "por qué solo esas oleadas, si sé que hay racks ya
    // vacíos") -- no consumen el cupo de 3 equipos (ese cupo protege el
    // buffer físico, y un rack vacío nunca lo toca, ver
    // planificarSecuencia.js). Se calcula sobre TODOS los destinos
    // posibles (no solo los de la oleada elegida) para que
    // planificarSecuencia los pueda sumar sin límite de cupo.
    const destinosUnicos = [...new Map(movimientosPendientes.map(m => [`${m.mzPasillo}|${m.mzColumna}`, { mzPasillo: m.mzPasillo, mzColumna: m.mzColumna }])).values()];
    // Sin filtrar por destino real a propósito -- esto solo mide "¿tiene
    // contenido físico real este rack?" para el cupo de equipos, nada que
    // ver con si ESE contenido tiene a dónde ir (eso se filtra más abajo,
    // donde sí importa: al armar las tareas reales de la oleada elegida).
    const { contenido: contenidoDeTodosLosDestinos } = contenidoActualDeRacks(destinosUnicos, identidadLegacy, inventarioRclActual);
    const destinosConContenido = new Set(contenidoDeTodosLosDestinos.map(c => `${c.mzPasillo}|${c.mzColumna}`));
    const racksSinContenido = new Set(
      destinosUnicos.map(r => `${r.mzPasillo}|${r.mzColumna}`).filter(clave => !destinosConContenido.has(clave))
    );

    const { oleadas, equiposActivosIniciales, advertencias: advertenciasSecuencia } = planificarSecuencia(
      movimientosPendientes, identidadLegacy, slotsActuales, { racksSinContenido }
    );
    const oleadaCandidata = oleadas[0] ?? [];
    if (oleadaCandidata.length === 0) {
      throw new Error(advertenciasSecuencia[0] ?? 'No hay ningún rack listo para despachar ahora mismo.');
    }

    // Para detectar racks que van a quedar A MEDIAS por falta de stock real
    // (pedido explícito 2026-07-22, caso real: vaciar 14 para recolectar 1,
    // en un rack cuyo plan pedía más de eso) -- ver generarLoteDespacho.js.
    //
    // CORRECCIÓN 2026-08-28 (encontrado antes de la primera prueba en vivo
    // del motor nuevo, David: "no quiero llegar a la prueba y que sea un
    // desastre"): `totalPlanificadoPorRack` ya NO puede salir de
    // `inventario_slotting` -- esa tabla tiene el destino FIJO viejo, y el
    // motor de optimización (generarMovimientosOptimizado.js) elige un
    // destino DISTINTO según volumen/densidad. Comparar "cuántos decía el
    // plan viejo" contra "cuántos generó el motor nuevo" para el MISMO
    // rack compara dos cosas sin relación -- podía marcar como "a medias"
    // (e incompleto, fuera de la oleada) un rack que en realidad el motor
    // nuevo dejó 100% completo. Se calcula ahora del mismo lugar que
    // `totalConMovimientoPorRack` (todo movimiento alguna vez generado,
    // cualquier estado) -- con el motor nuevo, que ya excluye sin-stock
    // ANTES de elegir destino (no después, como el viejo), estos dos
    // números son siempre iguales por diseño: ya no existe la brecha
    // "planeado pero sin stock real todavía" que este chequeo detectaba
    // originalmente, así que el chequeo queda inofensivo en vez de dar
    // falsos positivos.
    const totalPlanificadoPorRack = new Map();
    for (const m of movimientosCualquierEstado) {
      const clave = `${m.mzPasillo}|${m.mzColumna}`;
      totalPlanificadoPorRack.set(clave, (totalPlanificadoPorRack.get(clave) ?? 0) + 1);
    }
    const totalConMovimientoPorRack = new Map();
    for (const m of movimientosCualquierEstado) {
      const clave = `${m.mzPasillo}|${m.mzColumna}`;
      totalConMovimientoPorRack.set(clave, (totalConMovimientoPorRack.get(clave) ?? 0) + 1);
    }

    // 2026-08-29, pedido explícito de David (segundo día de prueba en vivo,
    // "el motor está fallando... las acciones serán el apoyo de lo generado
    // humanamente"): con equipos moviendo artículos LIBREMENTE por el mapa,
    // "vaciar" (mandar a alguien a sacar algo puntual de un RCL) ya no tiene
    // sentido para lo COMPLEJO -- eso ya lo hace la gente por su cuenta.
    // "Recolectar" en esos casos ya no significa "andá a buscarlo", significa
    // "cerrá el trámite de esto que alguien YA depositó en el carrito".
    //
    // MISMO DÍA, aclaración explícita: "los movimientos que sean fáciles...
    // se migran de manera inteligente porque esos artículos ya tienen un
    // lugar... se debe generar todo" -- un rack "fácil" (ver
    // clasificarDificultad en planificarSecuencia.js: 1 origen que alimenta
    // a lo sumo 1 destino, un solo nivel de contenido -- SIN ambigüedad
    // real) sigue yendo de punta a punta automatizado, como siempre: vaciar
    // Y recolectar, ambos generados directo, sin depender de que alguien lo
    // deposite antes a mano. El gate nuevo (depósito real primero) es SOLO
    // para "normal"/"difícil" -- ahí sí puede haber más de una fuente
    // alimentando el mismo destino, y ahí es donde el criterio humano
    // importa más que dejarlo 100% a la máquina.
    const clavesRacksFaciles = new Set(oleadaCandidata.filter(r => r.dificultad === 'facil').map(r => `${r.mzPasillo}|${r.mzColumna}`));
    const racksFaciles = oleadaCandidata.filter(r => clavesRacksFaciles.has(`${r.mzPasillo}|${r.mzColumna}`));
    const articulosConDestinoReal = new Set(movimientosCualquierEstado.map(m => m.articulo));
    const { contenido: contenidoFaciles, sinDestino: sinDestinoFaciles } = contenidoActualDeRacks(racksFaciles, identidadLegacy, inventarioRclActual, articulosConDestinoReal);

    const movimientoIdsDepositados = new Set(bufferActual.filter(b => b.movimientoId != null).map(b => b.movimientoId));
    const clavesOleadaCandidata = new Set(oleadaCandidata.map(r => `${r.mzPasillo}|${r.mzColumna}`));
    const movimientosListosParaRecolectar = [];
    const sinResolverPorRack = new Map();
    for (const a of sinDestinoFaciles) {
      const clave = `${a.mzPasillo}|${a.mzColumna}`;
      sinResolverPorRack.set(clave, (sinResolverPorRack.get(clave) ?? 0) + 1);
    }
    for (const m of movimientosPendientes) {
      const clave = `${m.mzPasillo}|${m.mzColumna}`;
      if (!clavesOleadaCandidata.has(clave)) continue;
      if (clavesRacksFaciles.has(clave)) {
        // Fácil -- automatización completa, no hace falta depósito previo.
        movimientosListosParaRecolectar.push(m);
      } else if (movimientoIdsDepositados.has(m.id)) {
        movimientosListosParaRecolectar.push(m);
      } else {
        sinResolverPorRack.set(clave, (sinResolverPorRack.get(clave) ?? 0) + 1);
      }
    }

    // Recorte de la oleada -- nunca mezcla un rack que va a quedar a medias
    // con uno que sí cierra del todo (esa garantía NO se toca). El TOPE de
    // cuántos racks completos entran sí cambió 2026-08-28 (pedido explícito
    // de David, primer día de prueba real: "no quiero trabajos a medias...
    // dimensiona qué es un trabajo... estarán un aproximado de 6 horas y tú
    // les das una acción por generación") -- el tope fijo de "2-3 racks"
    // (2026-07-25) daba oleadas demasiado chicas para un turno real: con
    // pocos racks candidatos, algunos operadores terminaban con 1 sola
    // tarea. Ahora escala con la cantidad de operadores de ESTA oleada --
    // suficientes racks completos como para que cada uno tenga trabajo real
    // para su turno, no una sola línea. Sigue acotado (nunca ilimitado) para
    // no perder la costumbre de recalcular seguido.
    const limiteRacks = Math.max(3, cantidadOperadores * 3);
    const { seleccionados: oleada, diferidosPorCupo, incompletos } = seleccionarRacksCompletos(
      oleadaCandidata, sinResolverPorRack, totalPlanificadoPorRack, totalConMovimientoPorRack, limiteRacks
    );
    if (oleada.length === 0) {
      const detalleIncompletos = incompletos
        .map(r => `${r.mzPasillo}-C${String(r.mzColumna).padStart(3, '0')} (faltan ${r.faltanRecolectar} por recolectar, ${r.faltanVaciar} sin resolver)`)
        .join('; ');
      throw new Error(`Ningún rack de los candidatos de hoy cierra completo -- ${incompletos.length} quedarían a medias: ${detalleIncompletos}. Falta que alguien deposite el resto en el carrito (racks complejos), resuelva destinos (racks fáciles), o recalculá el plan.`);
    }

    // Contenido de vaciado SOLO para los racks "fácil" de esta oleada final
    // (ver el comentario de más arriba) -- los "normal"/"difícil" nunca
    // generan tarea "vaciar".
    const clavesOleada = new Set(oleada.map(r => `${r.mzPasillo}|${r.mzColumna}`));
    const contenidoParaVaciar = contenidoFaciles.filter(c => clavesOleada.has(`${c.mzPasillo}|${c.mzColumna}`));

    const { trabajadores, advertencias: advertenciasReparto } = generarLoteDespacho(
      oleada, contenidoParaVaciar, movimientosListosParaRecolectar, cantidadOperadores,
      { totalPlanificadoPorRack, totalConMovimientoPorRack }
    );
    if (trabajadores.length === 0) {
      throw new Error(advertenciasReparto[0] ?? advertenciasSecuencia[0] ?? 'No se pudo generar ninguna tarea para esta oleada.');
    }
    if (diferidosPorCupo.length > 0) {
      advertenciasSecuencia.unshift(`${diferidosPorCupo.length} rack(s) más también cerrarían completos, pero quedan para la próxima oleada (tope de ${limiteRacks} racks completos para ${cantidadOperadores} operador(es)): ${diferidosPorCupo.map(r => `${r.mzPasillo}-C${String(r.mzColumna).padStart(3, '0')}`).join(', ')}.`);
    }
    if (incompletos.length > 0) {
      const detalle = incompletos.map(r => `${r.mzPasillo}-C${String(r.mzColumna).padStart(3, '0')} (${r.faltanRecolectar > 0 ? `${r.faltanRecolectar} sin stock real` : ''}${r.faltanRecolectar > 0 && r.faltanVaciar > 0 ? ', ' : ''}${r.faltanVaciar > 0 ? `${r.faltanVaciar} sin resolver` : ''})`).join('; ');
      advertenciasSecuencia.unshift(`⚠ ${incompletos.length} rack(s) candidatos NO entraron en esta oleada porque quedarían a medias: ${detalle}. No se resuelven solos -- necesitan que alguien deposite el resto en el carrito (complejos), resuelva destinos (fáciles), o recalcular el plan.`);
    }
    // Transparencia sobre POR QUÉ la oleada trajo estos racks y no más --
    // pedido explícito (2026-07-22, sesión de pruebas antes del jueves):
    // sin esto, "solo 2 de 6 operadores recibieron tarea" no se distinguía
    // entre "cupo de equipos concurrentes lleno" (capacidadMax, atado a
    // capacidad física de carritos) y "el rack no tenía tarea real" -- son
    // causas distintas y requieren decisiones distintas del usuario.
    // Dificultad de la oleada elegida -- pedido explícito 2026-08-20 (ADR-021):
    // "que se sepa de antemano". `oleada[i].dificultad` ya viene calculado por
    // planificarSecuencia (facil/normal/dificil, ver UMBRAL_DIFICULTAD) --
    // acá solo se resume, nunca se recalcula.
    const conteoPorDificultad = oleada.reduce((acc, r) => { acc[r.dificultad] = (acc[r.dificultad] ?? 0) + 1; return acc; }, {});
    const resumenDificultad = ['dificil', 'normal', 'facil']
      .filter(d => conteoPorDificultad[d] > 0)
      .map(d => `${conteoPorDificultad[d]} ${d}`)
      .join(', ');

    const advertencias = [
      ...advertenciasSecuencia,
      `Esta oleada trae ${oleada.length} rack(s) (con ${equiposActivosIniciales} equipo(s) ya activos antes de generar esta orden, cupo de equipos concurrentes de planificarSecuencia).`,
      `Dificultad de los racks de esta oleada: ${resumenDificultad}.`,
      ...advertenciasReparto,
    ];

    // Abre el traslado real de cada rack de la oleada -- mismo llamado que
    // "Iniciar traslado" en el mapa. Si el cupo real cambió entre el
    // momento en que planificarSecuencia leyó el estado y este instante
    // (alguien más inició un traslado mientras tanto), el trigger de la
    // base puede devolver 'esperando_aprobacion' en vez de 'vaciando' --
    // se acepta igual, el rack queda esperando aprobación como cualquier
    // otro, no se aborta la generación del lote por esto.
    //
    // Si el trigger RECHAZA un insert a mitad de este loop (cupo real lleno
    // -- ej. dos personas generando una orden casi al mismo tiempo, cada
    // una con su propia foto de "cupo disponible" ya desactualizada apenas
    // la otra inserta la suya), los racks de las vueltas ANTERIORES de este
    // mismo loop ya quedaron insertados de verdad en migracion_slots, sin
    // ningún despacho_lote que los reclame (ese insert recién pasa más
    // abajo) -- huérfanos, invisibles salvo por el diagnóstico manual de
    // "racks activos" en PanelDespacho.jsx. Bug real reportado 2026-07-23:
    // "sigo generando y borrando, necesito que esto no pase". Ahora, si
    // falla cualquier rack de esta tanda, se deshace (mismo camino que
    // "Eliminar" en PanelDespacho.jsx: libera el buffer, borra el slot) todo
    // lo que esta MISMA llamada alcanzó a insertar antes de re-lanzar el
    // error -- un intento fallido de generar no deja rastro.
    const iniciados = [];
    try {
      for (const rack of oleada) {
        const { id, estado } = await migracionSlotsService.iniciar({ mzPasillo: rack.mzPasillo, mzColumna: rack.mzColumna, usuarioId: generadoPor });
        iniciados.push(id);
        // 2026-08-29: los racks "normal"/"difícil" de esta oleada ya no
        // traen tareas "vaciar" (ver arriba) -- el slot no tiene nada que
        // esperar en "vaciando", pasa derecho a "recolectando" (mismo evento
        // real que ya dispara "Marcar vaciado completo" en el flujo guiado
        // del mapa). Los "fácil" SÍ siguen trayendo tareas "vaciar" reales
        // -- esos slots se quedan en "vaciando" como siempre, esperando que
        // se confirmen. Si el trigger de cupo devolvió 'esperando_aprobacion'
        // en vez de 'vaciando', se deja tal cual -- todavía no hay nada que "completar".
        const esFacil = clavesRacksFaciles.has(`${rack.mzPasillo}|${rack.mzColumna}`);
        if (!esFacil && estado === 'vaciando') await migracionSlotsService.marcarVaciadoCompleto(id);
      }
    } catch (err) {
      await Promise.allSettled(iniciados.map(async id => {
        await migracionBufferService.eliminarPorSlot(id);
        await migracionSlotsService.cancelar(id);
      }));
      throw err;
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

  /**
   * TODAS las tareas alguna vez creadas (cualquier lote, cualquier estado) --
   * a diferencia de `obtenerLoteActivo()` (solo el lote activo), esto
   * alimenta métricas de productividad histórica (Dashboard). Pagina de a
   * 1000 (mismo criterio que `usuariosService.listar()`) porque un solo
   * `select()` se corta ahí.
   */
  async listarTodasLasTareas() {
    const TAMANO_PAGINA = 1000;
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('despacho_tareas')
        .select('id, lote_id, trabajador_numero, tipo, cantidad, estado, resuelto_por, resuelto_en')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas.map(t => ({
      id: t.id, loteId: t.lote_id, trabajadorNumero: t.trabajador_numero, tipo: t.tipo,
      cantidad: t.cantidad, estado: t.estado, resueltoPor: t.resuelto_por, resueltoEn: t.resuelto_en,
    }));
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
