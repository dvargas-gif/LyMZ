/**
 * Compara el resultado del empaquetado contra la posición REAL actual de
 * cada artículo -- construye el diff explicable (rack anterior -> rack
 * nuevo, motivo) que alimenta la pantalla de aprobación. Función pura: no
 * decide nada, solo compara y explica.
 *
 * @param {Array<{articulo, pasillo, columna, nivel, costo, utilizacionResultante, afinidad, reglasEvaluadas}>} asignaciones -- salida de empaquetarArticulos/generarCandidatosLayout
 * @param {Map<string, {pasillo, columna, nivel}|null>} posicionActualPorArticulo
 * @returns {Array<{articulo, origen, destino, cambiaUbicacion, motivo, utilizacionResultante, afinidad, costo, reglasEvaluadas}>}
 */
export function construirDiffPropuesta(asignaciones, posicionActualPorArticulo) {
  return asignaciones.map(a => {
    const origen = posicionActualPorArticulo.get(a.articulo) ?? null;
    const destino = { pasillo: a.pasillo, columna: a.columna, nivel: a.nivel };
    const cambiaUbicacion = !origen || origen.pasillo !== destino.pasillo || origen.columna !== destino.columna || origen.nivel !== destino.nivel;
    return {
      articulo: a.articulo, origen, destino, cambiaUbicacion,
      motivo: construirMotivo(a),
      utilizacionResultante: a.utilizacionResultante, afinidad: a.afinidad, costo: a.costo, reglasEvaluadas: a.reglasEvaluadas,
    };
  });
}

function construirMotivo(a) {
  const partes = [`ocupación resultante ${(a.utilizacionResultante * 100).toFixed(1)}%`];
  if (a.afinidad === 2) partes.push('en zona óptima para su clase');
  else if (a.afinidad === 1) partes.push('en zona accesible general');
  else if (a.afinidad < 0) partes.push('en zona a evitar (sin alternativa disponible)');
  return partes.join(', ');
}
