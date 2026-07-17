import { supabase } from './supabaseClient.js';
import { nivelWmsANumero } from '../../features/migracion/nivelWms.js';

// Todas las sub-posiciones reales de identidad_legacy tienen subnivel=1 hoy
// (ver DECISIONES.md ADR-015/spec del cliente) -- no hay UI para elegir otro,
// se fija acá, único lugar, para no inventar un selector sin caso de uso real.
const SUBNIVEL_UNICO = 1;

/** Snapshot del RCL real de la sub-posición que se está vaciando -- null si el nivel es 'CUERPO' (sin equivalente en identidad_legacy) o si esa sub-posición no está identificada todavía. */
async function resolverOrigenRcl(mzPasillo, mzColumna, origenNivel) {
  const nivelNumerico = nivelWmsANumero(origenNivel);
  if (nivelNumerico == null) return null; // CUERPO u otro -- ver plan de F2, punto 1
  const { data, error } = await supabase
    .from('identidad_legacy')
    .select('rcl_codigo')
    .eq('mz_pasillo', mzPasillo).eq('mz_columna', mzColumna).eq('mz_nivel', nivelNumerico).eq('mz_subnivel', SUBNIVEL_UNICO)
    .maybeSingle();
  if (error) throw error;
  return data?.rcl_codigo ?? null;
}

/**
 * Auto-resolución del destino por código de artículo -- el mismo artículo
 * puede tener VARIOS movimientos pendientes a la vez (destinos distintos
 * desde orígenes RCL distintos, ver generarMovimientos.js), así que si hay
 * más de un candidato se desambigua por el origen (rcl_codigo+nivel) que ya
 * se resolvió al depositar. Si sigue ambiguo (o no hay origen con qué
 * desambiguar), nunca se adivina -- devuelve null, queda "sin destino" en
 * vez de vincular a un destino posiblemente equivocado.
 */
async function resolverMovimiento(articulo, rclCodigo, nivelNumerico) {
  let query = supabase.from('migracion_movimientos').select('id').eq('articulo', articulo).eq('estado', 'pendiente');
  if (rclCodigo != null && nivelNumerico != null) {
    query = query.eq('rcl_codigo', rclCodigo).eq('rcl_nivel', String(nivelNumerico));
  }
  const { data, error } = await query.limit(2);
  if (error) throw error;
  return data.length === 1 ? data[0].id : null;
}

