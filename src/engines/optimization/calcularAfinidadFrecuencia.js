import { ZONA_ACCESIBLE_GENERAL, ZONA_OPTIMA_CLASE_A, ZONAS_A_EVITAR_POR_DEFECTO } from './calcularAfinidadZonas.js';

/**
 * Segundo eje de afinidad, independiente de la clase (pedido explícito
 * 2026-08-10: "la frecuencia con la que se pikean" como eje de variación
 * para los 10 acomodos comparativos). Un artículo puede ser clase B/C/D y
 * pickearse muchísimo -- `picksNormalizado` (0-1, calculado FUERA del motor,
 * en la etapa de carga de datos, nunca acá) es la señal real que lo
 * distingue de `calcularAfinidadZonas.js`, que solo mira `clase`.
 *
 * Reusa las MISMAS zonas de negocio ya validadas (accesible general,
 * óptima, a evitar) -- no son dos geografías distintas, son dos criterios
 * distintos para preferir esas mismas zonas. Reglas como datos (Ley 8).
 */
function enRango(cuerpo, zona) {
  const pasilloOk = zona.pasillos ? zona.pasillos.includes(cuerpo.pasillo) : cuerpo.pasillo === zona.pasillo;
  if (!pasilloOk) return false;
  if (zona.columnaDesde == null) return true;
  return cuerpo.columna >= zona.columnaDesde && cuerpo.columna <= zona.columnaHasta;
}

/**
 * @param {{pasillo, columna}} cuerpo
 * @param {{picksNormalizado: number}} articulo -- 0 (nunca se pickea) a 1 (el más pickeado del dataset)
 * @param {{accesibleGeneral, optimaClaseA, aEvitar}} zonas -- configurable, mismos defaults que calcularAfinidadZonas
 * @returns {number} afinidad escalada por frecuencia -- positivo = preferido, negativo = evitar si hay alternativa.
 */
export function calcularAfinidadFrecuencia(cuerpo, articulo, zonas = {}) {
  const picksNormalizado = articulo.picksNormalizado ?? 0;
  const accesibleGeneral = zonas.accesibleGeneral ?? ZONA_ACCESIBLE_GENERAL;
  const optimaClaseA = zonas.optimaClaseA ?? ZONA_OPTIMA_CLASE_A;
  const aEvitar = zonas.aEvitar ?? ZONAS_A_EVITAR_POR_DEFECTO;

  if (aEvitar.some(z => enRango(cuerpo, z))) return -picksNormalizado;
  if (enRango(cuerpo, optimaClaseA)) return 2 * picksNormalizado;
  if (enRango(cuerpo, accesibleGeneral)) return 1 * picksNormalizado;
  return 0;
}
