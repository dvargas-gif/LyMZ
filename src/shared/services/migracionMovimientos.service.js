import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000;

/** Columnas de una fila de migracion_movimientos que hacen falta para poder reconstruirla más tarde (respaldo/deshacer) -- sin id/estado, esas se recalculan al reinsertar. */
const COLUMNAS_RESPALDABLES = 'mz_pasillo, mz_columna, mz_nivel, rcl_codigo, rcl_nivel, articulo, cantidad, orden, importado_por, importado_en';

/** Copia el plan PENDIENTE actual a migracion_movimientos_respaldo, reemplazando lo que hubiera de una aplicación anterior -- un solo nivel de deshacer, se llama SIEMPRE antes de tocar el pendiente real (ver reemplazarPendientes). */
async function respaldarPendienteActual() {
  const { data: actuales, error: errorLectura } = await supabase.from('migracion_movimientos').select(COLUMNAS_RESPALDABLES).eq('estado', 'pendiente');
  if (errorLectura) throw errorLectura;

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
  /** id -> destino MZ, para TODOS los movimientos pendientes -- liviano (sin cantidad/orden/estado), pensado para que MapaCanvas.jsx resuelva el destino real de cada artículo del buffer (via migracion_buffer.movimiento_id) sin otro round-trip por destino. */
  async listarTodos() {
    const { data, error } = await supabase.from('migracion_movimientos').select('id, mz_pasillo, mz_columna').eq('estado', 'pendiente');
    if (error) throw error;
    return data.map(d => ({ id: d.id, mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna }));
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
   * tenía más artículos, solo que sin stock).
   */
  async listarTodosCualquierEstado() {
    const { data, error } = await supabase.from('migracion_movimientos').select('mz_pasillo, mz_columna');
    if (error) throw error;
    return data.map(d => ({ mzPasillo: d.mz_pasillo, mzColumna: d.mz_columna }));
  },

  /** TODOS los movimientos pendientes, con su origen RCL -- lo que necesita planificarSecuencia.js para armar el grafo de dependencias entre racks (a diferencia de listarTodos(), acá sí hace falta rcl_codigo/rcl_nivel). */
  async listarPendientesParaSecuencia() {
    const { data, error } = await supabase
      .from('migracion_movimientos')
      .select('id, mz_pasillo, mz_columna, rcl_codigo, rcl_nivel, articulo')
      .eq('estado', 'pendiente');
    if (error) throw error;
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

    const { error: errorBorrado } = await supabase.from('migracion_movimientos').delete().eq('estado', 'pendiente');
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

  /** Paso 2 del flujo guiado (recolectando): el operador marca UN artículo puntual como ya recolectado. */
  async marcarRecolectado(id, usuarioId) {
    const { error } = await supabase.from('migracion_movimientos')
      .update({ estado: 'recolectado', recolectado_por: usuarioId, recolectado_en: new Date().toISOString() })
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
    const { data: respaldo, error: errorLectura } = await supabase.from('migracion_movimientos_respaldo').select(COLUMNAS_RESPALDABLES);
    if (errorLectura) throw errorLectura;
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
    if ((buffer.count ?? 0) > 0) motivos.push(`${buffer.count} artículo(s) en el buffer`);
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
