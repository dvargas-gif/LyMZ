/**
 * Reparto de una oleada de `planificarSecuencia.js` entre N trabajadores de
 * piso, identificados solo por un número consecutivo (no son cuentas de la
 * app -- ver DECISIONES.md, sesión 2026-07-21, Módulo de Despacho). Función
 * pura, sin Supabase (mismo criterio que planificarSecuencia.js).
 *
 * Por qué existe: `planificarSecuencia` ya decide QUÉ racks son elegibles
 * esta oleada (respetando dependencias entre racks y el cupo de equipos).
 * Esto no se toca ni se reimplementa acá -- este módulo solo decide QUIÉN
 * (qué número de trabajador) hace cada tarea concreta dentro de esa oleada
 * ya aprobada.
 *
 * Rediseño 2026-07-22 (pedido explícito, antes de las pruebas de piso): el
 * orden de las tareas se arma agrupado POR CUERPO (vaciar antes que
 * recolectar dentro de cada uno -- la dependencia física real). Pero el
 * reparto entre trabajadores NO ata un cuerpo entero a una sola persona: se
 * aplana esa lista ya ordenada y se corta en bloques PAREJOS por cabeza (60
 * tareas, 3 operadores, 20 cada uno) -- pedido explícito para no complicar
 * la hoja con roles distintos por persona. Si un cuerpo no divide justo
 * entre bloques, su cola queda contigua en el bloque siguiente (mismo
 * cuerpo, dos personas), nunca salteada a otro cuerpo lejano. La garantía
 * de "todo termina resuelto, no queda nada a medias" no depende de este
 * reparto -- depende de que `cerrar_lote_despacho` rechaza el cierre
 * mientras quede una sola tarea sin confirmar (ver despacho.service.js).
 *
 * Segundo ajuste el mismo día (caso real observado en piso: 3 racks
 * vaciados de 14-20 artículos cada uno para recolectar apenas 1 en cada
 * uno -- buffer lleno, ningún MZ conformado). Primer intento (revertido):
 * priorizar por relación recolectar/vaciar -- MAL, señalado por el usuario:
 * un rack cuyo plan REAL es un solo artículo (`inventario_slotting` solo le
 * asigna 1) recolecta 1 de 1, está PERFECTO, no es un caso "desbalanceado"
 * aunque haya que vaciar 14 para llegar ahí. La relación recolectar/vaciar
 * sola no alcanza -- hace falta saber cuánto destina el PLAN COMPLETO a ese
 * rack, no solo cuánto está listo hoy.
 *
 * Fix real: comparar el total planificado en `inventario_slotting` para
 * cada rack contra cuántos de esos artículos ALGUNA VEZ llegaron a tener un
 * `migracion_movimiento` (cualquier estado -- un movimiento solo se crea si
 * tuvo stock real al momento de "Calcular plan", ver generarMovimientos.js).
 * Si coinciden, ese rack SÍ se completa del todo con lo que hay en esta
 * oleada (sin importar qué tan pocos sean) -- si el plan pide más de lo que
 * algún día tuvo movimiento, esos artículos no tienen stock real y van a
 * quedar faltantes hasta que se recalcule el plan, sin importar qué tan
 * buena se vea la relación de ESTA oleada. Ver `datosPlan` más abajo --
 * parámetro opcional (si no se pasa, ningún rack se marca desbalanceado,
 * mismo comportamiento que antes de este ajuste).
 *
 * Garantía de "nunca el mismo artículo a dos personas": tanto un
 * `migracion_movimiento` pendiente (recolectar) como una fila de
 * `inventario_rcl_actual` (vaciar) son filas únicas -- se reparten una sola
 * vez al aplanar la lista, no hace falta ningún candado en tiempo de
 * ejecución, es una propiedad estructural del algoritmo.
 *
 * Nota deliberada: NO se importa nada de planificarSecuencia.js acá, ni se
 * factoriza el mapeo RCL<->MZ que ese archivo ya tiene internamente --
 * duplicar unas pocas líneas es preferible a tocar ese archivo (motor
 * compartido, fuera de alcance de esta corrección) solo para compartir un
 * helper interno no exportado.
 */

