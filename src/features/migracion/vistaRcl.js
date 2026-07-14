import { numeroANivelWms } from './nivelWms.js';

/**
 * Construye la "vista RCL" del canvas -- mismo grano de celdas
 * (pasillo|columna) que la vista MZ normal, pero el contenido de cada
 * nivel sale de `inventario_rcl_actual` (lo que HOY tiene esa sub-posición
 * en el sistema viejo), resuelto vía `identidad_legacy` (qué RCL
 * corresponde a esa sub-posición MZ). Misma forma de salida que
 * agruparPorRack() -- CeldaRack/PanelDetalle la consumen sin saber que
 * existe una segunda vista.
 *
 * Solo las sub-posiciones con `estado_rcl === 'asignado'` participan --
 * "pendiente_asignar"/"sin_rcl" no tienen un rcl_codigo real con el cual
 * cruzar el inventario.
 */
export function construirVistaRcl(identidadLegacy, inventarioRcl) {
  const inventarioPorSubPosicion = new Map(
    inventarioRcl.map(i => [`${i.rclCodigo}|${i.rclNivel}|${i.rclSubnivel}`, i])
  );

  const racks = new Map();

  for (const id of identidadLegacy) {
    if (id.estadoRcl !== 'asignado') continue;

    const inv = inventarioPorSubPosicion.get(`${id.rclCodigo}|${id.rclNivel}|${id.rclSubnivel}`);
    if (!inv || inv.cantidad <= 0) continue; // sub-posición sin stock real -- no ocupa nada en esta vista

    const rackKey = `${id.mzPasillo}|${id.mzColumna}`;
    if (!racks.has(rackKey)) racks.set(rackKey, { pasillo: id.mzPasillo, columna: id.mzColumna, niveles: {} });
    const rack = racks.get(rackKey);

    const nivelWms = numeroANivelWms(id.mzNivel) ?? `N0${id.mzNivel}`;
    if (!rack.niveles[nivelWms]) rack.niveles[nivelWms] = [];
    rack.niveles[nivelWms].push({
      articulo: inv.articulo,
      consumo: 0, picks: null, nivelesAArmar: null, // sin equivalente real en esta vista -- 0/null explícitos, no inventados
      rackActual: id.rclCodigo,
      clase: '-', tipo: 'NORMAL',
    });
  }

  return racks;
}
