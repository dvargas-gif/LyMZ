import { supabase } from '../shared/services/supabaseClient.js';
import { inventarioService } from '../shared/services/inventario.service.js';
import { posicionesService } from '../shared/services/posiciones.service.js';
import { articulosService } from '../shared/services/articulos.service.js';
import { bloqueosService } from '../shared/services/bloqueos.service.js';
import { posicionesEliminadasService } from '../shared/services/posicionesEliminadas.service.js';
import { configMapaService } from '../shared/services/configMapa.service.js';
import { pasillosConfigService } from '../shared/services/pasillosConfig.service.js';
import { escenarioPosicionesService } from '../features/salas/escenarioPosiciones.service.js';
import { escenarioEliminadosService } from '../features/salas/escenarioEliminados.service.js';
import { escenarioBloqueosService } from '../features/salas/escenarioBloqueos.service.js';
import { auditService } from '../features/auditoria/audit.service.js';
import { migracionBufferService } from '../shared/services/migracionBuffer.service.js';
import { resolverPosicionesActuales } from './resolverPosicionesActuales.js';
import { agruparPorRack } from './agruparPorRack.js';
import { nArts, nivelesOcupados, consumoTotal, llenura, colorLlenura } from './formulasOcupacion.js';
import { CONFIGURACION_OCUPACION_DEFAULT } from './configuracionOcupacion.js';
// WarehouseSnapshot.js importa 'zod' -- import DINÁMICO a propósito, para
// que ningún consumidor que solo necesita el modelo (ej. reporte.service.js,
// que solo usa esto para la suscripción Realtime) cargue Zod sin pedirlo.
// Sin esto, Vite agrupaba Zod dentro de un chunk compartido con Carga
// Masiva/Salas -- features que nunca llaman a snapshot() -- detectado al
// comparar tamaños de build antes/después (ver PROGRESO.md sesión G1d).

/**
 * Fuente de datos real: envuelve los *.service.js existentes -- nunca
 * reimplementa acceso a Supabase (mandato explícito de G1d). Es lo mismo que
 * ya hacía reporte.service.js con escenarioId, solo que ahora vive en un
 * solo lugar del que cualquier consumidor futuro (Dashboard, mapa bridge,
 * Reportes) puede depender sin duplicar el switch real/sala.
 *
 * La suscripción Realtime es EXACTAMENTE la que tenía reporte.service.js
 * (mismos canales, mismas tablas) -- movida acá, ver DECISIONES.md y
 * PROGRESO.md sesión G1d. reporte.service.js ya no abre su propio canal.
 */
