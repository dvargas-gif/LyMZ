/**
 * Formato humano estándar de una posición: PASILLO-Ccolumna(-nivel si hay).
 * Único lugar que decide este formato — ReportePanel, PanelCargaMasiva,
 * EdicionEnVivoTabla y PanelCargaPicks lo reusan en vez de reimplementarlo.
 */
export function formatearPosicion(pasillo, columna, nivel) {
  return `${pasillo}-C${String(columna ?? 0).padStart(3, '0')}${nivel ? `-${nivel}` : ''}`;
}
