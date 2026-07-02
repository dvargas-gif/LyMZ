/**
 * Paleta ESTÁNDAR de clasificación de artículos — única y exclusivamente
 * para A/B/C/D/Cuerpo entero (nunca para pasillos, slots vacíos/bloqueados,
 * fondo general ni modo simulación).
 *
 * Debe coincidir siempre con `ZCOL` (tema "claro") dentro de
 * public/legacy/mapa_editable_slotting.html — son la misma paleta, solo que
 * el mapa legacy no puede importar este archivo (es HTML estático, no pasa
 * por el bundler), así que se mantiene espejada a mano en los dos lugares.
 *
 * Elegida por: contraste ≥4.9:1 con texto blanco (WCAG AA) y separación de
 * matiz pensada para daltonismo (familia de colores inspirada en la paleta
 * Okabe-Ito, evitando el par rojo/verde puro).
 */
export const COLORES_ARTICULO = {
  A: '#0B5394', // Alta rotación — azul profundo
  B: '#0F766E', // Media — verde azulado (teal)
  C: '#B45309', // Baja — ámbar quemado
  D: '#6D4C7D', // Muy baja — ciruela/púrpura apagado
  CUERPO: '#374151', // Cuerpo entero — gris pizarra neutro (categoría aparte, no una rotación)
};

export const NOMBRE_CLASE = { A: 'Alta', B: 'Media', C: 'Baja', D: 'Muy baja' };

/** Color + texto legible para una clase, listo para pintar un badge. */
export function colorDeClase(clase, tipo) {
  const hex = tipo === 'CUERPO' ? COLORES_ARTICULO.CUERPO : COLORES_ARTICULO[clase];
  return hex || '#9A9684'; // gris neutro si la clase no está definida ("-")
}
