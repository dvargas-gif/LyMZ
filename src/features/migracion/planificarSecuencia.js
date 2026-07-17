/**
 * Simulador de orden de ejecución del plan de recolección (F2, ver
 * DECISIONES.md ADR-015 y la sesión 2026-07-17) -- función pura, sin
 * Supabase (mismo criterio que generarMovimientos.js/crearWarehouseModel.js).
 *
 * Por qué hace falta: `generarMovimientosMigracion()` cruza TODO el
 * inventario de una sola pasada, como si cada movimiento se fuera a
 * ejecutar de forma independiente. En la realidad, vaciar un rack MZ para
 * recibir su contenido correcto puede depender de que OTRO rack se vacíe
 * primero -- porque, al ser el mismo espacio físico con doble dirección
 * (RCL viejo / MZ nuevo, unidas por `identidad_legacy`), el artículo que un
 * destino D necesita puede estar hoy físicamente en un rack O que a su vez
 * es destino de otra entrada del plan. Esto arma cadenas y, a veces,
 * ciclos entre racks.
 *
 * Además, el buffer rodante físico tiene capacidad real: 2 cuerpos = 10
 * niveles POR EQUIPO activo (una fila de migracion_slots en 'vaciando' o
 * 'recolectando'), máximo 3 equipos concurrentes -- el 1ro arranca libre,
 * el 2do y el 3ro necesitan aprobación de Supervisor/Administrador (ver
 * 2026-07-17_migracion_cupo_aprobacion.sql, que hace cumplir esto mismo a
 * nivel de base). Este módulo simula el mismo cupo para sugerir un orden
 * que no proponga arrancar más equipos de los que realmente entran.
 *
 * Simplificación explícita (documentada, no un bug): cada "oleada" asume
 * que, para cuando arranca, las oleadas anteriores ya avanzaron lo
 * suficiente como para volver a la línea base de equipos REALMENTE activos
 * ahora mismo -- no intenta modelar tiempo continuo ni acumular cupo entre
 * oleadas. Es una herramienta de sugerencia para un humano que igual puede
 * desviarse del orden, no un solver óptimo exacto (problema NP-hard en
 * general -- no vale la pena para una herramienta advisory).
 */

// Todas las sub-posiciones reales de identidad_legacy tienen subnivel=1 hoy
// (misma convención que migracionBuffer.service.js/SUBNIVEL_UNICO) -- no hay
// UI para elegir otro, se fija acá también para no duplicar un valor mágico.
const SUBNIVEL_UNICO = 1;

function claveSlot(pasillo, columna) {
  return `${pasillo}|${columna}`;
}

/** Prerequisito satisfecho: el slot origen ya sacó su contenido (recolectando en adelante) -- 'vaciando' NO alcanza, se marca al iniciar, antes de que el artículo esté realmente afuera del rack. */
const ESTADOS_ORIGEN_SATISFECHO = new Set(['recolectando', 'bloqueado', 'confirmado']);
const ESTADOS_YA_ACTIVOS = new Set(['vaciando', 'recolectando']);
const ESTADOS_YA_INICIADOS = new Set(['esperando_aprobacion', 'vaciando', 'recolectando', 'bloqueado', 'confirmado']);

/**
 * Grafo de dependencias entre racks destino -- la pieza compartida entre
 * `planificarSecuencia` (simulación completa, con oleadas y cupo) y
 * `evaluarListoParaIniciar` (chequeo puntual de UN rack, el que gatea el
 * botón "Iniciar traslado" en el mapa real). Nunca se duplica esta lógica.
 *
 * @param {Array<{mzPasillo, mzColumna, rclCodigo, rclNivel, articulo}>} movimientosPendientes
 * @param {Array<{mzPasillo, mzColumna, mzNivel, mzSubnivel, rclCodigo, rclNivel, rclSubnivel, estadoRcl}>} identidadLegacy
 * @param {Map<string, {estado}>} slotsActuales
 */
