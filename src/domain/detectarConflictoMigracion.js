/**
 * Pedido explícito 2026-08-20: alguien puede mover un artículo a mano en el
 * mapa real (fuera del flujo guiado de migración) mientras ese MISMO
 * artículo ya tiene un `migracion_movimiento` pendiente hacia otro rack --
 * sin detectarlo, ese movimiento queda huérfano y el motor de Despacho lo
 * sigue ofreciendo como tarea real a un trabajador de piso (reproceso).
 *
 * Función pura: no decide qué hacer con el conflicto, solo lo encuentra.
 * @param {string[]} articulos -- los artículos que se están moviendo a mano
 * @param {Array<{id, articulo}>} movimientosPendientes -- resultado de migracionMovimientosService.buscarPendientesPorArticulos()
 * @returns {Array} los movimientos pendientes que coinciden con alguno de esos artículos
 */
export function detectarConflictoMigracion(articulos, movimientosPendientes) {
  const enMovimiento = new Set(articulos);
  return movimientosPendientes.filter(m => enMovimiento.has(m.articulo));
}
