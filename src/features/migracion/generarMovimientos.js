/**
 * Genera las filas de `migracion_movimientos` (el "cruce manual" RCL->MZ,
 * F1.5-C) cruzando datos que YA existen en el sistema -- confirmado con el
 * usuario: no hace falta un archivo nuevo. El plan de destino ya está en
 * `inventario_slotting` (`rack_actual` = origen RCL, pasillo/columna/nivel =
 * destino MZ) y la cantidad real de HOY ya está en `inventario_rcl_actual`
 * (F1.5-B, recién importado). Función pura, sin Supabase -- mismo criterio
 * que el resto de src/features/migracion/.
 */
const REGEX_RCL = /^RCL(\d+)-C(\d+)-N(\d+)-(\d+)$/;

function parsearRackActual(rackActual) {
  if (!rackActual) return null;
  const m = String(rackActual).toUpperCase().match(REGEX_RCL);
  if (!m) return null;
  return { rclCodigo: `RCL${m[1]}-C${m[2]}`, rclNivel: parseInt(m[3], 10), rclSubnivel: parseInt(m[4], 10) };
}

/**
 * @param {Array<{articulo, pasillo, columna, nivel, rack_actual}>} inventarioSlotting -- inventarioService.listar()
 * @param {Array<{rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}>} inventarioRclActual -- inventarioRclService.listar()
 * @returns {{ movimientos: Array, sinStock: Array }}
 *   `movimientos`: {mzPasillo, mzColumna, mzNivel, rclCodigo, rclNivel, articulo, cantidad, orden} --
 *   `orden` agrupa por RCL de origen DENTRO de cada destino MZ (pedido explícito del
 *   usuario: que el operador traiga todo lo del mismo rack RCL junto, sin ir y volver --
 *   no existe un dato de orden físico real, es la mejor aproximación sin uno).
 *   `sinStock`: artículos del plan cuyo origen RCL ya no tiene stock real hoy -- se
 *   excluyen del plan de recolección (mismo criterio que articulosAgotados.js), nunca
 *   se inventa una cantidad.
 */
export function generarMovimientosMigracion(inventarioSlotting, inventarioRclActual) {
  const cantidadPorClave = new Map();
  for (const inv of inventarioRclActual) {
    const clave = `${inv.rclCodigo}|${inv.rclNivel}|${inv.rclSubnivel}|${inv.articulo}`;
    cantidadPorClave.set(clave, (cantidadPorClave.get(clave) ?? 0) + inv.cantidad);
  }

  const candidatos = [];
  const sinStock = [];
  for (const a of inventarioSlotting) {
    const origen = parsearRackActual(a.rack_actual);
    if (!origen) continue; // sin origen RCL parseable -- nada que cruzar, se ignora (mismo criterio que articulosAgotados.js)
    const clave = `${origen.rclCodigo}|${origen.rclNivel}|${origen.rclSubnivel}|${a.articulo}`;
    const cantidad = cantidadPorClave.get(clave) ?? 0;
    if (cantidad <= 0) {
      sinStock.push({ articulo: a.articulo, pasillo: a.pasillo, columna: a.columna, nivel: a.nivel, rclCodigo: origen.rclCodigo, rclNivel: origen.rclNivel });
      continue;
    }
    candidatos.push({
      mzPasillo: a.pasillo, mzColumna: a.columna, mzNivel: a.nivel,
      rclCodigo: origen.rclCodigo, rclNivel: origen.rclNivel,
      articulo: a.articulo, cantidad,
    });
  }

  const porDestino = new Map();
  for (const c of candidatos) {
    const claveDestino = `${c.mzPasillo}|${c.mzColumna}`;
    if (!porDestino.has(claveDestino)) porDestino.set(claveDestino, []);
    porDestino.get(claveDestino).push(c);
  }

  const movimientos = [];
  for (const grupo of porDestino.values()) {
    grupo.sort((a, b) => `${a.rclCodigo}-N${String(a.rclNivel).padStart(2, '0')}`.localeCompare(`${b.rclCodigo}-N${String(b.rclNivel).padStart(2, '0')}`));
    grupo.forEach((c, i) => movimientos.push({ ...c, orden: i + 1 }));
  }

  return { movimientos, sinStock };
}