function construirGrafoDependencias(movimientosPendientes, identidadLegacy, slotsActuales) {
  // 1) Índice reverso RCL -> MZ (mismo subnivel único que resolverOrigenRcl).
  const mzPorRclSubposicion = new Map();
  for (const fila of identidadLegacy) {
    if (fila.estadoRcl !== 'asignado' || fila.rclCodigo == null) continue;
    if (Number(fila.rclSubnivel) !== SUBNIVEL_UNICO) continue;
    mzPorRclSubposicion.set(`${fila.rclCodigo}|${Number(fila.rclNivel)}`, { mzPasillo: fila.mzPasillo, mzColumna: fila.mzColumna });
  }

  // 2) Destinos del plan pendiente.
  const destinos = new Set(movimientosPendientes.map(m => claveSlot(m.mzPasillo, m.mzColumna)));

  // 3) Grafo de dependencias: destino -> Set(origen) sin resolver todavía;
  // origen -> Set(destino) que desbloquea (para el desempate por grado de
  // salida); origen -> Set(nivel) que entrega (para el desempate de ciclos).
  const dependenciasPendientes = new Map();
  const desbloquea = new Map();
  const nivelesDeOrigen = new Map();
  for (const clave of destinos) dependenciasPendientes.set(clave, new Set());

  for (const m of movimientosPendientes) {
    const destinoClave = claveSlot(m.mzPasillo, m.mzColumna);
    const origenMz = mzPorRclSubposicion.get(`${m.rclCodigo}|${Number(m.rclNivel)}`);
    if (!origenMz) continue; // origen no identificado todavía -- no bloquea nada, disponible siempre
    const origenClave = claveSlot(origenMz.mzPasillo, origenMz.mzColumna);
    if (origenClave === destinoClave) continue; // auto-loop: vaciar->recolectar del MISMO slot, no una dependencia cruzada
    if (!destinos.has(origenClave)) continue; // el origen no es destino de NADA en este plan -- siempre disponible

    const estadoOrigenActual = slotsActuales.get(origenClave)?.estado;
    if (!ESTADOS_ORIGEN_SATISFECHO.has(estadoOrigenActual)) {
      dependenciasPendientes.get(destinoClave).add(origenClave);
    }
    if (!desbloquea.has(origenClave)) desbloquea.set(origenClave, new Set());
    desbloquea.get(origenClave).add(destinoClave);
    if (!nivelesDeOrigen.has(origenClave)) nivelesDeOrigen.set(origenClave, new Set());
    nivelesDeOrigen.get(origenClave).add(Number(m.rclNivel));
  }

  return { destinos, dependenciasPendientes, desbloquea, nivelesDeOrigen };
}

/**
 * Chequeo puntual: ¿este UN rack está listo para "Iniciar traslado" ahora
 * mismo? A diferencia de `planificarSecuencia` (que arma toda la
 * secuencia sugerida), esto es lo que gatea el botón real del operador en
 * el mapa -- pedido explícito del usuario: elegir libremente qué rack
 * empezar sin este chequeo le "quita potestad" a la coordinación entre
 * equipos trabajando en simultáneo (dos equipos podían elegir racks que se
 * necesitan mutuamente en el orden equivocado, y nada lo impedía). No mira
 * cupo de equipos (eso ya lo hace el trigger de la base) -- solo
 * dependencias entre racks.
 *
 * @returns {{ listo: boolean, bloqueadoPor: Array<{mzPasillo, mzColumna}> }}
 */
export function evaluarListoParaIniciar(mzPasillo, mzColumna, movimientosPendientes, identidadLegacy, slotsActuales) {
  const clave = claveSlot(mzPasillo, mzColumna);
  const { dependenciasPendientes } = construirGrafoDependencias(movimientosPendientes, identidadLegacy, slotsActuales);
  const pendientes = [...(dependenciasPendientes.get(clave) ?? [])];
  return {
    listo: pendientes.length === 0,
    bloqueadoPor: pendientes.map(p => {
      const [pasillo, columnaTxt] = p.split('|');
      return { mzPasillo: pasillo, mzColumna: Number(columnaTxt) };
    }),
  };
}

/**
 * @param {Array<{mzPasillo, mzColumna, rclCodigo, rclNivel, articulo}>} movimientosPendientes -- migracionMovimientosService.listarPendientesParaSecuencia()
 * @param {Array<{mzPasillo, mzColumna, mzNivel, mzSubnivel, rclCodigo, rclNivel, rclSubnivel, estadoRcl}>} identidadLegacy -- identidadLegacyService.listar()
 * @param {Map<string, {estado}>} slotsActuales -- migracionSlotsService.listar() (clave "pasillo|columna")
 * @param {{capacidadMax?: number}} opciones
 * @returns {{ oleadas: Array<Array<{mzPasillo, mzColumna, requiereAprobacion, rompeCiclo, libera: number, nivelesPropios: number}>>, equiposActivosIniciales: number, advertencias: string[] }}
 *   `libera`: cuántos otros racks quedan un paso más cerca de poder arrancar una vez que ESTE se vacía (grado de salida).
 *   `nivelesPropios`: cuántos niveles de origen distintos entrega este rack a otros -- proxy de cuánto tiempo/volumen de buffer implica.
 */
