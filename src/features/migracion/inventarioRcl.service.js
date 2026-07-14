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

/** Solo detecta duplicados DENTRO del archivo -- a diferencia de identidad_legacy, acá SÍ se espera re-importar la misma sub-posición entre archivos distintos (es un snapshot que se actualiza), así que no hay chequeo contra "existentes". */
export function validarInventarioRcl(filasParsed) {
  const conteo = new Map();
  for (const f of filasParsed) {
    if (!f.valido) continue;
    const clave = claveRcl(f.rclCodigo, f.rclNivel, f.rclSubnivel);
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  }
  const filas = filasParsed.map(f => {
    if (!f.valido) return f;
    const clave = claveRcl(f.rclCodigo, f.rclNivel, f.rclSubnivel);
    if (conteo.get(clave) > 1) {
      return { ...f, valido: false, motivo: `Sub-posición duplicada dentro del archivo (${clave} aparece ${conteo.get(clave)} veces)` };
    }
    return f;
  });
  return { filas, validas: filas.filter(f => f.valido), rechazadas: filas.filter(f => !f.valido) };
}
