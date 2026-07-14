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

/** Auto-resolución del destino por código de artículo (no por ubicación de origen, ver DECISIONES.md) -- migracion_movimientos está vacía hasta que se importe el cruce manual (F1.5), así que hoy siempre da null -- caso excepción esperado, no un bug. */
async function resolverMovimiento(articulo) {
  const { data, error } = await supabase
    .from('migracion_movimientos')
    .select('id')
    .eq('articulo', articulo).eq('estado', 'pendiente')
    .limit(1).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Buffer temporal de artículos en tránsito durante un traslado (`migracion_buffer`, F1/F2). */
export const migracionBufferService = {
  /** Solo la lista de códigos de artículo con una fila sin purgar en el buffer -- lo consume crearWarehouseModel.js para excluirlos de su rack en TODA la app (ver resolverPosicionesActuales). */
  async listarArticulosSinResolver() {
    const { data, error } = await supabase.from('migracion_buffer').select('articulo').eq('purgado', false);
    if (error) throw error;
    return [...new Set(data.map(d => d.articulo))];
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

  /** Paso 1: deposita UN artículo en el buffer -- resuelve destino y snapshot de RCL antes de insertar. */
  async depositar({ mzPasillo, mzColumna, slotId, articulo, cantidad, origenNivel, operadorId }) {
    const [origenRclCodigo, movimientoId] = await Promise.all([
      resolverOrigenRcl(mzPasillo, mzColumna, origenNivel),
      resolverMovimiento(articulo),
    ]);
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
