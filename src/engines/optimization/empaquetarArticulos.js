import { CAPACIDAD_UTIL_NIVEL_M3, CAPACIDAD_UTIL_CUERPO_M3 } from './construirUniversoDeHuecos.js';
import { evaluarReglas, REGLAS_POR_DEFECTO } from './reglasDistribucion.js';
import { calcularAfinidadZonas } from './calcularAfinidadZonas.js';
import { calcularAfinidadFrecuencia } from './calcularAfinidadFrecuencia.js';
import { calcularCosto, PESOS_POR_DEFECTO } from './costoCandidato.js';

const NIVELES = ['N01', 'N02', 'N03', 'N04', 'N05'];

/**
 * El corazón del motor de distribución -- empaquetado en DOS pasadas, un
 * artículo = un hueco (nunca partido, `posiciones_actuales` tiene PK
 * `articulo`). Cada rack físico (cuerpo) se usa EXCLUSIVAMENTE de una sola
 * forma: o como un solo hueco "CUERPO" (para artículos grandes, pudiendo
 * compartirlo varios si entran juntos -- sin restricción de clase, decisión
 * confirmada) o expandido en sus 5 niveles individuales -- nunca las dos
 * cosas a la vez sobre el mismo rack físico.
 *
 * 1) Artículos con volumen > un nivel (CAPACIDAD_UTIL_NIVEL_M3) SOLO pueden
 *    vivir en un cuerpo completo -- First-Fit-Decreasing (mayor volumen
 *    primero, son los más restrictivos) sobre bins de tipo CUERPO.
 * 2) El resto entra por NIVEL, mismo FFD, sobre los cuerpos que la pasada 1
 *    NO tocó (sus 5 niveles quedan disponibles individualmente).
 *
 * En cada pasada, el candidato elegido es el de MENOR costo entre los que
 * cumplen todas las reglas duras (evaluarReglas) -- determinístico, sin
 * Math.random, mismo input siempre da mismo output (Ley 9, auditable).
 *
 * "Todos los espacios son útiles" (pedido explícito 2026-08-07): SIN
 * distancia euclídea al ascensor -- la accesibilidad real se maneja con
 * zonas de negocio explícitas (`calcularAfinidadZonas.js`: evitar
 * MZ01-C001/MZ10/MZ11/MZ12, preferir columnas 9-19 de MZ01-08), no con una
 * fórmula geométrica abstracta.
 *
 * Artículos sin dimensiones importadas se excluyen con motivo EXPLÍCITO
 * (nunca se asume volumen 0 -- mismo criterio que detectarSobrecargaRacks.js:56,
 * pero acá SÍ se reporta en vez de saltarse en silencio).
 */
export const ORDEN_POR_VOLUMEN_DESC = (a, b) => b.volumenM3 - a.volumenM3;

