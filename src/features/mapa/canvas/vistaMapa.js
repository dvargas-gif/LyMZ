/**
 * Cálculos puros de cámara del canvas (encuadre + easing) -- sin React ni
 * Konva, para poder testear "Restablecer vista" y "Buscar" sin montar el
 * Stage. La animación en sí (requestAnimationFrame) vive en MapaCanvas.jsx,
 * acá solo la matemática que decide A DÓNDE animar.
 */

export const MARGEN_AJUSTE = 0.9; // deja ~10% de aire alrededor al ajustar a pantalla
export const DURACION_ANIMACION_MS = 450; // "Restablecer vista" / "Buscar" -- nunca un salto
export const DURACION_ZOOM_BOTON_MS = 180; // zoom +/- de la toolbar, más corto que un desplazamiento largo

/**
 * Encuadre que muestra TODO `limites` centrado dentro de `tamano`, con
 * margen (fit-to-screen). El centro queda explícito (no solo un offset
 * x/y) a propósito: si algún día se agrega rotación, el pivote ya está acá.
 */
export function calcularVistaAjustada(limites, tamano, margen = MARGEN_AJUSTE) {
  const escala = Math.min(tamano.ancho / limites.ancho, tamano.alto / limites.alto) * margen;
  const centroX = limites.ancho / 2;
  const centroY = limites.alto / 2;
  return {
    escala,
    x: tamano.ancho / 2 - centroX * escala,
    y: tamano.alto / 2 - centroY * escala,
  };
}

/** Encuadre centrado en una celda puntual (resultado de Buscar) a una escala legible fija -- si el usuario está muy alejado, buscar debe acercar, no solo centrar en el lugar equivocado de zoom. */
export function calcularVistaCentradaEnCelda(celda, tamano, escala) {
  const centroX = celda.x + celda.ancho / 2;
  const centroY = celda.y + celda.alto / 2;
  return {
    escala,
    x: tamano.ancho / 2 - centroX * escala,
    y: tamano.alto / 2 - centroY * escala,
  };
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Interpola entre dos encuadres {x,y,escala} con easing -- `progreso` en [0,1], se clampea solo. */
export function interpolarVista(desde, hasta, progreso) {
  const t = easeOutCubic(Math.min(Math.max(progreso, 0), 1));
  return {
    x: desde.x + (hasta.x - desde.x) * t,
    y: desde.y + (hasta.y - desde.y) * t,
    escala: desde.escala + (hasta.escala - desde.escala) * t,
  };
}
