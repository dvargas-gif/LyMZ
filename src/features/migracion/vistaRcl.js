/**
 * Construye la "vista RCL" del canvas -- mismo grano de celdas
 * (pasillo|columna) que la vista MZ normal, pero el contenido de cada
 * nivel sale de `inventario_rcl_actual` (lo que HOY tiene esa sub-posición
 * en el sistema viejo, físicamente -- la migración RCL->MZ todavía no
 * arrancó, nada se movió). Misma forma de salida que agruparPorRack() --
 * CeldaRack/PanelDetalle la consumen sin saber que existe una segunda vista.
 *
 * Corrección de fondo (2026-08-11, auditoría real con
 * `detectarDestinosDesactualizados.js`: 3240 de 3678 artículos -- el 88% --
 * tenían el destino MZ de `identidad_legacy` desactualizado; 596 de 1182
 * sub-posiciones RCL ni siquiera pueden representarse como "un solo destino
 * MZ" porque sus artículos reales ya están repartidos en destinos distintos
 * dentro de `inventario_slotting`). `identidad_legacy` es un import de UNA
 * SOLA VEZ que quedó congelado -- el plan MZ (`inventario_slotting`) se
 * recalculó muchas veces desde entonces (motor de distribución, ediciones
 * manuales). Usarlo como destino es mostrarle al operador un rack que el
 * plan ya abandonó.
 *
 * El destino MZ de CADA artículo ahora se resuelve EN VIVO contra
 * `inventarioSlotting` (la fuente real y vigente), no contra la foto
 * congelada de `identidad_legacy` -- `identidad_legacy` solo se usa para
 * saber QUÉ artículos hay físicamente en cada posición RCL (vía
 * `inventario_rcl_actual`), nunca para decidir a dónde van.
 *
 * Un artículo sin destino real en `inventario_slotting` (no tiene ningún
 * lugar en el plan vigente) queda EXCLUIDO de esta vista -- no hay ningún
 * rack MZ real donde dibujarlo, mostrarlo en cualquier lado sería inventar
 * un destino. Ese caso ya se reporta aparte por
 * `detectarDestinosDesactualizados()` (motivo `destinoReal: null`).
 *
 * Solo las sub-posiciones con `estado_rcl === 'asignado'` participan --
 * "pendiente_asignar"/"sin_rcl" no tienen un rcl_codigo real con el cual
 * cruzar el inventario.
 *
 * @param {Array} identidadLegacy -- {rclCodigo, rclNivel, rclSubnivel, estadoRcl} (mzPasillo/mzColumna/mzNivel ya NO se usan como destino, ver arriba)
 * @param {Array} inventarioRcl -- {rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}
 * @param {Array<{articulo, pasillo, columna, nivel}>} inventarioSlotting -- el plan MZ vigente, fuente real del destino
 */
export function construirVistaRcl(identidadLegacy, inventarioRcl, inventarioSlotting = []) {
  const posicionRealPorArticulo = new Map(
    inventarioSlotting.map(f => [f.articulo, { pasillo: f.pasillo, columna: f.columna, nivel: f.nivel }]),
  );

  // Una sub-posición puede tener VARIOS artículos a la vez (un nivel
  // compartido entre SKU es normal, ver inventarioRcl.service.js) -- por
  // eso agrupa en un array, nunca pisa una fila con otra de la misma clave.
  const inventarioPorSubPosicion = new Map();
  for (const i of inventarioRcl) {
    const clave = `${i.rclCodigo}|${i.rclNivel}|${i.rclSubnivel}`;
    if (!inventarioPorSubPosicion.has(clave)) inventarioPorSubPosicion.set(clave, []);
    inventarioPorSubPosicion.get(clave).push(i);
  }

  const racks = new Map();

  for (const id of identidadLegacy) {
    if (id.estadoRcl !== 'asignado') continue;

    const filas = inventarioPorSubPosicion.get(`${id.rclCodigo}|${id.rclNivel}|${id.rclSubnivel}`) ?? [];
    const conStock = filas.filter(inv => inv.cantidad > 0);
    if (conStock.length === 0) continue; // sub-posición sin stock real -- no ocupa nada en esta vista

    for (const inv of conStock) {
      const destino = posicionRealPorArticulo.get(inv.articulo);
      if (!destino) continue; // sin lugar en el plan vigente -- no se inventa uno, ver detectarDestinosDesactualizados()

      const rackKey = `${destino.pasillo}|${destino.columna}`;
      if (!racks.has(rackKey)) racks.set(rackKey, { pasillo: destino.pasillo, columna: destino.columna, niveles: {} });
      const rack = racks.get(rackKey);

      const nivelWms = destino.nivel;
      if (!rack.niveles[nivelWms]) rack.niveles[nivelWms] = [];
      rack.niveles[nivelWms].push({
        articulo: inv.articulo,
        consumo: 0, picks: null, nivelesAArmar: null, // sin equivalente real en esta vista -- 0/null explícitos, no inventados
        rackActual: id.rclCodigo,
        clase: '-', tipo: 'NORMAL',
      });
    }
  }

  return racks;
}
