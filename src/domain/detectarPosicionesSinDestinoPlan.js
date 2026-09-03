/**
 * Posiciones MZ que el plan de reacomodo NUNCA usa como destino (2026-09-02,
 * pedido explícito: "quiero saber qué ubicaciones en el plan del reacomodo
 * estarán libres" -- distinto a propósito de detectarPosicionesLibres.js,
 * que mira `identidad_legacy`/`inventario_slotting` (pasado/presente). Esta
 * mira `migracion_movimientos` (el plan, hacia adelante): una posición
 * "sin destino" es una que ningún artículo tiene planeado ocupar, sin
 * importar si hoy tiene mercadería real o un RCL asignado.
 *
 * Universo completo de 12 pasillos (MZ01-MZ12) -- a diferencia de
 * detectarPosicionesLibres.js (acotado a MZ01-MZ08, el alcance de
 * identidad_legacy), el plan sí puede, en teoría, apuntar a cualquier
 * pasillo del layout real.
 *
 * Un movimiento 'descartado' NO cuenta como destino reservado -- decisión
 * explícita del usuario (2026-09-02): un movimiento descartado ya no es
 * parte del plan vigente, esa posición se reporta como sin destino.
 *
 * CORRECCIÓN EN VIVO (2026-09-03): `mz_nivel` no es siempre N01-N05 -- un
 * movimiento puede tener destino el CUERPO entero (mismo concepto que ya usa
 * detectarPosicionesLibres.js con `cuerposOcupados`), y en datos reales del
 * plan NO es un caso raro (46 de 2227 movimientos en un export real). La
 * primera versión de esta función solo comparaba contra N01-N05 -- un
 * destino CUERPO nunca hacía match contra ningún nivel, así que los 5
 * niveles de esa columna quedaban reportados como "sin destino" por error,
 * aunque el cuerpo entero ya tuviera un artículo real asignado (caso real
 * encontrado por el usuario: MZ01-C022, artículo 3525004, mz_nivel=CUERPO).
 *
 * Función pura, sin Supabase -- SOLO detecta y reporta, no cambia nada.
 */
import { COLUMNAS_POR_PASILLO } from '../features/mapa/canvas/posicionesEsquematicas.js';

const NIVELES_WMS = ['N01', 'N02', 'N03', 'N04', 'N05'];

/**
 * @param {Array<{mzPasillo, mzColumna, mzNivel, estado}>} movimientos -- migracionMovimientosService.listarPlanCompleto(), mzNivel es 'N01'..'N05' o 'CUERPO'
 * @returns {Array<{pasillo, columna, nivel}>} posiciones sin ningún destino planeado activo, ordenadas por pasillo/columna/nivel.
 */
export function detectarPosicionesSinDestinoPlan(movimientos) {
  const cuerposConDestino = new Set(); // "pasillo|columna" -- un CUERPO reserva los 5 niveles enteros
  const nivelesConDestino = new Set(); // "pasillo|columna|nivel" -- un destino normal reserva solo su nivel puntual
  for (const m of movimientos) {
    if (m.estado === 'descartado') continue; // ya no es parte del plan vigente
    if (m.mzNivel === 'CUERPO') cuerposConDestino.add(`${m.mzPasillo}|${m.mzColumna}`);
    else nivelesConDestino.add(`${m.mzPasillo}|${m.mzColumna}|${m.mzNivel}`);
  }

  const sinDestino = [];
  for (const pasillo of Object.keys(COLUMNAS_POR_PASILLO)) {
    const columnas = COLUMNAS_POR_PASILLO[pasillo];
    for (let columna = 1; columna <= columnas; columna++) {
      if (cuerposConDestino.has(`${pasillo}|${columna}`)) continue; // cuerpo entero reservado -- ningún nivel sin destino acá
      for (const nivel of NIVELES_WMS) {
        if (nivelesConDestino.has(`${pasillo}|${columna}|${nivel}`)) continue;
        sinDestino.push({ pasillo, columna, nivel });
      }
    }
  }
  return sinDestino;
}

/**
 * Agrupa el resultado por cuerpo -- mismo formato que
 * agruparPosicionesLibresPorCuerpo() en detectarPosicionesLibres.js (una
 * fila por rack, una columna por nivel N01-N05).
 *
 * @param {Array<{pasillo, columna, nivel}>} sinDestino -- salida de detectarPosicionesSinDestinoPlan()
 * @returns {Array<{pasillo, columna, N01, N02, N03, N04, N05}>}
 */
export function agruparPosicionesSinDestinoPorCuerpo(sinDestino) {
  const porRack = new Map(); // "pasillo|columna" -> { pasillo, columna, niveles: Set }
  for (const s of sinDestino) {
    const clave = `${s.pasillo}|${s.columna}`;
    if (!porRack.has(clave)) porRack.set(clave, { pasillo: s.pasillo, columna: s.columna, niveles: new Set() });
    porRack.get(clave).niveles.add(s.nivel);
  }

  const resultado = [];
  for (const { pasillo, columna, niveles } of porRack.values()) {
    const fila = { pasillo, columna };
    const codigoRack = `${pasillo}-C${String(columna).padStart(3, '0')}`;
    for (const nivel of NIVELES_WMS) {
      fila[nivel] = niveles.has(nivel) ? `${codigoRack}-${nivel}` : '';
    }
    resultado.push(fila);
  }
  return resultado;
}
