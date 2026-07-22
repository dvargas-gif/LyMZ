import { describe, it, expect } from 'vitest';
import { parsearFilasDimensiones, validarDimensiones } from './articuloDimensiones.js';

function fila(articulo, largo, ancho, alto, cantidad, extra = {}) {
  return { 'Código Articulo': articulo, Largo: largo, Ancho: ancho, Alto: alto, 'Cantidad MAXIMA ': cantidad, ...extra };
}

describe('parsearFilasDimensiones', () => {
  it('parsea una fila válida completa', () => {
    const [f] = parsearFilasDimensiones([fila('123', 10, 5, 3, 20, { 'Descripción': 'Tornillo', Peso: 0.05 })]);
    expect(f).toMatchObject({ valido: true, articulo: '123', largo: 10, ancho: 5, alto: 3, cantidadMaxima: 20, descripcion: 'Tornillo', peso: 0.05 });
  });

  it('tolera el cambio de nombre de columna de cantidad (Cantidad -> Cantidad MAXIMA)', () => {
    const [f] = parsearFilasDimensiones([{ 'Código Articulo': '1', Largo: 1, Ancho: 1, Alto: 1, Cantidad: 5 }]);
    expect(f.valido).toBe(true);
    expect(f.cantidadMaxima).toBe(5);
  });

  it('rechaza fila sin código de artículo', () => {
    const [f] = parsearFilasDimensiones([{ Largo: 1, Ancho: 1, Alto: 1, 'Cantidad MAXIMA ': 1 }]);
    expect(f.valido).toBe(false);
    expect(f.motivo).toMatch(/Código Articulo/);
  });

  it('rechaza fila con largo/ancho/alto/cantidad faltante o no numérico', () => {
    const [f] = parsearFilasDimensiones([fila('123', '', 5, 3, 20)]);
    expect(f.valido).toBe(false);
    expect(f.motivo).toMatch(/Largo/);
  });

  it('rechaza cero y negativos -- no son dimensiones físicas válidas', () => {
    expect(parsearFilasDimensiones([fila('1', 0, 5, 3, 20)])[0].valido).toBe(false);
    expect(parsearFilasDimensiones([fila('1', -5, 5, 3, 20)])[0].valido).toBe(false);
  });

  it('el número de fila empieza en 2 (fila 1 = encabezado)', () => {
    const filas = parsearFilasDimensiones([fila('1', 1, 1, 1, 1), fila('2', 1, 1, 1, 1)]);
    expect(filas.map(f => f.fila)).toEqual([2, 3]);
  });
});

describe('validarDimensiones', () => {
  it('marca como rechazado un artículo duplicado dentro del mismo archivo', () => {
    const parsed = parsearFilasDimensiones([fila('123', 1, 1, 1, 1), fila('123', 2, 2, 2, 2)]);
    const { validas, rechazadas } = validarDimensiones(parsed);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(2);
    expect(rechazadas[0].motivo).toMatch(/duplicado/);
  });

  it('artículos distintos no chocan entre sí', () => {
    const parsed = parsearFilasDimensiones([fila('123', 1, 1, 1, 1), fila('456', 2, 2, 2, 2)]);
    const { validas } = validarDimensiones(parsed);
    expect(validas).toHaveLength(2);
  });

  it('una fila ya rechazada por formato no se re-evalúa por duplicado', () => {
    const parsed = parsearFilasDimensiones([fila('', 1, 1, 1, 1), fila('', 2, 2, 2, 2)]);
    const { rechazadas } = validarDimensiones(parsed);
    expect(rechazadas.every(f => f.motivo.includes('Código Articulo'))).toBe(true);
  });
});
