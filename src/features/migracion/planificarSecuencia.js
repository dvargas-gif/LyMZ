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
 * 2026-07-22: el usuario mencionó un cambio físico (3 pares de carritos
 * pegados) pero dio dos descripciones que no cerraban entre sí sobre si
 * eso sube el cupo a 6 equipos o lo deja en 3 equipos de 10 niveles cada
 * uno -- NO se cambió este número hasta tener una respuesta sin ambigüedad
 * (ver conversación), para no arriesgar una sobrecarga real de buffer.
 *
 * Simplificación explícita (documentada, no un bug): cada "oleada" asume
 * que, para cuando arranca, las oleadas anteriores ya avanzaron lo
 * suficiente como para volver a la línea base de equipos REALMENTE activos
 * ahora mismo -- no intenta modelar tiempo continuo ni acumular cupo entre
 * oleadas. Es una herramienta de sugerencia para un humano que igual puede
 * desviarse del orden, no un solver óptimo exacto (problema NP-hard en
 * general -- no vale la pena para una herramienta advisory).
 *
 * Ajuste 2026-07-22 (pedido explícito, verificado antes de tocar el
 * trigger de cupo real -- ver 2026-07-22_cupo_ignora_racks_vacios.sql):
 * el cupo de 3 protege el BUFFER FÍSICO, no el trabajo en sí -- un rack que
 * hoy ya está vacío (nada real para sacar bajo su vieja identidad RCL)
 * nunca ocupa un carro de buffer, así que no tiene sentido que compita por
 * el mismo cupo que un rack de verdad lleno. `opciones.racksSinContenido`
 * (Set opcional de "pasillo|columna") deja pasar esos racks SIEMPRE, sin
 * importar cuánto cupo quede -- el resto de los candidatos sigue exactamente
 * igual que antes. Sin este parámetro (el caso de todos los llamadores
 * existentes hoy), el comportamiento es IDÉNTICO al de antes de este ajuste.
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
 * Umbrales de dificultad (pedido explícito 2026-08-20 -- "clasificarlo de
 * fácil, normal o difícil, así se sabe de antemano") -- reglas como datos
 * (Ley 8), nunca un número mágico dentro de `clasificarDificultad`. Sobre
 * los mismos 2 ejes que ya mide el motor: `libera` (a cuántos destinos
 * distintos alimenta este origen) y `nivelesPropios` (cuánto volumen propio
 * entrega -- proxy de tiempo/espacio de buffer).
 */
export const UMBRAL_DIFICULTAD = {
  facil: { libera: 1, nivelesPropios: 1 }, // 1 origen -> a lo sumo 1 destino, un solo nivel de contenido
  normal: { libera: 3, nivelesPropios: 3 },
  // cualquier cosa por encima de "normal" es "dificil" -- sin techo propio.
};

/** Clasifica un rack por su complejidad real, no por si está listo o bloqueado -- un rack "difícil" sigue siendo "difícil" aunque hoy nadie lo esté considerando para la próxima oleada. */
export function clasificarDificultad(libera, nivelesPropios) {
  if (libera <= UMBRAL_DIFICULTAD.facil.libera && nivelesPropios <= UMBRAL_DIFICULTAD.facil.nivelesPropios) return 'facil';
  if (libera <= UMBRAL_DIFICULTAD.normal.libera && nivelesPropios <= UMBRAL_DIFICULTAD.normal.nivelesPropios) return 'normal';
  return 'dificil';
}

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

    // Se registra SIEMPRE, sea o no el origen destino de algo en este plan --
    // un origen "hub puro" (alimenta a otros pero nadie le manda nada a él)
    // igual tiene que contar para calcularDificultadPorRack (ADR-020,
    // 2026-08-20). Antes esto quedaba adentro del `if` de abajo y un hub puro
    // nunca se registraba en `desbloquea`/`nivelesDeOrigen`.
    if (!desbloquea.has(origenClave)) desbloquea.set(origenClave, new Set());
    desbloquea.get(origenClave).add(destinoClave);
    if (!nivelesDeOrigen.has(origenClave)) nivelesDeOrigen.set(origenClave, new Set());
    nivelesDeOrigen.get(origenClave).add(Number(m.rclNivel));

    if (!destinos.has(origenClave)) continue; // el origen no es destino de NADA en este plan -- siempre disponible, nunca genera una dependencia pendiente
    const estadoOrigenActual = slotsActuales.get(origenClave)?.estado;
    if (!ESTADOS_ORIGEN_SATISFECHO.has(estadoOrigenActual)) {
      dependenciasPendientes.get(destinoClave).add(origenClave);
    }
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
 * Clasifica TODOS los racks destino del plan (`fácil`/`normal`/`difícil`),
 * corriendo el grafo de dependencias UNA sola vez -- pedido explícito
 * 2026-08-20: "que se sepa de antemano, no un recálculo del motor cada vez
 * que considere una nueva ruta o haga un presupuesto de planes". A
 * diferencia de `planificarSecuencia` (que solo asigna libera/dificultad a
 * los racks que entraron en alguna oleada), esto devuelve TODOS -- incluso
 * los bloqueados hoy por una dependencia, o los que nunca se van a
 * considerar en la próxima simulación -- para que una pantalla pueda
 * mostrar "este rack es difícil" sin tener que simular una secuencia
 * completa primero. Quien llama decide cuándo recalcular (ej. una vez
 * después de "Calcular plan de recolección", no en cada interacción).
 *
 * @param {Array<{mzPasillo, mzColumna, rclCodigo, rclNivel, articulo}>} movimientosPendientes
 * @param {Array<{mzPasillo, mzColumna, mzNivel, mzSubnivel, rclCodigo, rclNivel, rclSubnivel, estadoRcl}>} identidadLegacy
 * @param {Map<string, {estado}>} [slotsActuales]
 * @returns {Array<{mzPasillo, mzColumna, libera, nivelesPropios, dificultad}>}
 */
export function calcularDificultadPorRack(movimientosPendientes, identidadLegacy, slotsActuales = new Map()) {
  const { destinos, desbloquea, nivelesDeOrigen } = construirGrafoDependencias(movimientosPendientes, identidadLegacy, slotsActuales);
  // Union con las claves de `desbloquea` -- un rack que SOLO es origen (nunca
  // destino de nada en este plan, ej. un "hub" que alimenta a otros pero
  // nadie le manda nada a él) no está en `destinos`, pero sigue siendo un
  // rack real cuya dificultad hace falta conocer de antemano.
  const todosLosRacks = new Set([...destinos, ...desbloquea.keys()]);
  return [...todosLosRacks].map(clave => {
    const [mzPasillo, mzColumnaTxt] = clave.split('|');
    const libera = desbloquea.get(clave)?.size ?? 0;
    const nivelesPropios = nivelesDeOrigen.get(clave)?.size ?? 0;
    return { mzPasillo, mzColumna: Number(mzColumnaTxt), libera, nivelesPropios, dificultad: clasificarDificultad(libera, nivelesPropios) };
  });
}

/**
 * @param {Array<{mzPasillo, mzColumna, rclCodigo, rclNivel, articulo}>} movimientosPendientes -- migracionMovimientosService.listarPendientesParaSecuencia()
 * @param {Array<{mzPasillo, mzColumna, mzNivel, mzSubnivel, rclCodigo, rclNivel, rclSubnivel, estadoRcl}>} identidadLegacy -- identidadLegacyService.listar()
 * @param {Map<string, {estado}>} slotsActuales -- migracionSlotsService.listar() (clave "pasillo|columna")
 * @param {{capacidadMax?: number, racksSinContenido?: Set<string>}} opciones -- `racksSinContenido`: claves
 *   "pasillo|columna" de racks que HOY no tienen contenido real para vaciar (ver contenidoActualDeRacks() en
 *   generarLoteDespacho.js) -- entran a la oleada sin consumir cupo, nunca requieren aprobación.
 * @returns {{ oleadas: Array<Array<{mzPasillo, mzColumna, requiereAprobacion, rompeCiclo, libera: number, nivelesPropios: number, dificultad: 'facil'|'normal'|'dificil'}>>, equiposActivosIniciales: number, advertencias: string[] }}
 *   `libera`: cuántos otros racks quedan un paso más cerca de poder arrancar una vez que ESTE se vacía (grado de salida).
 *   `nivelesPropios`: cuántos niveles de origen distintos entrega este rack a otros -- proxy de cuánto tiempo/volumen de buffer implica.
 */
export function planificarSecuencia(movimientosPendientes, identidadLegacy, slotsActuales, opciones = {}) {
  const capacidadMax = opciones.capacidadMax ?? 3;
  const racksSinContenido = opciones.racksSinContenido ?? new Set();
  const advertencias = [];

  const { destinos, dependenciasPendientes, desbloquea, nivelesDeOrigen } = construirGrafoDependencias(movimientosPendientes, identidadLegacy, slotsActuales);

  // 4) Solo se sugiere iniciar lo que todavía no se inició (pendiente real).
  const candidatos = new Set([...destinos].filter(c => !ESTADOS_YA_INICIADOS.has(slotsActuales.get(c)?.estado)));

  // 5) Línea base de equipos ya activos (real, no simulado).
  const equiposActivosIniciales = [...slotsActuales.values()].filter(s => ESTADOS_YA_ACTIVOS.has(s.estado)).length;

  if (equiposActivosIniciales >= capacidadMax) {
    advertencias.push(`Cupo lleno ahora mismo (${equiposActivosIniciales} equipos activos) -- no se puede sugerir un inicio nuevo hasta que se libere uno.`);
    // Con cupo lleno, los racks que SÍ necesitan buffer no tienen a dónde
    // ir -- pero un rack sin contenido real no compite por ese mismo
    // recurso, así que si hay alguno, igual vale la pena seguir armando la
    // oleada solo con esos (ver racksSinContenido más abajo).
    if (racksSinContenido.size === 0) {
      return { oleadas: [], equiposActivosIniciales, advertencias };
    }
  }

  /**
   * Prioriza SIMPLICIDAD, no impacto teórico (corrección de fondo 2026-08-20,
   * pedido explícito -- ver DECISIONES.md). Antes ordenaba por "más
   * dependientes primero" (mayor `libera`) para acortar la cadena total en
   * el papel -- pero eso elegía a propósito, primero, los orígenes más
   * enredados: un rack RCL compartido por 14 artículos yendo a 11 destinos
   * MZ distintos SÍ "desbloquea más cosas", pero es exactamente el peor
   * primer movimiento real para un operador (múltiples artículos, múltiples
   * destinos, nada simple). Ahora: menos destinos que desbloquea primero
   * (el caso más simple, 1 origen -> 1 destino, arranca antes que un hub),
   * y entre empatados, menos volumen propio (`nivelesPropios` -- menos
   * tiempo/espacio de buffer). El costo real: la cadena total puede tardar
   * más oleadas en resolverse del todo -- se acepta a cambio de que el
   * trabajo de cada oleada sea predecible para quien lo hace.
   */
  function ordenarListos(claves) {
    return [...claves].sort((a, b) => {
      const salidaA = desbloquea.get(a)?.size ?? 0;
      const salidaB = desbloquea.get(b)?.size ?? 0;
      if (salidaA !== salidaB) return salidaA - salidaB; // menos destinos desbloqueados primero -- el más simple, no el más "eficiente" en el papel
      const nivelesA = nivelesDeOrigen.get(a)?.size ?? 0;
      const nivelesB = nivelesDeOrigen.get(b)?.size ?? 0;
      if (nivelesA !== nivelesB) return nivelesA - nivelesB; // empatados en destinos -- el que entrega menos volumen propio
      return a.localeCompare(b); // desempate determinístico
    });
  }

  /** Ordena candidatos forzados por MENOS niveles propios primero (menor riesgo/tiempo de buffer) -- mismo criterio de simplicidad que ordenarListos, pero acá el desempate por `libera` no aplica (todos son parte del mismo ciclo forzado). */
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

    // Racks sin contenido real HOY (no consumen cupo, ver opciones.racksSinContenido
    // más arriba) entran SIEMPRE -- el resto sigue exactamente igual que antes,
    // limitado a `cupoDisponible`. Con racksSinContenido vacío (default), `libres`
    // siempre es [] y `tomadosConCupo` es idéntico al `tomados` de antes de este ajuste.
    const libres = listos.filter(c => racksSinContenido.has(c));
    const necesitanCupo = listos.filter(c => !racksSinContenido.has(c));
    const tomadosConCupo = necesitanCupo.slice(0, Math.max(cupoDisponible, 0));
    const tomados = [...libres, ...tomadosConCupo];

    if (tomados.length === 0) {
      // No hay cupo ni para el primero de esta vuelta (y ningún rack libre
      // pendiente) -- no puede pasar con la guardia de
      // equiposActivosIniciales>=capacidadMax de más arriba, pero se
      // protege igual en vez de girar en vacío.
      advertencias.push('Sin cupo disponible para seguir sugiriendo -- el resto queda pendiente de una próxima simulación.');
      break;
    }

    totalRompeCiclo += tomados.filter(c => forzados.has(c)).length;
    const objeto = (clave, requiereAprobacion) => {
      const [mzPasillo, mzColumnaTxt] = clave.split('|');
      const libera = desbloquea.get(clave)?.size ?? 0;
      const nivelesPropios = nivelesDeOrigen.get(clave)?.size ?? 0;
      return {
        mzPasillo, mzColumna: Number(mzColumnaTxt), requiereAprobacion,
        rompeCiclo: forzados.has(clave),
        libera, nivelesPropios,
        dificultad: clasificarDificultad(libera, nivelesPropios),
      };
    };
    oleadas.push([
      ...libres.map(clave => objeto(clave, false)), // nunca requieren aprobación -- no tocan el cupo de buffer
      ...tomadosConCupo.map((clave, i) => objeto(clave, (equiposActivosIniciales + i) >= 1)),
    ]);

    for (const clave of tomados) {
      restantes.delete(clave);
      for (const dependiente of desbloquea.get(clave) ?? []) {
        dependenciasPendientes.get(dependiente)?.delete(clave);
      }
    }
  }

  if (totalRompeCiclo > 0) {
    advertencias.unshift(`${totalRompeCiclo} de ${oleadas.flat().length} rack(s) sugeridos forman parte de bloques de racks interdependientes (marcados abajo) -- van a necesitar mantener su contenido en el carrito de traslado más tiempo del normal.`);
  }

  return { oleadas, equiposActivosIniciales, advertencias };
}
