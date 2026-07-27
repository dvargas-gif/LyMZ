/**
 * Regla de negocio (2026-07-24, pedido explícito, iterada varias veces
 * hasta confirmar la tabla completa con el usuario): un cuerpo completo (5
 * niveles) destinado a UN SOLO artículo debería tener MENOS niveles cuanto
 * más volumen relativo ocupa ese artículo dentro del cuerpo -- CONFIRMADO
 * explícitamente con ejemplos concretos (35% -> 3 niveles), no es un error
 * de tipeo aunque parezca contraintuitivo a primera vista.
 *
 * Tabla confirmada (BANDAS_NIVELES, de menor a mayor % de volumen):
 *   < 30%           -> 5 niveles (cuerpo completo, sin ajuste)
 *   30% a < 40%      -> 3 niveles
 *   40% a < 50%      -> 2 niveles
 *   >= 50%           -> 1 nivel ("solo", confirmado que 50-68% y 68%+ dan el mismo resultado)
 *
 * "% de volumen" = volumen del artículo (articulo_dimensiones.volumen_m3)
 * dividido por VOLUMEN_CUERPO_REFERENCIA_M3 (volumen de un nivel × 5).
 *
 * Función pura, sin Supabase (mismo criterio que formulasOcupacion.js) --
 * SOLO detecta y reporta, nunca cambia ni borra nada de inventario_slotting
 * (mismo espíritu que "Revisar artículos exiliados en el acomodo MZ",
 * PanelMigracion.jsx) -- es una recomendación para que el equipo ajuste el
 * plan a mano, no un reasignador automático.
 *
 * 2026-07-27: corregido de 0,423 (dato verbal) a 0,432 -- número exacto que
 * el usuario dejó en "Reporte de dimensiones.xlsx" (columnas L/M, filas
 * 1-2: "Medida del nivel" = 0,432 m³, "Medida del cuerpo" = 2,16 m³, con
 * fórmula propia =nivel*5 en el archivo).
 */
export const VOLUMEN_NIVEL_REFERENCIA_M3 = 0.432;
export const CANTIDAD_NIVELES_CUERPO = 5;
export const VOLUMEN_CUERPO_REFERENCIA_M3 = VOLUMEN_NIVEL_REFERENCIA_M3 * CANTIDAD_NIVELES_CUERPO;

// Ordenadas de menor a mayor "techo" -- la primera banda cuyo techo el
// porcentaje NO alcanza (porcentaje < techo) es la que aplica. Si el
// porcentaje no entra en NINGUNA banda (>= la última, 50%), se usa
// NIVELES_MINIMO. Estructura de datos (no if/else encadenados a mano) para
// que agregar/ajustar una banda el día de mañana sea un cambio de una
// línea, no de lógica.
export const BANDAS_NIVELES = [
  { techoPorcentaje: 0.30, niveles: 5 },
  { techoPorcentaje: 0.40, niveles: 3 },
  { techoPorcentaje: 0.50, niveles: 2 },
];
export const NIVELES_MINIMO = 1; // >= 50% (confirmado: mismo resultado de 50% a 68%+ en adelante)

/** Cuántos niveles corresponden a un artículo que ocupa `porcentaje` (0-1) del volumen del cuerpo. */
export function nivelesRecomendados(porcentaje) {
  for (const banda of BANDAS_NIVELES) {
    if (porcentaje < banda.techoPorcentaje) return banda.niveles;
  }
  return NIVELES_MINIMO;
}

function claveRack(pasillo, columna) {
  return `${pasillo}|${columna}`;
}

/**
 * @param {Array<{articulo, pasillo, columna, tipo}>} inventarioSlotting -- inventarioService.listar()
 * @param {Array<{articulo, volumenM3}>} dimensiones -- articuloDimensionesService.listar()
 * @returns {Array<{pasillo, columna, articulo, volumenArticulo, porcentaje, nivelesRecomendados}>}
 *   Solo incluye cuerpos donde el nivel recomendado es MENOS de 5 (algo para ajustar) -- si ya
 *   corresponde el cuerpo completo (< 30%), no aparece en la lista (nada que revisar ahí).
 *   Ordenado de más a menos urgente (menos niveles recomendados primero).
 */
export function detectarCuerposParaAjustarNiveles(inventarioSlotting, dimensiones) {
  const volumenPorArticulo = new Map(dimensiones.map(d => [d.articulo, d.volumenM3]));

  const cuerpos = new Map(); // "pasillo|columna" -> { pasillo, columna, articulos: Set }
  for (const fila of inventarioSlotting) {
    if (fila.tipo !== 'CUERPO') continue;
    const clave = claveRack(fila.pasillo, fila.columna);
    if (!cuerpos.has(clave)) cuerpos.set(clave, { pasillo: fila.pasillo, columna: fila.columna, articulos: new Set() });
    cuerpos.get(clave).articulos.add(fila.articulo);
  }

  const resultado = [];
  for (const { pasillo, columna, articulos } of cuerpos.values()) {
    if (articulos.size !== 1) continue; // la regla es específicamente "un solo artículo" -- un cuerpo con varios no aplica
    const [articulo] = articulos;
    const volumenArticulo = volumenPorArticulo.get(articulo);
    if (volumenArticulo == null) continue; // sin dimensiones importadas -- no se puede evaluar, no se asume nada

    const porcentaje = volumenArticulo / VOLUMEN_CUERPO_REFERENCIA_M3;
    const niveles = nivelesRecomendados(porcentaje);
    if (niveles < CANTIDAD_NIVELES_CUERPO) {
      resultado.push({ pasillo, columna, articulo, volumenArticulo, porcentaje, nivelesRecomendados: niveles });
    }
  }
  return resultado.sort((a, b) => a.nivelesRecomendados - b.nivelesRecomendados);
}
