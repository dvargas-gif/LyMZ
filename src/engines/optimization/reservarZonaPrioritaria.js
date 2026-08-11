import { empaquetarArticulos, ORDEN_POR_VOLUMEN_DESC } from './empaquetarArticulos.js';
import { CAPACIDAD_UTIL_NIVEL_M3 } from './construirUniversoDeHuecos.js';
import { enRango, ZONA_ACCESIBLE_GENERAL, ZONA_OPTIMA_CLASE_A } from './calcularAfinidadZonas.js';

/**
 * Corrección de fondo (2026-08-10, verificado con datos reales): un peso de
 * afinidad alto NUNCA reserva un espacio, solo lo hace más barato -- una vez
 * abierto un nivel, cualquier otro artículo puede seguir usando lo que le
 * queda. Verificado: con reserva 100% + orden correcto, entran 180 clase A
 * en la zona óptima; con solo afinidad (por más peso que se le suba), entran
 * 17-18. El "techo físico" no existía -- era el motor.
 *
 * Esta es la reserva EXPLÍCITA (Fase 1 de 2): antes de empacar nada más, se
 * separan los cuerpos de la zona óptima/accesible del resto, y se llenan
 * PRIMERO y EXCLUSIVAMENTE con sus beneficiarios reales -- clase A en la
 * óptima, alta frecuencia (picks) en la accesible general. Orden por PICKS
 * descendente (no por volumen): la meta de negocio es garantizar el lugar a
 * quien más se pickea, no maximizar cuántos entran. Auditable: cada reserva
 * es un número documentado, no una preferencia de costo oculta.
 */
export const PERCENTIL_ALTA_FRECUENCIA_POR_DEFECTO = 0.9; // top 10% por picks

const ORDEN_POR_PICKS_DESC = (a, b) => (b.picksNormalizado ?? 0) - (a.picksNormalizado ?? 0) || ORDEN_POR_VOLUMEN_DESC(a, b);

function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.floor(p * ordenados.length));
  return ordenados[indice];
}

/**
 * @param {Array} articulos -- {articulo, volumenM3, clase, picksNormalizado}
 * @param {Array} cuerpos -- universo completo (construirUniversoDeHuecos.js)
 * @param {{zonas, percentilAltaFrecuencia}} opciones
 * @returns {{asignaciones, sinAsignar, cuerposReservadosOptima, cuerposReservadosAccesible, clavesCuerposUsados: Set<string>}}
 */
export function reservarZonaPrioritaria(articulos, cuerpos, opciones = {}) {
  const zonaOptima = opciones.zonas?.optimaClaseA ?? ZONA_OPTIMA_CLASE_A;
  const zonaAccesible = opciones.zonas?.accesibleGeneral ?? ZONA_ACCESIBLE_GENERAL;
  const percentilCorte = opciones.percentilAltaFrecuencia ?? PERCENTIL_ALTA_FRECUENCIA_POR_DEFECTO;

  const cuerposOptima = cuerpos.filter(c => enRango(c, zonaOptima));
  const cuerposAccesible = cuerpos.filter(c => enRango(c, zonaAccesible) && !enRango(c, zonaOptima));

  const umbralAltaFrecuencia = percentil(articulos.map(a => a.picksNormalizado ?? 0), percentilCorte);

  // La reserva es SOLO por nivel -- un artículo "grande" (necesita un cuerpo
  // entero) compite en la Fase 2 general sin importar su clase o frecuencia.
  // Verificado con datos reales: sin este filtro, 23 artículos grandes se
  // comían los 9 cuerpos completos de la zona óptima (MZ02) y dejaban CERO
  // niveles para los otros 700+ artículos clase A que sí entrarían -- un
  // cuerpo entero es demasiado recurso para reservarlo automáticamente.
  const candidatosOptima = articulos.filter(a => a.clase === 'A' && a.volumenM3 != null && a.volumenM3 <= CAPACIDAD_UTIL_NIVEL_M3).sort(ORDEN_POR_PICKS_DESC);
  const resultadoOptima = empaquetarArticulos(candidatosOptima, cuerposOptima, {
    pesos: { utilizacion: 1, violaciones: 5, afinidad: 0, frecuencia: 0 },
    comparador: ORDEN_POR_PICKS_DESC,
  });

  const asignadosEnOptima = new Set(resultadoOptima.asignaciones.map(a => a.articulo));
  const candidatosAccesible = articulos
    .filter(a => a.clase !== 'A' && a.volumenM3 != null && a.volumenM3 <= CAPACIDAD_UTIL_NIVEL_M3
      && (a.picksNormalizado ?? 0) >= umbralAltaFrecuencia && !asignadosEnOptima.has(a.articulo))
    .sort(ORDEN_POR_PICKS_DESC);
  const resultadoAccesible = empaquetarArticulos(candidatosAccesible, cuerposAccesible, {
    pesos: { utilizacion: 1, violaciones: 5, afinidad: 0, frecuencia: 0 },
    comparador: ORDEN_POR_PICKS_DESC,
  });

  const clavesCuerposUsados = new Set([
    ...resultadoOptima.asignaciones.map(a => `${a.pasillo}|${a.columna}`),
    ...resultadoAccesible.asignaciones.map(a => `${a.pasillo}|${a.columna}`),
  ]);

  return {
    asignaciones: [...resultadoOptima.asignaciones, ...resultadoAccesible.asignaciones],
    // sinAsignar acá NO significa "sin ubicación" -- significa "no le tocó la reserva",
    // caen a la Fase 2 (empaque general) como cualquier otro artículo, nunca se descartan.
    noReservados: [...resultadoOptima.sinAsignar, ...resultadoAccesible.sinAsignar],
    umbralAltaFrecuencia,
    totalCandidatosOptima: candidatosOptima.length,
    totalCandidatosAccesible: candidatosAccesible.length,
    clavesCuerposUsados,
  };
}