const SUBNIVEL_UNICO = 1;

function claveRack(mzPasillo, mzColumna) {
  return `${mzPasillo}|${mzColumna}`;
}

/**
 * Qué artículos hay HOY, de verdad, en cada rack de la oleada (bajo su
 * identidad RCL vieja) -- lo que hay que sacar y depositar en el buffer
 * antes de poder recolectar nada nuevo ahí. Función pura, sin Supabase.
 *
 * @param {Array<{mzPasillo, mzColumna}>} oleadaRacks
 * @param {Array<{mzPasillo, mzColumna, rclCodigo, rclNivel, rclSubnivel, estadoRcl}>} identidadLegacy -- identidadLegacyService.listar()
 * @param {Array<{rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}>} inventarioRclActual -- inventarioRclService.listar()
 * @returns {Array<{mzPasillo, mzColumna, rclCodigo, rclNivel, articulo, cantidad}>}
 */
export function contenidoActualDeRacks(oleadaRacks, identidadLegacy, inventarioRclActual) {
  const racksDeLaOleada = new Set(oleadaRacks.map(r => claveRack(r.mzPasillo, r.mzColumna)));

  const mzPorRcl = new Map();
  for (const fila of identidadLegacy) {
    if (fila.estadoRcl !== 'asignado' || fila.rclCodigo == null) continue;
    if (Number(fila.rclSubnivel) !== SUBNIVEL_UNICO) continue;
    const clave = claveRack(fila.mzPasillo, fila.mzColumna);
    if (!racksDeLaOleada.has(clave)) continue;
    mzPorRcl.set(`${fila.rclCodigo}|${Number(fila.rclNivel)}`, { mzPasillo: fila.mzPasillo, mzColumna: fila.mzColumna });
  }

  const contenido = [];
  for (const item of inventarioRclActual) {
    if (Number(item.rclSubnivel) !== SUBNIVEL_UNICO) continue;
    const destino = mzPorRcl.get(`${item.rclCodigo}|${Number(item.rclNivel)}`);
    if (!destino) continue;
    contenido.push({
      mzPasillo: destino.mzPasillo, mzColumna: destino.mzColumna,
      rclCodigo: item.rclCodigo, rclNivel: item.rclNivel, articulo: item.articulo, cantidad: item.cantidad,
    });
  }
  return contenido;
}

/**
 * @param {Array<{mzPasillo, mzColumna}>} oleadaRacks -- UNA oleada de `planificarSecuencia(...).oleadas[i]`, no el array de oleadas completo.
 * @param {Array<{mzPasillo, mzColumna, rclCodigo, rclNivel, articulo, cantidad}>} contenidoActualPorRack -- contenidoActualDeRacks(oleadaRacks, ...)
 * @param {Array<{id, mzPasillo, mzColumna, rclCodigo, rclNivel, articulo}>} movimientosPendientes -- migracionMovimientosService.listarPendientesParaSecuencia()
 * @param {number} cantidadOperadores -- cuántos trabajadores de piso hay disponibles para esta oleada (hoy, en la práctica, 4 a 10).
 * @param {{totalPlanificadoPorRack?: Map<string,number>, totalConMovimientoPorRack?: Map<string,number>}} datosPlan -- OPCIONAL.
 *   Ambos Map con clave "pasillo|columna". `totalPlanificadoPorRack`: cuántas filas tiene ese rack en
 *   `inventario_slotting` (el plan completo, se calcula agrupando esa tabla). `totalConMovimientoPorRack`:
 *   cuántas de esas filas ALGUNA VEZ tuvieron un `migracion_movimiento` real (cualquier estado, ver
 *   migracionMovimientosService.listarTodosCualquierEstado()). Si no se pasa, no se marca ningún rack
 *   como desbalanceado (mismo comportamiento que antes de este chequeo).
 * @returns {{ trabajadores: Array<{numero: number, tareas: Array}>, advertencias: string[] }}
 *   Cada tarea es `{tipo:'vaciar', mzPasillo, mzColumna, rclCodigo, rclNivel, articulo, cantidad}` (sacar ESTE
 *   artículo de acá y dejarlo en el buffer) o `{tipo:'recolectar', movimientoId, mzPasillo, mzColumna, rclCodigo, rclNivel, articulo}`
 *   (traer ESTE artículo desde el origen hacia acá). El reparto es parejo por cabeza (bloques contiguos
 *   sobre la lista ya ordenada por cuerpo) -- si un cuerpo no divide justo, su cola pasa al siguiente
 *   trabajador, nunca se saltea a un cuerpo distinto.
 */
