/**
 * Reemplaza el modelo anterior (distancia euclídea continua al ascensor) por
 * zonas EXPLÍCITAS de negocio (pedido explícito 2026-08-07: "no estás
 * cambiando la lógica... quiero que evites MZ01-C001/MZ10/MZ11/MZ12 -- 200m
 * de caminata -- y prefieras C009 a C019 en MZ01 a MZ08"). "Todos los
 * espacios son útiles" salvo los que el propio negocio identifica como
 * problema real (caminata excesiva) -- no una fórmula abstracta de
 * distancia, sino zonas nombradas y confirmadas una por una.
 *
 * Reglas como datos (Ley 8) -- ninguna hardcodeada dentro del motor.
 */
export const ZONA_ACCESIBLE_GENERAL = { pasillos: ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08'], columnaDesde: 9, columnaHasta: 19 };
// Ampliada 2026-08-11 (pedido explícito, verificado con datos reales antes de
// implementar): de solo MZ02 a los 8 pasillos completos -- pasó de cubrir el
// 22.5% de clase A a el 94.2% (696 de 739). Los pasillos MZ09-12 quedan
// deliberadamente fuera de la óptima (siguen siendo "útiles" vía la zona
// accesible general o neutros, nunca "óptimos") -- pedido explícito del
// usuario: "los demás son útiles, pero no óptimo".
export const ZONA_OPTIMA_CLASE_A = { pasillos: ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08'], columnaDesde: 19, columnaHasta: 27 };
export const ZONAS_A_EVITAR_POR_DEFECTO = [
  { pasillo: 'MZ01', columnaDesde: 1, columnaHasta: 1 }, // ~200m de caminata real, confirmado por el usuario
  { pasillo: 'MZ10' },
  { pasillo: 'MZ11' },
  { pasillo: 'MZ12' },
];

/** Exportada -- reservarZonaPrioritaria.js la reusa para filtrar el universo de huecos por zona, misma definición, una sola fuente de verdad (Ley 8). */
export function enRango(cuerpo, zona) {
  const pasilloOk = zona.pasillos ? zona.pasillos.includes(cuerpo.pasillo) : cuerpo.pasillo === zona.pasillo;
  if (!pasilloOk) return false;
  if (zona.columnaDesde == null) return true; // pasillo entero (MZ10/11/12)
  return cuerpo.columna >= zona.columnaDesde && cuerpo.columna <= zona.columnaHasta;
}

/**
 * @param {{pasillo, columna}} cuerpo
 * @param {{clase}} articulo
 * @param {{accesibleGeneral, optimaClaseA, aEvitar}} zonas -- configurable, con los defaults de arriba
 * @returns {number} afinidad -- positivo = preferido, negativo = evitar si hay alternativa. Nunca un filtro duro.
 */
export function calcularAfinidadZonas(cuerpo, articulo, zonas = {}) {
  const accesibleGeneral = zonas.accesibleGeneral ?? ZONA_ACCESIBLE_GENERAL;
  const optimaClaseA = zonas.optimaClaseA ?? ZONA_OPTIMA_CLASE_A;
  const aEvitar = zonas.aEvitar ?? ZONAS_A_EVITAR_POR_DEFECTO;

  if (aEvitar.some(z => enRango(cuerpo, z))) return -1;
  if (articulo.clase === 'A' && enRango(cuerpo, optimaClaseA)) return 2;
  if (enRango(cuerpo, accesibleGeneral)) return 1;
  return 0;
}