export function empaquetarArticulos(articulos, cuerpos, opciones = {}) {
  const {
    zonas = {}, pesos = PESOS_POR_DEFECTO, reglas = REGLAS_POR_DEFECTO,
    comparador = ORDEN_POR_VOLUMEN_DESC, // orden DENTRO de cada pasada (grandes/chicos) -- las dos pasadas en sí (cuerpo completo antes que nivel) son un límite físico, no una prioridad, y no cambian con esto.
    // Estado previo de huecos YA ocupados por una pasada anterior (motor de
    // dos fases, reservarZonaPrioritaria.js) -- clave `pasillo|columna|nivel`
    // ('CUERPO' incluido) -> {volumenOcupado, articulosDistintos: Set<string>}.
    // Sin esto, una segunda pasada sobre los mismos cuerpos pisaría lo que la
    // primera ya colocó en vez de completarlo.
    estadoInicial = new Map(),
    // Cuerpos que una pasada anterior ya consumió COMO CUERPO ENTERO -- se
    // excluyen de raíz, nunca se ofrecen como niveles (misma exclusividad
    // física que ya aplica dentro de una sola pasada).
    cuerposExcluidos = new Set(),
  } = opciones;

  const sinAsignar = [];
  const conVolumen = [];
  for (const a of articulos) {
    if (a.volumenM3 == null) sinAsignar.push({ articulo: a.articulo, motivo: 'sin_dimensiones_importadas' });
    else conVolumen.push(a);
  }

  const grandes = conVolumen.filter(a => a.volumenM3 > CAPACIDAD_UTIL_NIVEL_M3).sort(comparador);
  const chicos = conVolumen.filter(a => a.volumenM3 <= CAPACIDAD_UTIL_NIVEL_M3).sort(comparador);

  const asignaciones = [];

  const cuerposDisponibles = cuerpos.filter(c => !cuerposExcluidos.has(`${c.pasillo}|${c.columna}`));

  const binesCuerpo = cuerposDisponibles.map(c => crearBin('CUERPO', c, CAPACIDAD_UTIL_CUERPO_M3, estadoInicial));
  for (const articulo of grandes) {
    const encontrado = mejorBin(binesCuerpo, articulo, zonas, pesos, reglas);
    if (!encontrado) {
      const motivo = articulo.volumenM3 > CAPACIDAD_UTIL_CUERPO_M3 ? 'excede_capacidad_maxima_de_un_cuerpo' : 'sin_hueco_disponible';
      sinAsignar.push({ articulo: articulo.articulo, motivo });
      continue;
    }
    asignaciones.push(confirmarAsignacion(encontrado, articulo));
  }

  const cuerposUsadosComoCuerpo = new Set(binesCuerpo.filter(b => b.volumenOcupado > 0).map(b => `${b.pasillo}|${b.columna}`));
  const binesNivel = cuerposDisponibles
    .filter(c => !cuerposUsadosComoCuerpo.has(`${c.pasillo}|${c.columna}`))
    .flatMap(c => NIVELES.map(nivel => crearBin(nivel, c, CAPACIDAD_UTIL_NIVEL_M3, estadoInicial)));

  for (const articulo of chicos) {
    const encontrado = mejorBin(binesNivel, articulo, zonas, pesos, reglas);
    if (!encontrado) { sinAsignar.push({ articulo: articulo.articulo, motivo: 'sin_hueco_disponible' }); continue; }
    asignaciones.push(confirmarAsignacion(encontrado, articulo));
  }

  return { asignaciones, sinAsignar };
}

function crearBin(nivel, cuerpo, capacidadUtil, estadoInicial) {
  const clave = `${cuerpo.pasillo}|${cuerpo.columna}|${nivel}`;
  const previo = estadoInicial.get(clave);
  return {
    tipo: nivel === 'CUERPO' ? 'CUERPO' : 'NIVEL',
    pasillo: cuerpo.pasillo, columna: cuerpo.columna, nivel,
    capacidadUtil,
    volumenOcupado: previo?.volumenOcupado ?? 0,
    articulosDistintos: new Set(previo?.articulosDistintos ?? []),
  };
}

function evaluarCandidato(bin, articulo, zonas, pesos, reglas) {
  const { cumpleTodasLasDuras, resultados } = evaluarReglas(bin, articulo, reglas);
  if (!cumpleTodasLasDuras) return null;
  const utilizacionResultante = (bin.volumenOcupado + articulo.volumenM3) / bin.capacidadUtil;
  const afinidad = calcularAfinidadZonas(bin, articulo, zonas);
  const afinidadFrecuencia = calcularAfinidadFrecuencia(bin, articulo, zonas);
  const costo = calcularCosto({ utilizacionResultante, violacionesBlandas: 0, afinidad, afinidadFrecuencia }, pesos);
  return { costo, utilizacionResultante, afinidad, afinidadFrecuencia, reglasEvaluadas: resultados };
}

/** Entre todos los bins que cumplen las reglas duras, el de MENOR costo -- determinístico (orden estable, sin azar). */
function mejorBin(bins, articulo, zonas, pesos, reglas) {
  let mejor = null;
  for (const bin of bins) {
    const evaluado = evaluarCandidato(bin, articulo, zonas, pesos, reglas);
    if (evaluado && (!mejor || evaluado.costo < mejor.evaluado.costo)) mejor = { bin, evaluado };
  }
  return mejor;
}

function confirmarAsignacion({ bin, evaluado }, articulo) {
  bin.volumenOcupado += articulo.volumenM3;
  bin.articulosDistintos.add(articulo.articulo);
  return {
    articulo: articulo.articulo, pasillo: bin.pasillo, columna: bin.columna, nivel: bin.nivel,
    costo: evaluado.costo, utilizacionResultante: evaluado.utilizacionResultante, afinidad: evaluado.afinidad,
    afinidadFrecuencia: evaluado.afinidadFrecuencia,
    reglasEvaluadas: evaluado.reglasEvaluadas,
  };
}
