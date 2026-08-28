import { construirUniversoDeHuecos } from '../../engines/optimization/construirUniversoDeHuecos.js';
import { empaquetarArticulos } from '../../engines/optimization/empaquetarArticulos.js';

const REGEX_RCL = /^RCL(\d+)-C(\d+)-N(\d+)-(\d+)$/;

function parsearRackActual(rackActual) {
  if (!rackActual) return null;
  const m = String(rackActual).toUpperCase().match(REGEX_RCL);
  if (!m) return null;
  return { rclCodigo: `RCL${m[1]}-C${m[2]}`, rclNivel: parseInt(m[3], 10), rclSubnivel: parseInt(m[4], 10) };
}

/**
 * Ocupación real de HOY (2026-08-26, cierra la limitación conocida de esta
 * función: antes el motor corría como si el mezanine estuviera vacío) --
 * todo artículo de `inventario_slotting` que NO es uno de los candidatos
 * que estamos re-ubicando ya está, de verdad, en su posición asignada
 * (migrado o puesto a mano) -- ese hueco no está libre para nadie más.
 *
 * 2026-08-28, pedido explícito de David tras encontrar el hueco real: un
 * artículo movido a mano en el mapa (`posiciones_actuales` -- "Mover a
 * voluntad", carga masiva, aprobación del motor) puede estar en un lugar
 * DISTINTO al que tiene fijado en `inventario_slotting` (que nunca se
 * actualiza). Si a alguien se le ocurre recalcular el plan después de que
 * alguien movió algo a mano, `inventario_slotting` ya está desactualizado
 * para ESE artículo -- usarlo solo dejaría "ocupado" un hueco que ya está
 * vacío, e "ignoraría" el hueco donde el artículo realmente está ahora,
 * arriesgando ofrecérselo a otro. `posiciones_actuales` es la posición más
 * reciente conocida -- gana sobre `inventario_slotting` para el mismo
 * artículo (y también cuenta artículos que solo existen ahí, ej. carga
 * masiva sin fila en inventario_slotting).
 *
 * Sin volumen conocido para ese artículo ya-ocupante, no se puede calcular
 * CUÁNTO ocupa -- en vez de adivinar (o peor, ignorarlo y arriesgar un
 * choque real), se marca el hueco entero como LLENO (`volumenOcupado =
 * Infinity`). Conservador a propósito: puede subestimar espacio libre real,
 * nunca sugiere un destino que ya tiene contenido real encima.
 *
 * @param {Array<{articulo, pasillo, columna, nivel}>} inventarioSlotting
 * @param {Array<{articulo, pasillo, columna, nivel}>} posicionesActuales -- movidos a mano, gana sobre inventarioSlotting para el mismo artículo
 * @param {Set<string>} articulosCandidatos -- los que se están re-ubicando, se excluyen de la ocupación (no cuentan como "ya puestos")
 * @param {Map<string, number>} volumenPorArticulo
 * @returns {Map<string, {volumenOcupado:number, articulosDistintos:Set<string>}>} clave "pasillo|columna|nivel", mismo formato que espera empaquetarArticulos (estadoInicial)
 */
function construirOcupacionInicial(inventarioSlotting, posicionesActuales, articulosCandidatos, volumenPorArticulo) {
  const posicionPorArticulo = new Map();
  for (const a of inventarioSlotting) {
    if (articulosCandidatos.has(a.articulo)) continue;
    posicionPorArticulo.set(a.articulo, { pasillo: a.pasillo, columna: a.columna, nivel: a.nivel });
  }
  for (const p of posicionesActuales) {
    if (articulosCandidatos.has(p.articulo)) continue;
    posicionPorArticulo.set(p.articulo, { pasillo: p.pasillo, columna: p.columna, nivel: p.nivel }); // pisa (o agrega) la posición fija -- es la más reciente
  }

  const estadoInicial = new Map();
  for (const [articulo, pos] of posicionPorArticulo) {
    if (!pos.pasillo || pos.columna == null || !pos.nivel) continue;
    const clave = `${pos.pasillo}|${pos.columna}|${pos.nivel}`;
    const existente = estadoInicial.get(clave);
    if (existente?.volumenOcupado === Infinity) continue; // ya marcado lleno, no hace falta seguir sumando

    const volumen = volumenPorArticulo.get(articulo);
    if (volumen == null || Number.isNaN(volumen)) {
      estadoInicial.set(clave, { volumenOcupado: Infinity, articulosDistintos: new Set([...(existente?.articulosDistintos ?? []), articulo]) });
      continue;
    }
    estadoInicial.set(clave, {
      volumenOcupado: (existente?.volumenOcupado ?? 0) + volumen,
      articulosDistintos: new Set([...(existente?.articulosDistintos ?? []), articulo]),
    });
  }
  return estadoInicial;
}