function crearServiciosReales(escenarioId) {
  return {
    async listarBase() { return inventarioService.listar(); },
    async listarMovimientos() { return escenarioId ? escenarioPosicionesService.listar(escenarioId) : posicionesService.listar(); },
    // Antes esto era siempre [] para el mapa real -- no existía forma de
    // "eliminar" un artículo fuera de una sala (ver posicionesEliminadas.service.js).
    async listarEliminados() { return escenarioId ? escenarioEliminadosService.listar(escenarioId) : posicionesEliminadasService.listar(); },
    async listarDescripciones() { return articulosService.listarDescripciones(); },
    async listarBloqueos() { return escenarioId ? escenarioBloqueosService.listar(escenarioId) : bloqueosService.listar(); },
    // Una sala de simulación nunca genera auditoría real (ver PROTOCOLO-MAPA.md).
    async listarMovimientosHistoricos() { return escenarioId ? [] : auditService.listar({}); },
    // El buffer de migración (F2) SOLO existe para el mapa real -- migracion_buffer
    // no tiene escenario_id (decisión explícita, ver DECISIONES.md ADR-015 y
    // la sesión de F2: no tiene sentido simular una migración física única).
    // Una sala simplemente no tiene artículos en tránsito, nunca [].
    async listarEnBuffer() { return escenarioId ? [] : migracionBufferService.listarArticulosSinResolver(); },
    // Tema/orientación y el límite de columnas por pasillo son globales -- NO
    // dependen de escenarioId (una sala usa el mismo croquis "de fábrica" que
    // el mapa real, ver mensajesMapa.js). Mismo fallback que ya tenía
    // mensajesMapa.js si config_mapa todavía no tiene fila.
    async listarConfiguracionMapa() { return configMapaService.obtener().catch(() => ({ tema: 'claro', orientacion: 'horizontal' })); },
    async listarPasillosConfig() { return pasillosConfigService.listar(); },
    suscribirCambios(callback) {
      const canal = escenarioId
        ? supabase
            .channel(`reporte-escenario-${escenarioId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'escenario_posiciones', filter: `escenario_id=eq.${escenarioId}` }, callback)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'escenario_eliminados', filter: `escenario_id=eq.${escenarioId}` }, callback)
            .subscribe()
        : supabase
            .channel('reporte-posiciones')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posiciones_actuales' }, callback)
            .subscribe();
      return () => supabase.removeChannel(canal);
    },
  };
}

/**
 * Crea un WarehouseModel. Representa indistintamente "el mapa real"
 * (escenarioId=null) o "una sala de simulación" (escenarioId=<id>) -- son la
 * MISMA forma, nunca un padre con hijos anidados (ver nota de la sesión G1d:
 * no existe una jerarquía física de salas en el schema real).
 *
 * `servicios` es inyectable a propósito: en producción se usa
 * crearServiciosReales(); en tests se pasan fixtures/fakes (ver
 * crearWarehouseModel.test.js) sin tocar red ni Supabase.
 */
export function crearWarehouseModel({ escenarioId = null, servicios, configuracionOcupacion = CONFIGURACION_OCUPACION_DEFAULT } = {}) {
  const fuente = servicios || crearServiciosReales(escenarioId);
  const listeners = new Set();
  let desuscribirRealtime = null;

  const estado = {
    posiciones: [],
    bloqueos: [],
    descripciones: new Map(),
    movimientos: [],
    configuracionMapa: { tema: 'claro', orientacion: 'horizontal' },
    maxColumnas: {},
  };

  function notificar() {
    for (const cb of listeners) cb(modelo);
  }

  /** Garantiza que el canal Realtime esté abierto, SIN forzar una recarga completa de datos -- lo usa cargar() y también quien solo necesita "avisame cuando cambie" (ej. reporte.service.js). */
  function asegurarSuscripcion() {
    if (!desuscribirRealtime && fuente.suscribirCambios) {
      desuscribirRealtime = fuente.suscribirCambios(() => cargarTodo());
    }
  }

  async function cargarTodo() {
    const [base, movidas, eliminados, descripciones, bloqueosRaw, movimientos, configuracionMapa, pasillosConfig, enBuffer] = await Promise.all([
      fuente.listarBase(),
      fuente.listarMovimientos(),
      fuente.listarEliminados(),
      fuente.listarDescripciones(),
      fuente.listarBloqueos(),
      fuente.listarMovimientosHistoricos(),
      fuente.listarConfiguracionMapa(),
      fuente.listarPasillosConfig(),
      fuente.listarEnBuffer(),
    ]);
    estado.posiciones = resolverPosicionesActuales(base, movidas, eliminados, enBuffer);
    estado.bloqueos = bloqueosRaw.map(b => b.rack_key);
    estado.descripciones = new Map(descripciones.map(d => [d.articulo, d.descripcion]));
    estado.movimientos = movimientos;
    estado.configuracionMapa = configuracionMapa;
    estado.maxColumnas = Object.fromEntries(pasillosConfig.map(p => [p.pasillo, p.max_columna]));
    notificar();
  }

  /**
   * Trae SOLO el histórico de auditoría, sin forzar la recarga completa de
   * posiciones/bloqueos/descripciones -- lo usa Productividad (G1e), que
   * antes solo pedía auditService.listar({}) y nada más. Forzar un
   * cargarTodo() completo ahí habría sido una regresión de red real (5
   * fetches nuevos que Productividad nunca necesitó), no una mejora.
   */
  async function cargarMovimientos() {
    estado.movimientos = await fuente.listarMovimientosHistoricos();
    notificar();
  }

  const modelo = {
    escenarioId,
    configuracionOcupacion,

    /** Carga inicial + arranca la suscripción Realtime (una sola vez, aunque se llame de nuevo). */
    async cargar() {
      await cargarTodo();
      asegurarSuscripcion();
      return modelo;
    },

    /** Solo garantiza la suscripción Realtime -- no carga datos. Lo usa reporte.service.js (ver ADR-008). */
    asegurarSuscripcion,

    /** Reconstrucción total desde cero -- vuelve a pedir todo, sin asumir nada del estado anterior. */
    async recargarTodo() {
      await cargarTodo();
      return modelo;
    },

    /** Trae solo el histórico de auditoría (ver nota arriba de cargarMovimientos). */
    async cargarMovimientos() {
      await cargarMovimientos();
      return modelo;
    },

    posiciones() { return estado.posiciones; },
    bloqueos() { return estado.bloqueos; },
    estaBloqueado(rackKey) { return estado.bloqueos.includes(rackKey); },
    descripcion(articulo) { return estado.descripciones.get(articulo) || 'Sin descripción disponible'; },
    /** Lista cruda [{articulo,descripcion}] -- SIN el fallback de descripcion(), para quien necesite reconstruir el formato original (ej. el bridge del mapa). */
    descripciones() { return [...estado.descripciones.entries()].map(([articulo, descripcion]) => ({ articulo, descripcion })); },
    movimientos() { return estado.movimientos; },
    /** Tema/orientación del croquis -- global, no depende de escenarioId. */
    configuracionMapa() { return estado.configuracionMapa; },
    /** {pasillo: max_columna} -- hasta qué columna dibuja cada pasillo. */
    maxColumnas() { return estado.maxColumnas; },

    /** Derivado: agrupación por rack (Map, nunca persistido -- Ley 3). */
    racks() { return agruparPorRack(estado.posiciones); },
    rack(pasillo, columna) { return modelo.racks().get(`${pasillo}|${columna}`); },

    /** Derivado: ocupación de un rack, con las mismas fórmulas del mapa legacy. */
    ocupacionDeRack(rack) {
      const proporcion = llenura(rack, configuracionOcupacion);
      return {
        nArts: nArts(rack),
        nivelesOcupados: nivelesOcupados(rack),
        consumoTotal: consumoTotal(rack),
        llenura: proporcion,
        colorLlenura: colorLlenura(proporcion, configuracionOcupacion),
      };
    },

    /** WarehouseSnapshot v1 -- estado crudo, validado con Zod (ver WarehouseSnapshot.js). Async a propósito: Zod se carga on-demand, no en cada import del modelo. */
    async snapshot() {
      const { crearSnapshot } = await import('./WarehouseSnapshot.js');
      return crearSnapshot({
        escenarioId,
        posiciones: estado.posiciones,
        bloqueos: estado.bloqueos,
        descripciones: estado.descripciones,
        configuracionOcupacion,
        configuracionMapa: estado.configuracionMapa,
        maxColumnas: estado.maxColumnas,
      });
    },

    /** Un evento de Realtime = un recálculo = N vistas notificadas (Ley 4). */
    suscribir(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    destruir() {
      if (desuscribirRealtime) desuscribirRealtime();
      desuscribirRealtime = null;
      listeners.clear();
    },
  };

  return modelo;
}

// --- Instancia compartida por escenarioId -- Ley 4: un solo suscriptor de
// Realtime. Si dos consumidores (ej. reporte.service.js y, más adelante,
// Dashboard) pidieran cada uno su propio crearWarehouseModel(), cada uno
// abriría su propio canal -- exactamente el problema que esto resuelve.
const instancias = new Map();

export function obtenerWarehouseModel(escenarioId = null) {
  const clave = escenarioId ?? '__real__';
  if (!instancias.has(clave)) {
    instancias.set(clave, crearWarehouseModel({ escenarioId }));
  }
  return instancias.get(clave);
}

/** Solo para tests: libera las instancias compartidas entre casos. */
export function _reiniciarInstanciasParaTests() {
  for (const modelo of instancias.values()) modelo.destruir();
  instancias.clear();
}
