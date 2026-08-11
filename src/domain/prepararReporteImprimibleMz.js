/**
 * Prepara los datos del mapa MZ para un croquis imprimible (2026-08-04,
 * pedido explícito: "un croquis en modo de mapa... que se vería en papel").
 * Reusa la MISMA forma de racks() que ya usa MapaCanvas.jsx
 * (obtenerWarehouseModel().racks(), ver agruparPorRack.js) -- no reimplementa
 * cómo se agrupa la ocupación, solo la reordena para imprimir.
 *
 * Pedido explícito de contenido: cada celda ocupada lista los CÓDIGOS reales
 * que viven ahí (no un simple "ocupado"/"libre" -- "estas cacofonías no me
 * gustan"). Un rack tipo CUERPO ocupa sus 5 niveles con los mismos códigos
 * (mismo criterio que detectarPosicionesLibres.js: un cuerpo es indivisible).
 *
 * Función pura, sin Supabase -- solo reordena lo que ya trae el modelo.
 */
const NIVELES_DE_ARRIBA_A_ABAJO = ['N05', 'N04', 'N03', 'N02', 'N01'];

/**
 * @param {Map<string, {pasillo, columna, niveles: Object<string, Array<{articulo}>>}>} racks -- modelo.racks()
 * @param {Array<{pasillo: string, columnas: number}>} pasillos -- qué pasillos imprimir y hasta qué columna cada uno
 * @returns {Array<{pasillo, filas: Array<{columna, niveles: Array<{nivel, codigos: string[]}>}>}>}
 */
export function prepararReporteImprimibleMz(racks, pasillos) {
  return pasillos.map(({ pasillo, columnas }) => ({
    pasillo,
    filas: Array.from({ length: columnas }, (_, i) => {
      const columna = i + 1;
      const rack = racks.get(`${pasillo}|${columna}`);
      const cuerpo = rack?.niveles?.CUERPO ?? null; // cuerpo ocupado -> mismos códigos en los 5 niveles

      return {
        columna,
        niveles: NIVELES_DE_ARRIBA_A_ABAJO.map(nivel => {
          const articulos = cuerpo ?? rack?.niveles?.[nivel] ?? [];
          return { nivel, codigos: articulos.map(a => a.articulo) };
        }),
      };
    }),
  }));
}
