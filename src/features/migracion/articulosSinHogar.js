const REGEX_RCL = /^RCL(\d+)-C(\d+)-N(\d+)-(\d+)$/;

function parsearUbicacionRcl(texto) {
  if (!texto) return null;
  const m = String(texto).toUpperCase().match(REGEX_RCL);
  if (!m) return null;
  return { rclCodigo: `RCL${m[1]}-C${m[2]}`, rclNivel: parseInt(m[3], 10), rclSubnivel: parseInt(m[4], 10) };
}

/**
 * Artículos "sin hogar fijo" (2026-08-26, pedido explícito de David, tras
 * corregir una primera interpretación mía: NO son los del buffer -- esos ya
 * están acomodados, solo sin registrar -- sino los que "no tienen un
 * acomodo en los MZ definido, pero a nivel de inventario o Zona de pick
 * están ahí"). Presentes en `inventario_rcl_actual` (F1.5-B) o en
 * `zonas_pick`, pero SIN ninguna fila en `inventario_slotting` -- nunca se
 * les asignó una posición MZ en el plan, a diferencia del caso "ya
 * migrado" (inventarioRcl.service.js) que sí tenía plan, solo que el
 * sistema no se enteró de un movimiento puntual.
 *
 * La posición física ACTUAL (para poder iluminarlos en el mapa) se resuelve
 * vía `identidad_legacy` -- mismo mecanismo que vistaRcl.js -- a partir del
 * origen RCL de cada fuente (inventario_rcl_actual siempre lo tiene;
 * zonas_pick solo si trae `ubicacionRcl` con formato reconocible). Cuando
 * no se puede resolver, `mzPasillo`/`mzColumna` quedan en null -- el
 * llamador los lista aparte, nunca se inventa una coordenada.
 *
 * @param {Array<{articulo, rclCodigo, rclNivel, rclSubnivel, cantidad}>} inventarioRclActual
 * @param {Array<{articulo, ubicacionRcl}>} zonasPick
 * @param {Array<{articulo}>} inventarioSlotting -- CUALQUIER fila cuenta como "tiene hogar", sin importar el resto de sus campos
 * @param {Array<{rclCodigo, rclNivel, rclSubnivel, estadoRcl, mzPasillo, mzColumna}>} identidadLegacy
 * @returns {Array<{articulo, fuente:'inventario_rcl'|'zona_pick', mzPasillo:?string, mzColumna:?number}>}
 */
export function detectarArticulosSinHogar(inventarioRclActual, zonasPick, inventarioSlotting, identidadLegacy) {
  const conHogar = new Set(inventarioSlotting.map(a => a.articulo));

  const posicionPorRcl = new Map();
  for (const id of identidadLegacy) {
    if (id.estadoRcl !== 'asignado') continue;
    posicionPorRcl.set(`${id.rclCodigo}|${id.rclNivel}|${id.rclSubnivel}`, { mzPasillo: id.mzPasillo, mzColumna: id.mzColumna });
  }

  const porArticulo = new Map();

  for (const inv of inventarioRclActual) {
    if (conHogar.has(inv.articulo) || porArticulo.has(inv.articulo) || inv.cantidad <= 0) continue;
    const posicion = posicionPorRcl.get(`${inv.rclCodigo}|${inv.rclNivel}|${inv.rclSubnivel}`) ?? null;
    porArticulo.set(inv.articulo, {
      articulo: inv.articulo, fuente: 'inventario_rcl',
      mzPasillo: posicion?.mzPasillo ?? null, mzColumna: posicion?.mzColumna ?? null,
    });
  }

  for (const z of zonasPick) {
    if (conHogar.has(z.articulo) || porArticulo.has(z.articulo)) continue;
    const origen = parsearUbicacionRcl(z.ubicacionRcl);
    const posicion = origen ? posicionPorRcl.get(`${origen.rclCodigo}|${origen.rclNivel}|${origen.rclSubnivel}`) ?? null : null;
    porArticulo.set(z.articulo, {
      articulo: z.articulo, fuente: 'zona_pick',
      mzPasillo: posicion?.mzPasillo ?? null, mzColumna: posicion?.mzColumna ?? null,
    });
  }

  return [...porArticulo.values()];
}
