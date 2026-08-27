/**
 * Import del inventario ACTUAL por sub-posición RCL (F1.5-B, hoja
 * "Inventario"). A diferencia de identidadLegacy.service.js (headers
 * EXACTOS, archivo armado a mano), acá los headers son FLEXIBLES -- mismo
 * criterio que cargaMasiva.service.js -- porque este archivo puede salir
 * de un ERP, no lo controla una sola persona escribiéndolo a mano.
 */
const REGEX_RCL = /^RCL(\d+)-C(\d+)-N(\d+)-(\d+)$/;
/** Mismo formato que identidadLegacy.service.js -- una fila de Inventario que trae esto en la columna RCL significa que el artículo ya se movió físicamente a su MZ nuevo (F1.5-B corriendo después de que arrancó la migración real), no un error de captura. */
const REGEX_MZ = /^MZ(\d{2})-C(\d{3})-N(\d+)-(\d+)$/;

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
  if (!m) {
    const mMz = rclTexto.toUpperCase().match(REGEX_MZ);
    if (mMz) {
      const cantidadDetectada = cantidadTexto === '' ? 0 : Number(cantidadTexto);
      return {
        ...base, valido: false, yaMigrado: true,
        motivo: `"${rclTexto}" ya está en formato MZ -- este artículo parece estar migrado físicamente`,
        mzPasillo: `MZ${mMz[1]}`, mzColumna: parseInt(mMz[2], 10), mzNivel: parseInt(mMz[3], 10), mzSubnivel: parseInt(mMz[4], 10),
        cantidadDetectada: Number.isFinite(cantidadDetectada) ? cantidadDetectada : 0,
      };
    }
    return { ...base, valido: false, motivo: `Formato de RCL inválido ("${rclTexto}") -- esperado RCLxxx-Cxxx-N0Z-1` };
  }
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
  const yaMigrado = rechazadas.filter(f => f.yaMigrado);
  return { filas: [...validas, ...rechazadas], validas, rechazadas, yaMigrado };
}

/**
 * Cruza las filas "ya migrado" (ubicación en formato MZ, ver parsearFilaInventario)
 * contra el estado real de `migracion_movimientos` para ese mismo pasillo+columna+
 * artículo (`estadosConocidos` = salida de
 * migracionMovimientosService.buscarEstadoPorDestinoYArticulo() -- id incluido --
 * I/O queda del lado del llamador, esto es puro). Un artículo puede tener más de
 * un movimiento histórico para la misma sub-posición (ej. uno descartado y otro
 * vigente) -- por eso se guardan TODOS los candidatos encontrados, no solo el
 * primero.
 *
 * Veredictos (decisión de negocio 2026-08-25, ver PROTOCOLO-GOBERNANZA.md Regla 2
 * -- cada uno con una consecuencia distinta y CONFIRMADA con David, no una
 * inferencia del agente):
 * - 'confirmado': ya existe un movimiento 'recolectado' para este destino+artículo
 *   -- el sistema ya lo sabe, no hace falta ninguna acción.
 * - 'pendiente_para_confirmar': existe EXACTAMENTE UN movimiento 'pendiente' (y
 *   ninguno 'recolectado') -- se puede marcar 'recolectado' automáticamente al
 *   aplicar la reconciliación (ya había un plan, solo faltaba el clic).
 * - 'requiere_revision_manual': hay candidatos pero ninguno calza limpio (más de
 *   un 'pendiente' -- ambiguo, no se adivina cuál -- o todos están 'a_revisar'/
 *   'descartado', que ya tienen un motivo propio para no tocarse solos). Nunca se
 *   actúa automáticamente acá.
 * - 'sin_registro': el motor no tiene NINGÚN movimiento para este destino+artículo
 *   -- señal más fuerte (nadie planeó este traslado). Solo queda como hallazgo,
 *   nunca se crea un movimiento retroactivo (decisión explícita de David: son
 *   pocos casos y merecen mirada humana antes de inventar un historial).
 */
export function resolverEstadoYaMigrado(filasYaMigrado, estadosConocidos) {
  const porClave = new Map();
  for (const e of estadosConocidos) {
    const clave = `${e.mzPasillo}|${e.mzColumna}|${e.articulo}`;
    const existentes = porClave.get(clave);
    if (existentes) existentes.push(e);
    else porClave.set(clave, [e]);
  }
  return filasYaMigrado.map(f => {
    const candidatos = porClave.get(`${f.mzPasillo}|${f.mzColumna}|${f.articulo}`) ?? [];
    const recolectado = candidatos.find(c => c.estado === 'recolectado');
    const pendientes = candidatos.filter(c => c.estado === 'pendiente');

    let veredicto, movimientoId = null;
    if (recolectado) {
      veredicto = 'confirmado';
      movimientoId = recolectado.id;
    } else if (candidatos.length === 0) {
      veredicto = 'sin_registro';
    } else if (pendientes.length === 1) {
      veredicto = 'pendiente_para_confirmar';
      movimientoId = pendientes[0].id;
    } else {
      veredicto = 'requiere_revision_manual';
    }
    return { ...f, veredicto, movimientoId, candidatos };
  });
}
