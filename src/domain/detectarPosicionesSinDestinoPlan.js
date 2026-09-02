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
 * Función pura, sin Supabase -- SOLO detecta y reporta, no cambia nada.
 */
import { COLUMNAS_POR_PASILLO } from '../features/mapa/canvas/posicionesEsquematicas.js';

const NIVELES_WMS = ['N01', 'N02', 'N03', 'N04', 'N05'];

/**
 * @param {Array<{mzPasillo, mzColumna, mzNivel, estado}>} movimientos -- migracionMovimientosService.listarPlanCompleto()
 * @returns {Array<{pasillo, columna, nivel}>} posiciones sin ningún destino planeado activo, ordenadas por pasillo/columna/nivel.
 */
export function detectarPosicionesSinDestinoPlan(movimientos) {
  const conDestino = new Set(); // "pasillo|columna|nivel"
  for (const m of movimientos) {
    if (m.estado === 'descartado') continue; // ya no es parte del plan vigente
    conDestino.add(`${m.mzPasillo}|${m.mzColumna}|${m.mzNivel}`);
  }

  const sinDestino = [];
  for (const pasillo of Object.keys(COLUMNAS_POR_PASILLO)) {
    const columnas = COLUMNAS_POR_PASILLO[pasillo];
    for (let columna = 1; columna <= columnas; columna++) {
      for (const nivel of NIVELES_WMS) {
        if (conDestino.has(`${pasillo}|${columna}|${nivel}`)) continue;
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
