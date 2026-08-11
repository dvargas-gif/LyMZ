import { VOLUMEN_NIVEL_REFERENCIA_M3, VOLUMEN_CUERPO_REFERENCIA_M3 } from '../../domain/reglasAsignacionCuerpo.js';

/**
 * Motor de distribución (Fase 5, ver DECISIONES.md ADR-016 y el plan
 * aprobado 2026-08-06) -- primer archivo del motor puro
 * `src/engines/optimization/` que MASTER-PROMPT.md reservaba para esta fase
 * (nunca construida hasta ahora). Ningún import de React/DOM/Supabase en
 * toda esta carpeta (Ley 7).
 *
 * Tolerancia de ocupación (pedido explícito 2026-08-06): máximo 2.5% de
 * espacio libre por hueco -- capacidad ÚTIL = 97.5% de la capacidad de
 * referencia. Reusa VOLUMEN_NIVEL_REFERENCIA_M3/VOLUMEN_CUERPO_REFERENCIA_M3
 * de reglasAsignacionCuerpo.js -- no se reinventan los números.
 */
export const TOLERANCIA_OCUPACION = 0.975;

export const CAPACIDAD_UTIL_NIVEL_M3 = VOLUMEN_NIVEL_REFERENCIA_M3 * TOLERANCIA_OCUPACION;
export const CAPACIDAD_UTIL_CUERPO_M3 = VOLUMEN_CUERPO_REFERENCIA_M3 * TOLERANCIA_OCUPACION;

/**
 * Aplana la geometría real (DXF, `geometriaMezanine.data.json`) a la lista
 * de cuerpos físicos reales -- un cuerpo por rack real, con su coordenada
 * (x,y en metros). Universo completo: los 12 pasillos (MZ01-MZ12, pedido
 * explícito -- MZ09-12 son espacio real vacío, entra como capacidad
 * disponible), no solo los 8 que hoy cubre identidad_legacy.
 *
 * @param {{pasillos: Array<{pasillo, orientacion, ubicaciones: Array<{columna,x,y}>}>}} geometria -- geometriaMezanine.data.json ya validado (GeometriaMezanine.validarGeometria)
 * @returns {Array<{pasillo, columna, x, y}>}
 */
export function construirUniversoDeHuecos(geometria) {
  const cuerpos = [];
  for (const p of geometria.pasillos) {
    for (const u of p.ubicaciones) {
      cuerpos.push({ pasillo: p.pasillo, columna: u.columna, x: u.x, y: u.y });
    }
  }
  return cuerpos;
}
