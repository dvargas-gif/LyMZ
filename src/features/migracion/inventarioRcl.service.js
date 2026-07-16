/**
 * Import del inventario ACTUAL por sub-posición RCL (F1.5-B, hoja
 * "Inventario"). A diferencia de identidadLegacy.service.js (headers
 * EXACTOS, archivo armado a mano), acá los headers son FLEXIBLES -- mismo
 * criterio que cargaMasiva.service.js -- porque este archivo puede salir
 * de un ERP, no lo controla una sola persona escribiéndolo a mano.
 */
const REGEX_RCL = /^RCL(\d+)-C(\d+)-N(\d+)-(\d+)$/;

const PALABRAS_CLAVE = {
  rcl: ['rcl', 'posicion', 'ubicacion', 'subposicion'],
  articulo: ['articulo', 'codigo', 'sku', 'material', 'item'],
  cantidad: ['cantidad', 'cant', 'stock', 'qty'],
};

function normalizarClave(k) {
  return String(k).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function valorPorPalabraClave(raw, campo) {
  const porClave = {};
  for (const k of Object.keys(raw)) porClave[normalizarClave(k)] = raw[k];
  const claves = Object.keys(porClave);
  const clave = claves.find(c => PALABRAS_CLAVE[campo].some(kw => c.includes(kw)));
  const valor = clave !== undefined ? porClave[clave] : undefined;
  return valor !== undefined && valor !== '' ? String(valor).trim() : '';
}

export function parsearFilaInventario(fila, raw) {
  const rclTexto = valorPorPalabraClave(raw, 'rcl');
  const articulo = valorPorPalabraClave(raw, 'articulo');
  const cantidadTexto = valorPorPalabraClave(raw, 'cantidad');
  const base = { fila, rclTexto, articulo, cantidadTexto };

  if (!rclTexto) return { ...base, valido: false, motivo: 'Celda vacía (falta RCL)' };
  const m = rclTexto.toUpperCase().match(REGEX_RCL);
  if (!m) return { ...base, valido: false, motivo: `Formato de RCL inválido ("${rclTexto}") -- esperado RCLxxx-Cxxx-N0Z-1` };
  if (!articulo) return { ...base, valido: false, motivo: 'Celda vacía (falta Artículo)' };

  const cantidad = cantidadTexto === '' ? 0 : Number(cantidadTexto);
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return { ...base, valido: false, motivo: `Cantidad inválida ("${cantidadTexto}") -- tiene que ser un número mayor o igual a 0` };
  }

  return {
    ...base, valido: true, motivo: '',
    rclCodigo: `RCL${m[1]}-C${m[2]}`, rclNivel: parseInt(m[3], 10), rclSubnivel: parseInt(m[4], 10),
    articulo, cantidad,
  };
}

export function parsearFilasInventario(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  return rawRows.map((raw, i) => parsearFilaInventario(i + 2, raw));
}

function claveRcl(rclCodigo, rclNivel, rclSubnivel) {
  return `${rclCodigo}-N${String(rclNivel).padStart(2, '0')}-${rclSubnivel}`;
}

/** Identidad real de una fila = sub-posición + artículo -- UNA sub-posición puede tener VARIOS artículos distintos a la vez (un nivel compartido entre SKUs es normal). */
function claveFila(f) {
  return `${claveRcl(f.rclCodigo, f.rclNivel, f.rclSubnivel)}|${f.articulo}`;
}

/**
 * Agrupa por sub-posición + artículo y SUMA las cantidades -- confirmado
 * con el usuario: trabajan con pallets, así que el MISMO artículo puede
 * aparecer varias veces en la misma sub-posición (uno por pallet físico).
 * Nunca es un error de captura, es la operación real -- se pliega en una
 * sola fila con la cantidad total (`pallets` cuenta cuántas filas crudas
 * se combinaron, para que el resumen del import pueda mostrarlo).
 *
 * Solo se descartan las filas que ya venían inválidas de
 * parsearFilaInventario (formato/celda vacía) -- ya no existe la noción de
 * "duplicado" para este archivo.
 */
export function validarInventarioRcl(filasParsed) {
  const rechazadas = filasParsed.filter(f => !f.valido);
  const porClave = new Map();
  for (const f of filasParsed) {
    if (!f.valido) continue;
    const clave = claveFila(f);
    const existente = porClave.get(clave);
    if (existente) {
      existente.cantidad += f.cantidad;
      existente.pallets += 1;
    } else {
      porClave.set(clave, { ...f, pallets: 1 });
    }
  }
  const validas = [...porClave.values()];
  return { filas: [...validas, ...rechazadas], validas, rechazadas };
}
