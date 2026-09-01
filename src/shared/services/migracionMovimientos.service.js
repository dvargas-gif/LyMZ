import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000;

/** Columnas de una fila de migracion_movimientos que hacen falta para poder reconstruirla más tarde (respaldo/deshacer) -- sin id/estado, esas se recalculan al reinsertar. */
const COLUMNAS_RESPALDABLES = 'mz_pasillo, mz_columna, mz_nivel, rcl_codigo, rcl_nivel, articulo, cantidad, orden, importado_por, importado_en';

/**
 * Trae TODAS las filas de una consulta, paginando de a `TAMANO_PAGINA` --
 * un solo `select()` se corta en 1000 filas (límite de PostgREST) SIN
 * error visible. Bug real identificado 2026-08-10 (`migracionMovimientos.service.js`
 * sin paginar, alimentando `despacho.service.js`) y confirmado sin corregir
 * en una auditoría 2026-08-20 -- corregido acá de una sola vez para las 4
 * lecturas de este archivo que le faltaba.
 * @param {(desde: number, hasta: number) => PromiseLike<{data, error}>} construirQuery
 */
async function seleccionarPaginado(construirQuery) {
  const todos = [];
  let desde = 0;
  while (true) {
    const { data, error } = await construirQuery(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    todos.push(...data);
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return todos;
}

/** Copia el plan PENDIENTE actual a migracion_movimientos_respaldo, reemplazando lo que hubiera de una aplicación anterior -- un solo nivel de deshacer, se llama SIEMPRE antes de tocar el pendiente real (ver reemplazarPendientes). */
async function respaldarPendienteActual() {
  const actuales = await seleccionarPaginado((desde, hasta) =>
    supabase.from('migracion_movimientos').select(COLUMNAS_RESPALDABLES).eq('estado', 'pendiente').range(desde, hasta));

  const { error: errorLimpieza } = await supabase.from('migracion_movimientos_respaldo').delete().gte('id', 0);
  if (errorLimpieza) throw errorLimpieza;
  if (actuales.length === 0) return;

  for (let i = 0; i < actuales.length; i += TAMANO_PAGINA) {
    const { error } = await supabase.from('migracion_movimientos_respaldo').insert(actuales.slice(i, i + TAMANO_PAGINA));
    if (error) throw error;
  }
}

/**
 * Plan de recolección por destino MZ (`migracion_movimientos`, F1.5-C) --
 * generado desde `inventario_slotting` + `inventario_rcl_actual` (ver
 * generarMovimientos.js), nunca subido a mano. RLS: insertar/reemplazar es
 * Supervisor/Administrador; marcar recolectado es cualquier rol operativo
 * (ver supabase/sql/2026-07-13_migracion_rcl_mz_rls.sql).
 */
export const migracionMovimientosService = {
  /**
   * id -> destino MZ, para TODOS los movimientos pendientes -- liviano (sin
   * cantidad/orden/estado), pensado para que MapaCanvas.jsx resuelva el
   * destino real de cada artículo del buffer (via migracion_buffer.movimiento_id)
   * sin otro round-trip por destino. Incluye `articulo` (2026-08-24, pedido
   * explícito: mostrar destino planeado al iniciar un movimiento individual
   * desde Vista RCL) para poder resolver también por artículo, no solo por id.
   */
  async listarTodos() {
    const data = await seleccionarPaginado((desde, hasta) =>
      supabase.from('migracion_movimientos').select('id, mz_pasillo, mz_columna, mz_nivel, articulo').eq('estado', 'pendiente').range(desde, hasta));
    return data.map(d => ({ id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, mzNivel: d.mz_nivel, articulo: d.articulo }));
  },

  /**
   * Destino MZ de TODOS los movimientos alguna vez generados, sin filtrar
   * por estado -- a diferencia de `listarTodos()` (pendiente) o
   * `listarPendientesParaSecuencia()`. Un `migracion_movimiento` solo existe
   * si tuvo stock real al momento de "Calcular plan" (ver
   * generarMovimientos.js/sinStock) -- así que contar estas filas por rack
   * y compararlo contra el total planificado en `inventario_slotting` para
   * ese mismo rack dice cuántos de sus artículos NUNCA llegaron a tener un
   * movimiento real (sin stock hoy, van a quedar faltantes hasta que se
   * recalcule el plan con stock nuevo). Pensado para
   * despacho.service.js/generarLoteDespacho.js -- pedido explícito 2026-07-22
   * tras un caso real (vaciar 14 para recolectar 1 en un rack cuyo plan SÍ
   * tenía más artículos, solo que sin stock). Incluye `articulo` (2026-08-25,
   * pedido explícito de David tras el incidente real de esta semana: "no
   * quiero que me deje mercadería") -- despacho.service.js lo usa para
   * armar el set de artículos que alguna vez tuvieron un destino real
   * calculado, y así `contenidoActualDeRacks()` nunca genere una tarea
   * "vaciar" para un artículo que no tiene a dónde ir.
   */
  async listarTodosCualquierEstado() {
    const data = await seleccionarPaginado((desde, hasta) =>
      supabase.from('migracion_movimientos').select('mz_pasillo, mz_columna, articulo').range(desde, hasta));
    return data.map(d => ({ mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, articulo: d.articulo }));
  },

  /** Plan completo con TODAS las columnas que hacen falta para una hoja de referencia legible fuera de la app (ver "Exportar plan completo" en PanelMigracion.jsx) -- a diferencia de listarTodosCualquierEstado(), acá sí hace falta nivel/origen/cantidad/estado. */
  async listarPlanCompleto() {
    const data = await seleccionarPaginado((desde, hasta) =>
      supabase.from('migracion_movimientos').select('articulo, mz_pasillo, mz_columna, mz_nivel, rcl_codigo, rcl_nivel, cantidad, estado').range(desde, hasta));
    return data.map(d => ({
      articulo: d.articulo, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, mzNivel: d.mz_nivel,
      rclCodigo: d.rcl_codigo, rclNivel: d.rcl_nivel, cantidad: d.cantidad, estado: d.estado,
    }));
  },

  /** TODOS los movimientos pendientes, con su origen RCL -- lo que necesita planificarSecuencia.js para armar el grafo de dependencias entre racks (a diferencia de listarTodos(), acá sí hace falta rcl_codigo/rcl_nivel). */
  async listarPendientesParaSecuencia() {
    const data = await seleccionarPaginado((desde, hasta) =>
      supabase.from('migracion_movimientos').select('id, mz_pasillo, mz_columna, rcl_codigo, rcl_nivel, articulo').eq('estado', 'pendiente').range(desde, hasta));
    return data.map(d => ({ id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, rclCodigo: d.rcl_codigo, rclNivel: d.rcl_nivel, articulo: d.articulo }));
  },

  /** Lista de pick de UNA posición MZ destino, en orden de recolección. */
  async listarPorDestino(mzPasillo, mzColumna) {
    const { data, error } = await supabase
      .from('migracion_movimientos')
      .select('id, mz_nivel, rcl_codigo, rcl_nivel, articulo, cantidad, orden, estado, recolectado_por, recolectado_en')
      .eq('mz_pasillo', mzPasillo).eq('mz_columna', mzColumna)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data.map(d => ({
      id: d.id, mzNivel: d.mz_nivel, rclCodigo: d.rcl_codigo, rclNivel: d.rcl_nivel,
      articulo: d.articulo, cantidad: d.cantidad, orden: d.orden, estado: d.estado,
      recolectadoPor: d.recolectado_por, recolectadoEn: d.recolectado_en,
    }));
  },

  /**
   * Reemplaza el plan PENDIENTE (borra las filas en estado 'pendiente' y
   * vuelve a insertar las recién generadas) -- nunca toca una fila ya
   * 'recolectado' (sería perder progreso real de un operador). Se puede
   * correr de nuevo cuando se reimporte un inventario RCL más fresco.
   *
   * Tampoco borra una fila 'pendiente' si `despacho_tareas` o
   * `migracion_buffer` todavía la referencian (2026-08-25, ver el
   * comentario dentro de la función) -- sin este filtro, el DELETE choca
   * contra el FK (sin ON DELETE CASCADE, a propósito) apenas exista una
   * tarea de Despacho o un artículo en el buffer esperando ese destino.
   *
   * ANTES de borrar nada, respalda el pendiente actual en
   * `migracion_movimientos_respaldo` (reemplaza lo que hubiera ahí de una
   * aplicación anterior -- un solo nivel de deshacer, no un historial
   * completo) -- pedido explícito del usuario: poder probar con datos
   * reales sin miedo a desordenar todo, ver `deshacerUltimaAplicacion`.
   *
   * `upsert` con `ignoreDuplicates` (no `insert`) -- sobre el índice único
   * parcial `migracion_movimientos_pendiente_unique` (mz_pasillo,mz_columna,
   * mz_nivel,rcl_codigo,rcl_nivel,articulo where estado='pendiente'), para
   * que un doble-click en "Aplicar" (dos llamadas en carrera) nunca pueda
   * duplicar una fila -- la segunda simplemente no inserta la que ya existe,
   * en vez de fallar o generar un duplicado silencioso.
   */
  async reemplazarPendientes(movimientos, usuarioId) {
    await respaldarPendienteActual();

    // Bug real encontrado 2026-08-25 (auditoría real, no hipotética --
    // confirmado con datos de producción): `despacho_tareas.movimiento_id`
    // y `migracion_buffer.movimiento_id` referencian esta tabla SIN
    // `ON DELETE CASCADE` (a propósito -- no queremos que recalcular el
    // plan borre en cascada trabajo físico real en curso). El DELETE de
    // abajo, sin este filtro, choca contra ese FK apenas exista una tarea
    // de Despacho o un artículo en el buffer todavía apuntando a un
    // movimiento pendiente -- confirmado que pasa hoy mismo en producción
    // (29 filas). Nunca se borra una fila "pendiente" que algo real
    // todavía referencia -- el recálculo la deja intacta (representa
    // trabajo físico ya comprometido), solo reemplaza lo que nadie usa.
    const [{ data: referenciadosPorTareas, error: errorTareas }, { data: referenciadosPorBuffer, error: errorBuffer }] = await Promise.all([
      supabase.from('despacho_tareas').select('movimiento_id').not('movimiento_id', 'is', null),
      supabase.from('migracion_buffer').select('movimiento_id').eq('purgado', false).not('movimiento_id', 'is', null),
    ]);
    if (errorTareas) throw errorTareas;
    if (errorBuffer) throw errorBuffer;
    const idsReferenciados = [...new Set([
      ...referenciadosPorTareas.map(r => r.movimiento_id),
      ...referenciadosPorBuffer.map(r => r.movimiento_id),
    ])];

    let queryBorrado = supabase.from('migracion_movimientos').delete().eq('estado', 'pendiente');
    if (idsReferenciados.length > 0) {
      queryBorrado = queryBorrado.not('id', 'in', `(${idsReferenciados.join(',')})`);
    }
    const { error: errorBorrado } = await queryBorrado;
    if (errorBorrado) throw errorBorrado;

    const ahora = new Date().toISOString();
    const filasDb = movimientos.map(m => ({
      mz_pasillo: m.mzPasillo, mz_columna: m.mzColumna, mz_nivel: m.mzNivel,
      rcl_codigo: m.rclCodigo, rcl_nivel: String(m.rclNivel),
      articulo: m.articulo, cantidad: m.cantidad, orden: m.orden,
      importado_por: usuarioId, importado_en: ahora,
    }));
    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('migracion_movimientos')
        .upsert(filasDb.slice(i, i + TAMANO_PAGINA), {
          onConflict: 'mz_pasillo,mz_columna,mz_nivel,rcl_codigo,rcl_nivel,articulo',
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }
  },

  /**
   * Estado de migración conocido para un conjunto de pares (mzPasillo, mzColumna,
   * articulo) -- usado por el import de Inventario RCL (F1.5-B) para el check
   * "ya migrado" (2026-08-25, pedido explícito de David tras ver filas rechazadas
   * cuya ubicación ya venía en formato MZ: el artículo se movió físicamente antes
   * de que el sistema generara/confirmara ese movimiento). Trae TODOS los
   * movimientos alguna vez generados para los pasillos involucrados (cualquier
   * estado) y el llamador cruza por artículo+columna -- así el import puede
   * distinguir "recolectado" (el motor ya lo tiene confirmado, coincide) de
   * "pendiente/a_revisar/descartado" (el motor lo tiene planeado pero no
   * confirmado) de "sin ningún registro" (el motor no se enteró de este
   * movimiento -- señal más fuerte de que hace falta revisión manual).
   * Incluye `id` para que el llamador pueda marcar 'recolectado' el
   * movimiento exacto que corresponde, sin adivinar cuál.
   */
  async buscarEstadoPorDestinoYArticulo(pares) {
    if (pares.length === 0) return [];
    const mzPasillos = [...new Set(pares.map(p => p.mzPasillo))];
    const data = await seleccionarPaginado((desde, hasta) =>
      supabase.from('migracion_movimientos')
        .select('id, mz_pasillo, mz_columna, articulo, estado')
        .in('mz_pasillo', mzPasillos)
        .range(desde, hasta));
    return data.map(d => ({ id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, articulo: d.articulo, estado: d.estado }));
  },

  /** Paso 2 del flujo guiado (recolectando): el operador marca UN artículo puntual como ya recolectado. */
  async marcarRecolectado(id, usuarioId) {
    const { error } = await supabase.from('migracion_movimientos')
      .update({ estado: 'recolectado', recolectado_por: usuarioId, recolectado_en: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Movimientos pendientes cuyo artículo coincide con alguno de los dados --
   * usado por el mapa real ANTES de aplicar un movimiento manual (ver
   * detectarConflictoMigracion.js/DECISIONES.md ADR-019), para avisar si ese
   * artículo ya tenía trabajo de migración planeado en otro lado. `in()` con
   * lista vacía nunca se llama (el mapa filtra antes) -- Supabase la
   * rechazaría con un error de sintaxis.
   */
  async buscarPendientesPorArticulos(articulos) {
    if (articulos.length === 0) return [];
    const { data, error } = await supabase
      .from('migracion_movimientos')
      .select('id, mz_pasillo, mz_columna, articulo')
      .eq('estado', 'pendiente')
      .in('articulo', articulos);
    if (error) throw error;
    return data.map(d => ({ id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, articulo: d.articulo }));
  },

  /**
   * Saca un movimiento pendiente de la planificación automática de Despacho
   * SIN borrarlo -- lo deja "a_revisar" (texto libre, sin CHECK en la base,
   * ver 2026-08-20_migracion_movimientos_revision.sql) hasta que un
   * Supervisor/Administrador lo resuelva. `listarPendientesParaSecuencia()`
   * ya filtra por `estado='pendiente'` -- un movimiento "a_revisar" queda
   * excluido ahí sin tocar esa función.
   */
  async marcarARevisar(id, { usuarioId, motivo }) {
    const { error } = await supabase.from('migracion_movimientos')
      .update({ estado: 'a_revisar', marcado_a_revisar_por: usuarioId, marcado_a_revisar_en: new Date().toISOString(), motivo_revision: motivo })
      .eq('id', id);
    if (error) throw error;
  },

  /** Todo lo que quedó "a_revisar" -- para el panel de Supervisor/Administrador. */
  async listarARevisar() {
    const { data, error } = await supabase
      .from('migracion_movimientos')
      .select('id, mz_pasillo, mz_columna, articulo, cantidad, marcado_a_revisar_por, marcado_a_revisar_en, motivo_revision')
      .eq('estado', 'a_revisar')
      .order('marcado_a_revisar_en', { ascending: false });
    if (error) throw error;
    return data.map(d => ({
      id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna, articulo: d.articulo, cantidad: d.cantidad,
      marcadoPor: d.marcado_a_revisar_por, marcadoEn: d.marcado_a_revisar_en, motivo: d.motivo_revision,
    }));
  },

  /**
   * Resuelve un "a_revisar" -- 'restaurar' lo vuelve a 'pendiente' (era una
   * falsa alarma, sigue haciendo falta), 'descartar' lo deja 'descartado'
   * (terminal, nunca vuelve a la planificación). Ninguna de las dos borra la
   * fila -- queda como historial de qué se decidió y quién.
   */
  async resolverRevision(id, { usuarioId, accion }) {
    const nuevoEstado = accion === 'restaurar' ? 'pendiente' : 'descartado';
    const { error } = await supabase.from('migracion_movimientos')
      .update({ estado: nuevoEstado, resuelto_por: usuarioId, resuelto_en: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** % del plan ya recolectado, para el resumen del Panel de Migración -- `count:'exact', head:true` trae solo el número, sin bajar ninguna fila (el plan puede tener miles). */
  async contarProgreso() {
    const [total, recolectados] = await Promise.all([
      supabase.from('migracion_movimientos').select('id', { count: 'exact', head: true }),
      supabase.from('migracion_movimientos').select('id', { count: 'exact', head: true }).eq('estado', 'recolectado'),
    ]);
    if (total.error) throw total.error;
    if (recolectados.error) throw recolectados.error;
    return { total: total.count ?? 0, recolectados: recolectados.count ?? 0 };
  },

  /** ¿Hay algo para deshacer? -- gatea el botón "Deshacer última aplicación" en PanelMigracion.jsx. */
  async hayRespaldoParaDeshacer() {
    const { count, error } = await supabase.from('migracion_movimientos_respaldo').select('id', { count: 'exact', head: true });
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  /**
   * Restaura el plan pendiente al estado justo ANTES de la última vez que
   * se tocó "Aplicar" -- pedido explícito del usuario ("cómo hago las
   * pruebas sin desordenar todo"). Un solo nivel: si ya deshiciste una vez,
   * no hay un "redo" ni una segunda vuelta atrás. Lo ya 'recolectado' NUNCA
   * se toca (mismo criterio que reemplazarPendientes) -- si entre la
   * aplicación y el deshacer alguien ya recolectó algo del plan que se está
   * deshaciendo, esas filas quedan como progreso real, no se pierden.
   */
  async deshacerUltimaAplicacion(usuarioId) {
    const respaldo = await seleccionarPaginado((desde, hasta) =>
      supabase.from('migracion_movimientos_respaldo').select(COLUMNAS_RESPALDABLES).range(desde, hasta));
    if (respaldo.length === 0) throw new Error('No hay ninguna aplicación para deshacer.');

    const { error: errorBorrado } = await supabase.from('migracion_movimientos').delete().eq('estado', 'pendiente');
    if (errorBorrado) throw errorBorrado;

    for (let i = 0; i < respaldo.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('migracion_movimientos')
        .upsert(respaldo.slice(i, i + TAMANO_PAGINA).map(r => ({ ...r, importado_por: r.importado_por ?? usuarioId })), {
          onConflict: 'mz_pasillo,mz_columna,mz_nivel,rcl_codigo,rcl_nivel,articulo',
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }

    const { error: errorLimpieza } = await supabase.from('migracion_movimientos_respaldo').delete().gte('id', 0);
    if (errorLimpieza) throw errorLimpieza;

    return respaldo.length;
  },

  /**
   * Reinicia la migración ENTERA a foja cero -- pedido explícito del
   * usuario ("que la borre solo cuando no hay nada aún cambiado... no
   * quiero que si a alguien se le ocurre borrarlo se pierda el trabajo").
   * A diferencia de `deshacerUltimaAplicacion` (vuelve un paso atrás en el
   * PLAN, nunca toca progreso real), esto borra TODO `migracion_movimientos`
   * -- pero solo si de verdad no hay ningún trabajo real todavía: cero
   * slots con progreso (`migracion_slots`, cualquier estado -- ni siquiera
   * 'esperando_aprobacion'), cero artículos en el buffer, cero movimientos
   * ya 'recolectado'. Se revalida acá mismo, del lado del servidor, en el
   * momento del click -- nunca confía en un chequeo hecho antes en el
   * cliente (podría estar desactualizado).
   */
  async reiniciarDesdeCeroSiEsSeguro() {
    const [slots, buffer, recolectados] = await Promise.all([
      supabase.from('migracion_slots').select('id', { count: 'exact', head: true }),
      supabase.from('migracion_buffer').select('id', { count: 'exact', head: true }),
      supabase.from('migracion_movimientos').select('id', { count: 'exact', head: true }).eq('estado', 'recolectado'),
    ]);
    if (slots.error) throw slots.error;
    if (buffer.error) throw buffer.error;
    if (recolectados.error) throw recolectados.error;

    const motivos = [];
    if ((slots.count ?? 0) > 0) motivos.push(`${slots.count} rack(s) con algún progreso`);
    if ((buffer.count ?? 0) > 0) motivos.push(`${buffer.count} artículo(s) en el carrito de traslado`);
    if ((recolectados.count ?? 0) > 0) motivos.push(`${recolectados.count} artículo(s) ya recolectado(s)`);
    if (motivos.length > 0) {
      throw new Error(`No se puede reiniciar -- ya hay trabajo real en curso: ${motivos.join(', ')}.`);
    }

    const { error: errorBorrado } = await supabase.from('migracion_movimientos').delete().gte('id', 0);
    if (errorBorrado) throw errorBorrado;
    const { error: errorRespaldo } = await supabase.from('migracion_movimientos_respaldo').delete().gte('id', 0);
    if (errorRespaldo) throw errorRespaldo;
  },
};
