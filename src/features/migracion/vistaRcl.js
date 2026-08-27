import { numeroANivelWms } from './nivelWms.js';

/**
 * Construye la "vista RCL" del canvas -- mismo grano de celdas
 * (pasillo|columna) que la vista MZ normal, pero el contenido de cada
 * nivel sale de `inventario_rcl_actual` (lo que HOY tiene esa sub-posición
 * en el sistema viejo, físicamente). Misma forma de salida que
 * agruparPorRack() -- CeldaRack/PanelDetalle la consumen sin saber que
 * existe una segunda vista.
 *
 * Corrección de fondo (2026-08-24, pedido explícito de David: "el RCL es
 * la misma estructura a nivel físico que MZ... si quieres una grilla, es
 * exactamente igual a la que ya hay"): RCL y MZ son la MISMA grilla física
 * (mismo edificio, mismas posiciones) -- lo único que cambió es el NOMBRE
 * de cada posición y, con el tiempo, qué artículo vive en cada una.
 * `identidad_legacy.mzPasillo/mzColumna/mzNivel` es justo esa identidad
 * física fija (posición X = "antes se llamaba RCL Y"), nunca un plan que
 * evolucione -- por eso la celda se posiciona ahí, no en el destino de
 * `inventario_slotting` (que es a dónde VA cada artículo, un concepto de
 * MIGRACIÓN completamente distinto y no relacionado con la posición física
 * del RCL). El intento anterior (2026-08-11) posicionaba por el destino
 * MZ del artículo en el plan de migración -- mezclaba "dónde está
 * físicamente este RCL" con "a dónde va a viajar su contenido", que David
 * confirmó son preguntas distintas.
 *
 * Solo las sub-posiciones con `estado_rcl === 'asignado'` participan --
 * "pendiente_asignar"/"sin_rcl" no tienen una posición física conocida con
 * la cual cruzar el inventario.
 *
 * `destinoPlaneadoPorArticulo` (2026-08-25, pedido explícito de David: "yo lo
 * que quiero ver es lo que hay en ese rcl y el mz que lo representa, los
 * movimientos a donde van deberían ser diferentes el lugar donde estoy, si
 * no no movería nada") -- Map articulo -> {mzPasillo, mzColumna, mzNivel,
 * ambiguo}, la MISMA que MapaCanvas.jsx ya arma para BarraMovimiento (ver
 * destinoPlaneadoPorArticulo ahí). Se adjunta a cada item como
 * `destinoPlaneado` para que la UI pueda comparar "dónde está físicamente
 * este RCL" (id.mzPasillo/mzColumna, la identidad fija) contra "a dónde va
 * su contenido según el plan" (destinoPlaneado) -- son dos preguntas
 * distintas, nunca se deben mostrar como si fueran la misma.
 *
 * @param {Array} identidadLegacy -- {rclCodigo, rclNivel, rclSubnivel, estadoRcl, mzPasillo, mzColumna, mzNivel}
 * @param {Array} inventarioRcl -- {rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}
 * @param {Map} [destinoPlaneadoPorArticulo] -- articulo -> destino del plan de migración (opcional)
 */
export function construirVistaRcl(identidadLegacy, inventarioRcl, destinoPlaneadoPorArticulo = new Map()) {
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

    const nivelWms = numeroANivelWms(id.mzNivel);
    if (!nivelWms) continue; // sin equivalente de nivel WMS (no debería pasar con estado 'asignado', pero nunca se inventa uno)

    const rackKey = `${id.mzPasillo}|${id.mzColumna}`;
    if (!racks.has(rackKey)) racks.set(rackKey, { pasillo: id.mzPasillo, columna: id.mzColumna, niveles: {} });
    const rack = racks.get(rackKey);

    if (!rack.niveles[nivelWms]) rack.niveles[nivelWms] = [];
    for (const inv of conStock) {
      rack.niveles[nivelWms].push({
        articulo: inv.articulo,
        consumo: 0, picks: null, nivelesAArmar: null, // sin equivalente real en esta vista -- 0/null explícitos, no inventados
        rackActual: id.rclCodigo,
        clase: '-', tipo: 'NORMAL',
        identidadFisica: { mzPasillo: id.mzPasillo, mzColumna: id.mzColumna },
        destinoPlaneado: destinoPlaneadoPorArticulo.get(inv.articulo) ?? null,
      });
    }
  }

  return racks;
}