/** Buffer temporal de artículos en tránsito durante un traslado (`migracion_buffer`, F1/F2). */
export const migracionBufferService = {
  /** Solo la lista de códigos de artículo con una fila sin purgar en el buffer -- lo consume crearWarehouseModel.js para excluirlos de su rack en TODA la app (ver resolverPosicionesActuales). */
  async listarArticulosSinResolver() {
    const { data, error } = await supabase.from('migracion_buffer').select('articulo').eq('purgado', false);
    if (error) throw error;
    return [...new Set(data.map(d => d.articulo))];
  },

  /**
   * Vista GLOBAL -- todo lo que hoy está en el buffer, sin filtrar por slot
   * (el usuario reportó que no podía encontrar lo que había dejado apenas
   * cambiaba de ficha). Sin join a migracion_slots por nombre de tabla
   * (evita depender de que PostgREST reconozca la relación) -- MapaCanvas.jsx
   * ya tiene el Map de slots cargado y resuelve el origen legible ahí mismo.
   */
  async listarTodo() {
    const { data, error } = await supabase
      .from('migracion_buffer')
      .select('id, slot_origen_id, articulo, cantidad, origen_nivel, origen_sub_nivel, origen_rcl_codigo, movimiento_id, operador_id, dejado_en, confirmado_en, purgado')
      .eq('purgado', false)
      .order('dejado_en', { ascending: false });
    if (error) throw error;
    return data.map(d => ({
      id: d.id, slotOrigenId: d.slot_origen_id, articulo: d.articulo, cantidad: d.cantidad,
      origenNivel: d.origen_nivel, origenSubNivel: d.origen_sub_nivel, origenRclCodigo: d.origen_rcl_codigo,
      movimientoId: d.movimiento_id, operadorId: d.operador_id, dejadoEn: d.dejado_en, confirmadoEn: d.confirmado_en,
    }));
  },

  /** Contenido actual del buffer de UN slot -- lo consume FlujoMigracionSlot.jsx para mostrar qué ya se movió, y MapaCanvas.jsx para decidir el aviso de "Cancelar traslado". */
  async listarPorSlot(slotId) {
    const { data, error } = await supabase.from('migracion_buffer').select('*').eq('slot_origen_id', slotId);
    if (error) throw error;
    return data.map(d => ({
      id: d.id, articulo: d.articulo, cantidad: d.cantidad,
      origenNivel: d.origen_nivel, origenSubNivel: d.origen_sub_nivel, origenRclCodigo: d.origen_rcl_codigo,
      movimientoId: d.movimiento_id, operadorId: d.operador_id, dejadoEn: d.dejado_en,
      confirmadoEn: d.confirmado_en, purgado: d.purgado,
    }));
  },

  /** Cancelar traslado (F2): libera TODO el buffer de un slot -- los artículos nunca tuvieron su posición real tocada, solo desaparecían de la vista mientras estaban "en tránsito" (ver resolverPosicionesActuales/enBuffer). */
  async eliminarPorSlot(slotId) {
    const { error } = await supabase.from('migracion_buffer').delete().eq('slot_origen_id', slotId);
    if (error) throw error;
  },

  /**
   * Re-vincula filas del buffer que quedaron SIN destino (movimiento_id
   * null) porque se depositaron ANTES de que existiera el plan de
   * recolección (migracion_movimientos) -- se corre después de generar o
   * regenerar el plan (ver PanelMigracion.jsx), para que el buffer
   * viejo también empiece a resolver destino real en vez de quedar
   * "Sin destino asignado" para siempre. Devuelve cuántas filas se vincularon.
   */
  async revincularConPlan() {
    const { data: sinResolver, error: e1 } = await supabase
      .from('migracion_buffer').select('id, articulo, origen_rcl_codigo, origen_nivel').eq('purgado', false).is('movimiento_id', null);
    if (e1) throw e1;
    if (sinResolver.length === 0) return 0;

    const articulos = [...new Set(sinResolver.map(r => r.articulo))];
    const { data: movimientos, error: e2 } = await supabase
      .from('migracion_movimientos').select('id, articulo, rcl_codigo, rcl_nivel').eq('estado', 'pendiente').in('articulo', articulos);
    if (e2) throw e2;

    // Agrupa por artículo -- puede haber más de un movimiento pendiente
    // para el mismo artículo (destinos distintos desde orígenes RCL
    // distintos, ver generarMovimientos.js). Si hay ambigüedad, desambigua
    // por el snapshot de origen ya congelado en la fila del buffer -- nunca
    // se queda "con el último visto" a ciegas.
    const movimientosPorArticulo = new Map();
    for (const m of movimientos) {
      if (!movimientosPorArticulo.has(m.articulo)) movimientosPorArticulo.set(m.articulo, []);
      movimientosPorArticulo.get(m.articulo).push(m);
    }

    let actualizados = 0;
    for (const fila of sinResolver) {
      const candidatos = movimientosPorArticulo.get(fila.articulo) ?? [];
      let movimientoId = null;
      if (candidatos.length === 1) {
        movimientoId = candidatos[0].id;
      } else if (candidatos.length > 1 && fila.origen_rcl_codigo) {
        const nivelNumerico = nivelWmsANumero(fila.origen_nivel);
        const exactos = candidatos.filter(m => m.rcl_codigo === fila.origen_rcl_codigo && (nivelNumerico == null || m.rcl_nivel === String(nivelNumerico)));
        if (exactos.length === 1) movimientoId = exactos[0].id;
      }
      if (!movimientoId) continue; // 0 candidatos o ambiguo -- nunca se adivina
      const { error } = await supabase.from('migracion_buffer').update({ movimiento_id: movimientoId }).eq('id', fila.id);
      if (error) throw error;
      actualizados++;
    }
    return actualizados;
  },

  /**
   * Purga filas del buffer sin destino real y sin stock real en su origen
   * (ver articulosAgotados.js.detectarBufferSinStock) -- el artículo se
   * considera "exiliado" fuera de la migración (ya no hay nada físico que
   * trasladar para él), a diferencia de "Devolver" (que asume que sí hay
   * algo físico y lo manda de vuelta a su rack). Soft-delete (`purgado`),
   * no un borrado real -- conserva el historial, igual que el resto del
   * mecanismo de purga que ya define el schema (migracion_buffer.purgado).
   */
  async purgarSinStock(ids) {
    if (ids.length === 0) return;
    const { error } = await supabase.from('migracion_buffer').update({ purgado: true, purgado_en: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
  },

  /** "Devolver" UN artículo puntual del buffer (deshace un depósito hecho por error, sin cancelar todo el traslado) -- mismo principio que eliminarPorSlot: la posición real nunca se tocó, borrar esta fila alcanza para que el artículo vuelva a verse donde estaba. */
  async eliminarUno(id) {
    const { error } = await supabase.from('migracion_buffer').delete().eq('id', id);
    if (error) throw error;
  },

  /** Paso 1: deposita UN artículo en el buffer -- resuelve el origen RCL primero (secuencial, no en paralelo: resolverMovimiento lo necesita para desambiguar si el artículo tiene más de un movimiento pendiente) y el snapshot antes de insertar. */
  async depositar({ mzPasillo, mzColumna, slotId, articulo, cantidad, origenNivel, operadorId }) {
    const origenRclCodigo = await resolverOrigenRcl(mzPasillo, mzColumna, origenNivel);
    const movimientoId = await resolverMovimiento(articulo, origenRclCodigo, nivelWmsANumero(origenNivel));
    const { error } = await supabase.from('migracion_buffer').insert({
      slot_origen_id: slotId, articulo, cantidad,
      origen_nivel: origenNivel, origen_sub_nivel: String(SUBNIVEL_UNICO), origen_rcl_codigo: origenRclCodigo,
      movimiento_id: movimientoId, operador_id: operadorId,
    });
    if (error) throw error;
  },

  /**
   * Confirmación EN LOTE cuando el slot pasa vaciando->recolectando (ver
   * DECISIONES.md ADR-015: esta orquestación es la pieza que quedó
   * explícitamente para F2). Todas las filas de este slot sin confirmar
   * quedan atadas al mismo evento de auditoría.
   */
  async confirmarLotePorSlot(slotId, loteConfirmacionId) {
    const { error } = await supabase
      .from('migracion_buffer')
      .update({ confirmado_en: new Date().toISOString(), lote_confirmacion_id: loteConfirmacionId })
      .eq('slot_origen_id', slotId)
      .is('confirmado_en', null);
    if (error) throw error;
  },
};
