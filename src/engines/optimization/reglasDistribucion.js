import { VOLUMEN_CUERPO_REFERENCIA_M3 } from '../../domain/reglasAsignacionCuerpo.js';

/**
 * Restricciones como DATOS, no como código (Ley 8, MASTER-PROMPT.md:30) --
 * el motor de empaquetado (empaquetarArticulos.js) solo sabe iterar este
 * registro y evaluar, nunca tiene `if (articulo.clase === 'A')` hardcodeado
 * adentro. Agregar una regla nueva el día de mañana ("frágil no arriba") es
 * agregar un objeto acá, no tocar el algoritmo.
 *
 * `bin` esperado: {tipo: 'NIVEL'|'CUERPO', capacidadUtil, volumenOcupado,
 * articulosDistintos: Set<string>}. `articulo` esperado: {articulo,
 * volumenM3, clase}.
 */
export const MAX_ARTICULOS_DISTINTOS_POR_NIVEL = 4; // pedido explícito 2026-08-06, siempre, sin excepción por volumen sobrante

/**
 * Excepciones puntuales de capacidad (Ley 8 -- dato, nunca un `if` de
 * artículo hardcodeado en el motor). Caso real 2026-08-11: el 7501137
 * (lote de 3000 unidades, 15x12x4cm c/u) mide 2.16 m3 EXACTOS -- el volumen
 * de referencia completo de un cuerpo (0.432*5), pero la tolerancia de
 * ocupación (2.5% libre) deja la capacidad ÚTIL en 2.106 m3, así que le
 * faltaban 0.054 m3 por el margen de tolerancia, no por error de dato
 * (dimensiones verificadas contra articulo_dimensiones, no hay mm/cm mal
 * cargado). Pedido explícito del usuario: darle el cuerpo completo que
 * necesita -- se le exime de la tolerancia, usando la capacidad de
 * REFERENCIA (100%) en vez de la útil (97.5%), solo para este artículo.
 */
export const EXCEPCIONES_CAPACIDAD_CUERPO = {
  '7501137': VOLUMEN_CUERPO_REFERENCIA_M3,
};

export const REGLAS_POR_DEFECTO = [
  {
    id: 'capacidad_hueco',
    dura: true,
    descripcion: 'El volumen total del hueco (con lo nuevo) no supera la capacidad útil (tolerancia de ocupación incluida, salvo excepción puntual documentada)',
    evaluar({ bin, articulo }) {
      const capacidad = EXCEPCIONES_CAPACIDAD_CUERPO[articulo.articulo] ?? bin.capacidadUtil;
      const total = bin.volumenOcupado + articulo.volumenM3;
      return { cumple: total <= capacidad, detalle: `${total.toFixed(4)} / ${capacidad.toFixed(4)} m3${capacidad !== bin.capacidadUtil ? ' (excepción)' : ''}` };
    },
  },
  {
    id: 'max_articulos_distintos_por_nivel',
    dura: true,
    descripcion: `Máximo ${MAX_ARTICULOS_DISTINTOS_POR_NIVEL} artículos distintos por nivel, sin excepción (no aplica a un cuerpo completo -- ese es de un solo artículo por diseño)`,
    evaluar({ bin, articulo }) {
      if (bin.tipo !== 'NIVEL') return { cumple: true, detalle: 'no aplica a cuerpo completo' };
      const yaEsta = bin.articulosDistintos.has(articulo.articulo);
      const cumple = yaEsta || bin.articulosDistintos.size < MAX_ARTICULOS_DISTINTOS_POR_NIVEL;
      return { cumple, detalle: `${bin.articulosDistintos.size}${yaEsta ? ' (ya presente)' : ''} / ${MAX_ARTICULOS_DISTINTOS_POR_NIVEL}` };
    },
  },
];

/**
 * Evalúa TODAS las reglas para un candidato (bin, artículo) puntual.
 * @returns {{cumpleTodasLasDuras: boolean, resultados: Array<{id, descripcion, dura, cumple, detalle}>}}
 */
export function evaluarReglas(bin, articulo, reglas = REGLAS_POR_DEFECTO) {
  const resultados = reglas.map(r => ({ id: r.id, descripcion: r.descripcion, dura: r.dura, ...r.evaluar({ bin, articulo }) }));
  const cumpleTodasLasDuras = resultados.filter(r => r.dura).every(r => r.cumple);
  return { cumpleTodasLasDuras, resultados };
}