export function planificarSecuencia(movimientosPendientes, identidadLegacy, slotsActuales, opciones = {}) {
  const capacidadMax = opciones.capacidadMax ?? 3;
  const advertencias = [];

  const { destinos, dependenciasPendientes, desbloquea, nivelesDeOrigen } = construirGrafoDependencias(movimientosPendientes, identidadLegacy, slotsActuales);

  // 4) Solo se sugiere iniciar lo que todavía no se inició (pendiente real).
  const candidatos = new Set([...destinos].filter(c => !ESTADOS_YA_INICIADOS.has(slotsActuales.get(c)?.estado)));

  // 5) Línea base de equipos ya activos (real, no simulado).
  const equiposActivosIniciales = [...slotsActuales.values()].filter(s => ESTADOS_YA_ACTIVOS.has(s.estado)).length;

  if (equiposActivosIniciales >= capacidadMax) {
    advertencias.push(`Cupo lleno ahora mismo (${equiposActivosIniciales} equipos activos) -- no se puede sugerir un inicio nuevo hasta que se libere uno.`);
    return { oleadas: [], equiposActivosIniciales, advertencias };
  }

  function ordenarListos(claves) {
    return [...claves].sort((a, b) => {
      const salidaA = desbloquea.get(a)?.size ?? 0;
      const salidaB = desbloquea.get(b)?.size ?? 0;
      if (salidaB !== salidaA) return salidaB - salidaA; // más dependientes primero -- acorta la cadena total
      return a.localeCompare(b); // desempate determinístico
    });
  }

  /** Ordena candidatos forzados por MENOS niveles propios primero (menor riesgo/tiempo de buffer) -- a diferencia de ordenarListos (que prioriza desbloquear más), acá se prioriza minimizar cuánto tiempo va a quedar cada uno ocupando el buffer. */
  function ordenarParaForzar(claves) {
    return [...claves].sort((a, b) => {
      const nivelesA = nivelesDeOrigen.get(a)?.size ?? 0;
      const nivelesB = nivelesDeOrigen.get(b)?.size ?? 0;
      if (nivelesA !== nivelesB) return nivelesA - nivelesB;
      return a.localeCompare(b);
    });
  }

  const restantes = new Set(candidatos);
  const oleadas = [];
  const cupoDisponible = capacidadMax - equiposActivosIniciales;
  let totalRompeCiclo = 0;
  let guardia = candidatos.size + 1; // cota dura -- nunca debería hacer falta, protege contra un bug de lógica

  while (restantes.size > 0 && guardia-- > 0) {
    let listos = [...restantes].filter(c => (dependenciasPendientes.get(c)?.size ?? 0) === 0);
    let forzados = new Set();

    if (listos.length === 0) {
      // Nada tiene sus prerequisitos resueltos. Puede ser un ciclo REAL
      // entre candidatos planificables (todas sus dependencias pendientes
      // son también miembros de `restantes` -- forzando uno se destraba el
      // resto), o puede ser que lo que queda esté bloqueado por algo YA en
      // curso afuera de esta simulación (ej. un slot real todavía en
      // 'vaciando', ver ESTADOS_ORIGEN_SATISFECHO) -- eso NO es un ciclo
      // para romper, es esperar a que ese equipo termine solo.
      const enCicloInterno = [...restantes].filter(c =>
        [...(dependenciasPendientes.get(c) ?? [])].every(dep => restantes.has(dep))
      );
      if (enCicloInterno.length === 0) {
        advertencias.push(`${restantes.size} rack(s) quedan esperando a que termine un equipo ya en curso (fuera de esta simulación).`);
        break;
      }
      // Se fuerza un LOTE entero (hasta el cupo disponible), no uno solo --
      // con datos reales suele haber decenas de racks igual de "trabados
      // entre sí"; forzarlos de a uno hacía que cada oleada tuviera un solo
      // rack (ver feedback real: "esto me da cientos de oleadas de 1").
      listos = ordenarParaForzar(enCicloInterno).slice(0, Math.max(cupoDisponible, 1));
      forzados = new Set(listos);
    }

    listos = ordenarListos(listos);
    const tomados = listos.slice(0, Math.max(cupoDisponible, 0));
    if (tomados.length === 0) {
      // No hay cupo ni para el primero de esta vuelta -- no puede pasar con
      // la guardia de equiposActivosIniciales>=capacidadMax de más arriba,
      // pero se protege igual en vez de girar en vacío.
      advertencias.push('Sin cupo disponible para seguir sugiriendo -- el resto queda pendiente de una próxima simulación.');
      break;
    }

    totalRompeCiclo += tomados.filter(c => forzados.has(c)).length;
    oleadas.push(tomados.map((clave, i) => {
      const [mzPasillo, mzColumnaTxt] = clave.split('|');
      return {
        mzPasillo, mzColumna: Number(mzColumnaTxt),
        requiereAprobacion: (equiposActivosIniciales + i) >= 1,
        rompeCiclo: forzados.has(clave),
        libera: desbloquea.get(clave)?.size ?? 0,
        nivelesPropios: nivelesDeOrigen.get(clave)?.size ?? 0,
      };
    }));

    for (const clave of tomados) {
      restantes.delete(clave);
      for (const dependiente of desbloquea.get(clave) ?? []) {
        dependenciasPendientes.get(dependiente)?.delete(clave);
      }
    }
  }

  if (totalRompeCiclo > 0) {
    advertencias.unshift(`${totalRompeCiclo} de ${oleadas.flat().length} rack(s) sugeridos forman parte de bloques de racks interdependientes (marcados abajo) -- van a necesitar mantener su contenido en el buffer más tiempo del normal.`);
  }

  return { oleadas, equiposActivosIniciales, advertencias };
}
