import { supabase } from './supabaseClient.js';

/**
 * Registro de reconciliación "ya migrado" (2026-08-25, pedido explícito de
 * David: "convertir esa información MZ en una tabla diferente" en vez de
 * mezclarla con `migracion_movimientos`) -- cada fila del import de
 * Inventario RCL cuya ubicación vino en formato MZ (ver
 * inventarioRcl.service.js/resolverEstadoYaMigrado) queda acá como
 * trazabilidad histórica de lo detectado, independiente de qué acción se
 * haya tomado (o no) sobre `migracion_movimientos`. Tabla append-only --
 * nunca se actualiza ni se borra, cada import deja su propia foto.
 *
 * IMPORTANTE: esta tabla es puramente informativa/auditoría. Nada del motor
 * de migración ni de Despacho la lee -- no gatea ni condiciona "mover a
 * voluntad" (mapa) ni ninguna otra funcionalidad, a propósito.
 */
export const migracionYaMigradoService = {
  /**
   * `filas` = salida de resolverEstadoYaMigrado() ya con `accionTomada`
   * agregado por el llamador (ver PanelImportInventarioRcl.jsx) -- esta
   * función no decide acciones, solo persiste lo que ya se decidió.
   */
  async registrarLote(filas, usuarioId) {
    if (filas.length === 0) return;
    const ahora = new Date().toISOString();
    const filasDb = filas.map(f => ({
      mz_pasillo: f.mzPasillo, mz_columna: f.mzColumna, mz_nivel: f.mzNivel, mz_subnivel: f.mzSubnivel,
      articulo: f.articulo, cantidad_detectada: f.cantidadDetectada ?? 0,
      movimiento_id: f.movimientoId ?? null, veredicto: f.veredicto, accion_tomada: f.accionTomada,
      detectado_por: usuarioId, detectado_en: ahora,
    }));
    const { error } = await supabase.from('migracion_ya_migrado').insert(filasDb);
    if (error) throw error;
  },
};