/**
 * Igual que generarMovimientos.js (detección de origen RCL + cantidad real,
 * sin tocar -- ya funciona bien), pero el DESTINO se elige con el motor de
 * optimización (`src/engines/optimization/`, volumen/densidad/afinidad de
 * zona) en vez del pasillo/columna/nivel fijo que ya trae
 * `inventario_slotting` (asignado a mano una vez, hace tiempo). Pedido
 * explícito de David 2026-08-26: "quiero que cambies el nuevo para que
 * pueda generar los RCL y los MZ, con la diferencia que la lógica de
 * selección sea la nueva".
 *
 * La salida tiene la MISMA forma que generarMovimientosMigracion() --
 * {mzPasillo, mzColumna, mzNivel, rclCodigo, rclNivel, articulo, cantidad,
 * orden} -- para que migracion_movimientos, migracion_slots,
 * migracion_buffer, despacho_tareas y Vista RCL sigan funcionando sin
 * ningún cambio. Solo cambia CÓMO se decide el destino, nunca el contrato
 * con el resto del sistema.
 *
 * Respaldo explícito: un artículo sin volumen cargado (`articulo_dimensiones`)
 * no puede pasar por el motor nuevo (`empaquetarArticulos` lo reporta en
 * `sinAsignar` con motivo 'sin_dimensiones_importadas') -- en vez de dejarlo
 * sin destino (hoy nunca pasa, todo pendiente ya tiene uno fijo), se usa su
 * destino original de `inventario_slotting` como respaldo, marcado en
 * `respaldados` para que quede visible qué artículos NO pasaron por la
 * lógica nueva. Nunca peor que el comportamiento de hoy.
 *
 * Ocupación real (2026-08-26, cierra una limitación real que tuvo esta
 * función unas horas): el universo de huecos NO se trata como vacío -- todo
 * artículo de `inventario_slotting` que no es uno de los candidatos a
 * re-ubicar ya está físicamente en su lugar (migrado o puesto a mano), y
 * ese hueco se resta de la capacidad disponible antes de elegir destino
 * para nadie más (ver construirOcupacionInicial). Sin volumen conocido para
 * un ya-ocupante, el hueco se marca LLENO por seguridad, nunca se adivina.
 *
 * @param {Array<{articulo, pasillo, columna, nivel, rack_actual}>} inventarioSlotting
 * @param {Array<{rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}>} inventarioRclActual
 * @param {Map<string, number>} volumenPorArticulo -- articulo -> volumenM3 (de articulo_dimensiones), null/ausente = sin dimensión
 * @param {object} geometria -- geometriaMezanine.data.json ya validado
 * @param {Array<{articulo, pasillo, columna, nivel}>} [posicionesActuales] -- movidos a mano (posiciones_actuales), gana sobre inventarioSlotting para la ocupación (ver construirOcupacionInicial)
 * @param {object} [opcionesMotor] -- {zonas, pesos, reglas} del motor de optimización (ver empaquetarArticulos.js)
 * @returns {{ movimientos: Array, sinStock: Array, respaldados: Array<{articulo, motivo}> }}
 */
export function generarMovimientosMigracionOptimizado(inventarioSlotting, inventarioRclActual, volumenPorArticulo, geometria, posicionesActuales = [], opcionesMotor = {}) {
  const cantidadPorClave = new Map();
  for (const inv of inventarioRclActual) {
    const clave = `${inv.rclCodigo}|${inv.rclNivel}|${inv.rclSubnivel}|${inv.articulo}`;
    cantidadPorClave.set(clave, (cantidadPorClave.get(clave) ?? 0) + inv.cantidad);
  }

  const candidatos = [];
  const sinStock = [];
  for (const a of inventarioSlotting) {
    const origen = parsearRackActual(a.rack_actual);
    if (!origen) continue;
    const clave = `${origen.rclCodigo}|${origen.rclNivel}|${origen.rclSubnivel}|${a.articulo}`;
    const cantidad = cantidadPorClave.get(clave) ?? 0;
    if (cantidad <= 0) {
      sinStock.push({ articulo: a.articulo, pasillo: a.pasillo, columna: a.columna, nivel: a.nivel, rclCodigo: origen.rclCodigo, rclNivel: origen.rclNivel });
      continue;
    }
    candidatos.push({
      articulo: a.articulo, rclCodigo: origen.rclCodigo, rclNivel: origen.rclNivel, cantidad,
      destinoRespaldo: { pasillo: a.pasillo, columna: a.columna, nivel: a.nivel },
    });
  }

  const cuerpos = construirUniversoDeHuecos(geometria);
  const articulosCandidatos = new Set(candidatos.map(c => c.articulo));
  const estadoInicial = construirOcupacionInicial(inventarioSlotting, posicionesActuales, articulosCandidatos, volumenPorArticulo);
  const articulosParaEmpaquetar = candidatos.map(c => ({ articulo: c.articulo, volumenM3: volumenPorArticulo.get(c.articulo) ?? null }));
  const { asignaciones } = empaquetarArticulos(articulosParaEmpaquetar, cuerpos, { ...opcionesMotor, estadoInicial });
  const destinoPorArticulo = new Map(asignaciones.map(a => [a.articulo, { pasillo: a.pasillo, columna: a.columna, nivel: a.nivel }]));

  const respaldados = [];
  const conDestino = [];
  for (const c of candidatos) {
    let destino = destinoPorArticulo.get(c.articulo);
    if (!destino) {
      destino = c.destinoRespaldo;
      respaldados.push({ articulo: c.articulo, motivo: 'sin_dimensiones_importadas -- se usó el destino fijo original de inventario_slotting' });
    }
    conDestino.push({
      mzPasillo: destino.pasillo, mzColumna: destino.columna, mzNivel: destino.nivel,
      rclCodigo: c.rclCodigo, rclNivel: c.rclNivel, articulo: c.articulo, cantidad: c.cantidad,
    });
  }

  const porDestino = new Map();
  for (const m of conDestino) {
    const claveDestino = `${m.mzPasillo}|${m.mzColumna}`;
    if (!porDestino.has(claveDestino)) porDestino.set(claveDestino, []);
    porDestino.get(claveDestino).push(m);
  }
  const movimientos = [];
  for (const grupo of porDestino.values()) {
    grupo.sort((a, b) => `${a.rclCodigo}-N${String(a.rclNivel).padStart(2, '0')}`.localeCompare(`${b.rclCodigo}-N${String(b.rclNivel).padStart(2, '0')}`));
    grupo.forEach((m, i) => movimientos.push({ ...m, orden: i + 1 }));
  }

  return { movimientos, sinStock, respaldados };
}
