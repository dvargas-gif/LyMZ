/**
 * Detecta artículos del mapa MZ real cuyo origen RCL (`rack_actual`, foto de
 * fábrica de `inventario_slotting`) ya no tiene stock real según el
 * inventario RCL recién importado -- confirmado con el usuario: en la
 * operación real se rebajan/consumen artículos del sistema viejo ANTES de
 * que arranque el movimiento físico, así que el plan de slotting original
 * puede quedar desactualizado respecto a lo que hoy existe de verdad.
 * Función pura, sin Supabase -- mismo criterio que el resto de
 * src/features/migracion/.
 */
import { nivelWmsANumero } from './nivelWms.js';

const REGEX_RCL = /^RCL(\d+)-C(\d+)-N(\d+)-(\d+)$/;

function parsearRackActual(rackActual) {
  if (!rackActual) return null;
  const m = String(rackActual).toUpperCase().match(REGEX_RCL);
  if (!m) return null;
  return { rclCodigo: `RCL${m[1]}-C${m[2]}`, rclNivel: parseInt(m[3], 10), rclSubnivel: parseInt(m[4], 10) };
}

function mapaCantidadPorClave(inventarioRcl) {
  const cantidadPorClave = new Map();
  for (const inv of inventarioRcl) {
    const clave = `${inv.rclCodigo}|${inv.rclNivel}|${inv.rclSubnivel}|${inv.articulo}`;
    cantidadPorClave.set(clave, (cantidadPorClave.get(clave) ?? 0) + inv.cantidad);
  }
  return cantidadPorClave;
}

/**
 * @param {Array<{articulo, pasillo, columna, nivel, rack_actual}>} articulosMapa -- salida de reporteService.obtener(null)
 * @param {Array<{rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}>} inventarioRcl -- salida de inventarioRclService.listar()
 * @returns {{ agotados: Array, sinOrigenRcl: Array }}
 *   `agotados`: el artículo tenía un origen RCL parseable pero esa sub-posición+artículo
 *   ya no tiene cantidad real (0 o sin fila) en el inventario recién importado.
 *   `sinOrigenRcl`: el artículo no tiene `rack_actual` parseable -- no hay dato con qué
 *   juzgarlo, nunca se asume agotado por ausencia de información (Ley 2, nada silencioso).
 */
export function detectarArticulosAgotados(articulosMapa, inventarioRcl) {
  const cantidadPorClave = mapaCantidadPorClave(inventarioRcl);

  const agotados = [];
  const sinOrigenRcl = [];
  for (const a of articulosMapa) {
    const origen = parsearRackActual(a.rack_actual);
    if (!origen) { sinOrigenRcl.push(a); continue; }
    const clave = `${origen.rclCodigo}|${origen.rclNivel}|${origen.rclSubnivel}|${a.articulo}`;
    const cantidad = cantidadPorClave.get(clave) ?? 0;
    if (cantidad <= 0) {
      agotados.push({ ...a, rclCodigo: origen.rclCodigo, rclNivel: origen.rclNivel, rclSubnivel: origen.rclSubnivel });
    }
  }
  return { agotados, sinOrigenRcl };
}

/**
 * Mismo criterio que detectarArticulosAgotados, pero para artículos que YA
 * están en el buffer de migración (depositados durante un vaciado) en vez
 * de seguir en su posición del mapa -- el snapshot de origen
 * (origenRclCodigo/origenNivel/origenSubNivel) ya viene congelado en la
 * fila del buffer al momento de depositarlo, no hace falta volver a
 * parsear `rack_actual`.
 *
 * Solo mira artículos SIN destino resuelto (`movimientoId == null`) -- uno
 * que ya tiene destino real no es candidato, sin importar el stock de su
 * origen (ya se sabe adónde va). "Exiliado": el artículo ya no tiene
 * stock real en su origen -- se considera fuera de la migración, no hay
 * nada físico que trasladar para él (pedido explícito del usuario).
 *
 * @param {Array<{id, articulo, movimientoId, origenRclCodigo, origenNivel, origenSubNivel}>} bufferItems
 * @param {Array<{rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}>} inventarioRcl
 * @returns {Array<{id, articulo, origenRclCodigo, origenNivel}>}
 */
export function detectarBufferSinStock(bufferItems, inventarioRcl) {
  const cantidadPorClave = mapaCantidadPorClave(inventarioRcl);

  const sinStock = [];
  for (const b of bufferItems) {
    if (b.movimientoId) continue; // ya tiene destino real -- no es candidato
    if (!b.origenRclCodigo) continue; // sin snapshot de origen -- no hay con qué juzgar, nunca se asume
    const nivelNumerico = nivelWmsANumero(b.origenNivel);
    if (nivelNumerico == null) continue; // CUERPO u otro sin equivalente -- no hay con qué cruzar
    if (!b.origenSubNivel) continue; // sin snapshot de subnivel -- no hay con qué juzgar, nunca se asume (mismo criterio que origenRclCodigo arriba)
    const subnivel = parseInt(b.origenSubNivel, 10);
    const clave = `${b.origenRclCodigo}|${nivelNumerico}|${subnivel}|${b.articulo}`;
    const cantidad = cantidadPorClave.get(clave) ?? 0;
    if (cantidad <= 0) {
      sinStock.push({ id: b.id, articulo: b.articulo, origenRclCodigo: b.origenRclCodigo, origenNivel: b.origenNivel });
    }
  }
  return sinStock;
}
