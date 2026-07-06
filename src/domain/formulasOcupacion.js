/**
 * Fórmulas de ocupación, portadas COMO ESTÁN desde public/legacy/js/05-ayudantes.js
 * (nArts, nivelesArmar, consumoTotal, llenura, colorLlenura) -- mismos
 * resultados, ver INVENTARIO-LOGICA-MAPA.md sección 1 y DECISIONES.md
 * ADR-004/005. El mapa legacy conserva sus propias copias intactas; esto
 * NO las reemplaza ahí, es la versión que usa el dominio de ahora en más.
 *
 * Todas reciben un "rack" con la forma {niveles: {nivelKey: [articulo...]}}
 * -- la misma forma que `cu` en CUERPOS, producida acá por agruparPorRack().
 * Cada `articulo` de esos arrays necesita, como mínimo, `{consumo}`.
 */

/** Cantidad total de artículos en el rack (todos los niveles). */
export function nArts(rack) {
  return Object.values(rack.niveles).reduce((s, arts) => s + arts.length, 0);
}

/**
 * Niveles con al menos 1 artículo (o 1 si el rack es de tipo CUERPO).
 * Ver ADR-006: este es el significado "en vivo" -- deliberadamente NO se
 * llama nivelesArmar() ni niveles_a_armar acá, para no colisionar con la
 * columna congelada del mismo nombre en inventario_slotting.
 */
export function nivelesOcupados(rack) {
  if (rack.niveles.CUERPO) return 1;
  return Object.keys(rack.niveles).filter(n => rack.niveles[n].length > 0).length;
}

/** Suma del consumo de todos los artículos del rack. */
export function consumoTotal(rack) {
  return Object.values(rack.niveles).reduce((s, arts) => s + arts.reduce((x, a) => x + (a.consumo || 0), 0), 0);
}

/** Ocupación del rack como proporción de su capacidad útil (puede superar 1 -- sobrecarga real). */
export function llenura(rack, configuracionOcupacion) {
  return Math.min(consumoTotal(rack) / configuracionOcupacion.capacidadUtilRack, 1.2);
}

/** Color de alerta según la llenura de un rack (0..~1.2). */
export function colorLlenura(proporcion, configuracionOcupacion) {
  const u = configuracionOcupacion.umbralRack;
  if (proporcion > u.sobrecargado) return '#C0392B';
  if (proporcion > u.alerta) return '#D08A1E';
  if (proporcion > u.medio) return '#2E7D83';
  return '#7FB069';
}
