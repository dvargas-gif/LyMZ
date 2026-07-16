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

    const rackKey = `${id.mzPasillo}|${id.mzColumna}`;
    if (!racks.has(rackKey)) racks.set(rackKey, { pasillo: id.mzPasillo, columna: id.mzColumna, niveles: {} });
    const rack = racks.get(rackKey);

    const nivelWms = numeroANivelWms(id.mzNivel) ?? `N0${id.mzNivel}`;
    if (!rack.niveles[nivelWms]) rack.niveles[nivelWms] = [];
    for (const inv of conStock) {
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
