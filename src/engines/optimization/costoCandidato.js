/**
 * Función de costo del motor de distribución. Se sacó el término de
 * distancia al ascensor (pedido explícito 2026-08-07: "no estás cambiando
 * la lógica... todos los espacios son útiles") -- la accesibilidad real
 * (evitar MZ01-C001/MZ10/MZ11/MZ12, preferir columnas 9-19 de MZ01-08) ya
 * queda cubierta por zonas explícitas de negocio (`calcularAfinidadZonas.js`),
 * no por una fórmula abstracta de distancia euclídea. Pesos configurables
 * (Ley 8/criterio 6.5) -- nunca constantes enterradas dentro del algoritmo
 * de empaquetado.
 *
 * Determinístico: mismos términos + mismos pesos -> mismo costo siempre.
 * Sin Math.random en ningún punto del motor (auditable/reproducible, Ley 9).
 */
export const PESOS_POR_DEFECTO = {
  utilizacion: 2,
  violaciones: 5,
  afinidad: 1.5,
  frecuencia: 0, // afinidad por picks/consumo (calcularAfinidadFrecuencia.js) -- 0 por defecto, no cambia el comportamiento ya validado hasta que se pida explícitamente (2026-08-10, eje nuevo para los 10 acomodos comparativos)
};

/**
 * @param {{utilizacionResultante: number, violacionesBlandas: number, afinidad: number, afinidadFrecuencia?: number}} terminos
 * @param {{utilizacion, violaciones, afinidad, frecuencia}} pesos
 * @returns {number} costo total -- MENOR es mejor candidato.
 */
export function calcularCosto(terminos, pesos = PESOS_POR_DEFECTO) {
  return (
    - pesos.utilizacion * terminos.utilizacionResultante
    + pesos.violaciones * terminos.violacionesBlandas
    - pesos.afinidad * terminos.afinidad
    - (pesos.frecuencia ?? 0) * (terminos.afinidadFrecuencia ?? 0)
  );
}
