import { describe, it, expect } from 'vitest';
import { colorDeClase, COLORES_ARTICULO } from './coloresArticulo.js';

describe('colorDeClase', () => {
  it('devuelve el color de CUERPO cuando tipo es CUERPO, sin importar la clase', () => {
    expect(colorDeClase('A', 'CUERPO')).toBe(COLORES_ARTICULO.CUERPO);
    expect(colorDeClase('-', 'CUERPO')).toBe(COLORES_ARTICULO.CUERPO);
  });

  it('devuelve el color de la clase cuando el tipo no es CUERPO', () => {
    expect(colorDeClase('A')).toBe(COLORES_ARTICULO.A);
    expect(colorDeClase('B', 'NORMAL')).toBe(COLORES_ARTICULO.B);
  });

  it('devuelve un gris neutro si la clase no está definida', () => {
    expect(colorDeClase('-')).toBe('#9A9684');
    expect(colorDeClase(undefined)).toBe('#9A9684');
  });
});