export function generarLoteDespacho(oleadaRacks, contenidoActualPorRack, movimientosPendientes, cantidadOperadores, datosPlan = {}) {
  const { totalPlanificadoPorRack, totalConMovimientoPorRack } = datosPlan;
  const advertencias = [];

  if (!Number.isInteger(cantidadOperadores) || cantidadOperadores <= 0) {
    return { trabajadores: [], advertencias: ['La cantidad de operadores tiene que ser un número entero mayor a 0.'] };
  }
  if (oleadaRacks.length === 0) {
    return { trabajadores: [], advertencias: ['La oleada no tiene ningún rack para despachar.'] };
  }

  const racksDeLaOleada = new Set(oleadaRacks.map(r => claveRack(r.mzPasillo, r.mzColumna)));

  const aVaciarPorRack = new Map();
  for (const item of contenidoActualPorRack) {
    const clave = claveRack(item.mzPasillo, item.mzColumna);
    if (!racksDeLaOleada.has(clave)) continue;
    if (!aVaciarPorRack.has(clave)) aVaciarPorRack.set(clave, []);
    aVaciarPorRack.get(clave).push(item);
  }
  const aRecolectarPorRack = new Map();
  for (const m of movimientosPendientes) {
    const clave = claveRack(m.mzPasillo, m.mzColumna);
    if (!racksDeLaOleada.has(clave)) continue;
    if (!aRecolectarPorRack.has(clave)) aRecolectarPorRack.set(clave, []);
    aRecolectarPorRack.get(clave).push(m);
  }

  // Un bloque por CUERPO -- sus tareas de vaciar (una por artículo hoy
  // presente ahí) seguidas de sus tareas de recolectar (una por artículo
  // nuevo a traer), en ESE orden: no tiene sentido acomodar lo nuevo antes
  // de sacar lo viejo.
  const bloques = oleadaRacks.map(rack => {
    const clave = claveRack(rack.mzPasillo, rack.mzColumna);
    const vaciar = (aVaciarPorRack.get(clave) ?? []).map(item => ({
      tipo: 'vaciar',
      mzPasillo: rack.mzPasillo, mzColumna: rack.mzColumna,
      rclCodigo: item.rclCodigo, rclNivel: item.rclNivel, articulo: item.articulo, cantidad: item.cantidad,
    }));
    const recolectar = (aRecolectarPorRack.get(clave) ?? []).map(m => ({
      tipo: 'recolectar',
      movimientoId: m.id,
      mzPasillo: rack.mzPasillo, mzColumna: rack.mzColumna,
      rclCodigo: m.rclCodigo, rclNivel: m.rclNivel, articulo: m.articulo,
    }));
    const totalPlanificado = totalPlanificadoPorRack?.get(clave);
    const totalConMovimiento = totalConMovimientoPorRack?.get(clave);
    // Sin datosPlan (tests viejos, u otro llamador que no lo pasa): faltantes
    // siempre 0, ningún rack se marca desbalanceado -- mismo comportamiento
    // que antes de este chequeo, nunca un falso positivo por falta de dato.
    const faltantesPorFaltaDeStock = (totalPlanificado != null && totalConMovimiento != null)
      ? Math.max(0, totalPlanificado - totalConMovimiento)
      : 0;

    return {
      mzPasillo: rack.mzPasillo, mzColumna: rack.mzColumna, tareas: [...vaciar, ...recolectar],
      costoVaciado: vaciar.length, beneficioRecolectar: recolectar.length, faltantesPorFaltaDeStock,
    };
  }).filter(b => b.tareas.length > 0);

  // Prioridad: primero los cuerpos que SÍ se completan del todo con esta
  // oleada (`faltantesPorFaltaDeStock === 0` -- el plan completo de ese
  // rack ya tiene movimiento, sea cual sea el número), después los que van
  // a quedar incompletos por falta de stock (sin importar qué tan bien se
  // vea la relación de HOY, ya sabemos que no alcanza). Dentro de cada
  // grupo, costo de vaciado ascendente ("arranque liviano") como desempate.
  bloques.sort((a, b) => {
    const aCompleta = a.faltantesPorFaltaDeStock === 0, bCompleta = b.faltantesPorFaltaDeStock === 0;
    if (aCompleta !== bCompleta) return aCompleta ? -1 : 1;
    if (a.costoVaciado !== b.costoVaciado) return a.costoVaciado - b.costoVaciado;
    if (a.mzPasillo !== b.mzPasillo) return String(a.mzPasillo).localeCompare(String(b.mzPasillo));
    return Number(a.mzColumna) - Number(b.mzColumna);
  });

  if (bloques.length === 0) {
    return { trabajadores: [], advertencias: ['No hay ninguna tarea real para esta oleada (los racks no tienen ni artículos que vaciar ni movimientos pendientes).'] };
  }

  // Aviso explícito y con números reales -- nunca silencioso -- SOLO para
  // racks donde el plan completo pide más artículos de los que alguna vez
  // tuvieron stock real: esos van a quedar con el rack a medias pase lo que
  // pase en esta oleada, hasta que se recalcule el plan con stock nuevo. Un
  // rack cuyo plan completo es 1 solo artículo y recolecta 1 NO entra acá
  // (faltantes = 0) -- está perfecto, por más que haya costado vaciar mucho
  // para llegar a él.
  for (const b of bloques) {
    if (b.faltantesPorFaltaDeStock > 0) {
      const rackTxt = `${b.mzPasillo}-C${String(b.mzColumna).padStart(3, '0')}`;
      const totalPlan = b.beneficioRecolectar + b.faltantesPorFaltaDeStock;
      advertencias.push(`⚠ Rack ${rackTxt}: el plan destina ${totalPlan} artículo(s) en total, pero solo ${b.beneficioRecolectar} tienen stock real hoy -- van a quedar ${b.faltantesPorFaltaDeStock} sin resolver hasta que haya más stock (vació ${b.costoVaciado} artículo(s) para esto).`);
    }
  }

  // Se aplana la lista ya ordenada (cuerpos livianos primero, vaciar antes
  // que recolectar dentro de cada uno) y se corta en bloques PAREJOS por
  // cabeza -- no cíclico, contiguo: cada trabajador recibe un tramo seguido
  // de la lista, así que en general le toca un cuerpo entero o dos
  // consecutivos, nunca tareas salteadas de cuerpos lejanos.
  const todasLasTareas = bloques.flatMap(b => b.tareas);
  const totalTareas = todasLasTareas.length;
  const base = Math.floor(totalTareas / cantidadOperadores);
  const resto = totalTareas % cantidadOperadores;

  const trabajadores = [];
  let cursor = 0;
  for (let numero = 0; numero < cantidadOperadores; numero++) {
    const tamano = base + (numero < resto ? 1 : 0);
    const tareas = todasLasTareas.slice(cursor, cursor + tamano);
    cursor += tamano;
    if (tareas.length > 0) {
      trabajadores.push({ numero, tareas: tareas.map((t, orden) => ({ ...t, orden })) });
    }
  }

  const sinTareas = cantidadOperadores - trabajadores.length;
  if (sinTareas > 0) {
    advertencias.push(`${sinTareas} operador(es) de los ${cantidadOperadores} disponibles no reciben tareas en esta oleada -- hay menos tareas totales que gente.`);
  }
  advertencias.push(`Esta orden contempla ${bloques.length} cuerpo(s) (posible MZ nuevo cada uno) y ${totalTareas} tarea(s) en total, repartidas parejo entre los operadores.`);

  return { trabajadores, advertencias };
}
