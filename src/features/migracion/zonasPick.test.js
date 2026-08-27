import { describe, it, expect } from 'vitest';
import { parsearFilasZonaPick, validarZonasPick } from './zonasPick.js';

function fila(articulo, minima, maxima, extra = {}) {
  return { 'Código Articulo': articulo, 'Cantidad Mínima': minima, 'Cantidad Máxima': maxima, ...extra };
}

describe('parsearFilasZonaPick', () => {
  it('parsea una fila válida completa', () => {
    const [f] = parsearFilasZonaPick([fila('123', 10, 50)]);
    expect(f).toMatchObject({ valido: true, articulo: '123', cantidadMinima: 10, cantidadMaxima: 50 });
  });

  it('acepta "Articulo" como alternativa a "Código Articulo"', () => {
    const [f] = parsearFilasZonaPick([{ Articulo: '1', 'Cantidad Mínima': 1, 'Cantidad Máxima': 5 }]);
    expect(f.valido).toBe(true);
  });

  // Bug real 2026-08-22: el archivo real de David usa "Id Artículo" (con
  // tilde) -- ni "Código Articulo" ni el "Articulo" bare lo reconocían
  // (startsWith exacto, sin sacar tildes), rechazó las 4339 filas del
  // archivo real con "falta Código Articulo".
  it('acepta "Id Artículo" (con tilde) -- el nombre real del archivo de zonas de pick', () => {
    const [f] = parsearFilasZonaPick([{ 'Id Artículo': '3265021', Ubicación: 'L201-C001-N02-1', 'Cantidad Mínima': 28, 'Cantidad Máxima': 70 }]);
    expect(f.valido).toBe(true);
    expect(f.articulo).toBe('3265021');
  });

  it('captura la Ubicación (cara de pick RCL asignada) cuando viene en el archivo', () => {
    const [f] = parsearFilasZonaPick([fila('123', 10, 50, { Ubicación: 'RCL170-C003-N01-1' })]);
    expect(f.valido).toBe(true);
    expect(f.ubicacionRcl).toBe('RCL170-C003-N01-1');
  });

  it('sin columna de Ubicación, queda en null -- no bloquea la fila (compatibilidad con lo ya importado)', () => {
    const [f] = parsearFilasZonaPick([fila('123', 10, 50)]);
    expect(f.valido).toBe(true);
    expect(f.ubicacionRcl).toBeNull();
  });

  it('tolera variantes sin tilde de "Mínima"/"Máxima" (MINIMA/MAXIMA)', () => {
    const [f] = parsearFilasZonaPick([{ 'Código Articulo': '1', 'Cantidad MINIMA': 2, 'Cantidad MAXIMA': 8 }]);
    expect(f.valido).toBe(true);
    expect(f.cantidadMinima).toBe(2);
    expect(f.cantidadMaxima).toBe(8);
  });

  it('rechaza (no adivina) si hay más de una columna "Cantidad Max..."', () => {
    const [f] = parsearFilasZonaPick([{
      'Código Articulo': '1', 'Cantidad Mínima': 1, 'Cantidad Máxima': 10, 'Cantidad Maxima Historica': 999,
    }]);
    expect(f.valido).toBe(false);
    expect(f.motivo).toMatch(/más de una columna/);
  });

  it('rechaza fila sin código de artículo', () => {
    const [f] = parsearFilasZonaPick([{ 'Cantidad Mínima': 1, 'Cantidad Máxima': 5 }]);
    expect(f.valido).toBe(false);
    expect(f.motivo).toMatch(/Código Articulo/);
  });

  it('rechaza fila con mínima/máxima faltante o no numérica', () => {
    const [f] = parsearFilasZonaPick([fila('123', '', 50)]);
    expect(f.valido).toBe(false);
    expect(f.motivo).toMatch(/Cantidad Mínima/);
  });

  it('acepta cero como mínima válida (puede no tener stock mínimo exigido)', () => {
    const [f] = parsearFilasZonaPick([fila('123', 0, 10)]);
    expect(f.valido).toBe(true);
    expect(f.cantidadMinima).toBe(0);
  });

  it('rechaza si la máxima no es mayor que la mínima', () => {
    expect(parsearFilasZonaPick([fila('1', 10, 10)])[0].valido).toBe(false);
    expect(parsearFilasZonaPick([fila('1', 10, 5)])[0].valido).toBe(false);
  });

  it('el número de fila empieza en 2 (fila 1 = encabezado)', () => {
    const filas = parsearFilasZonaPick([fila('1', 1, 2), fila('2', 1, 2)]);
    expect(filas.map(f => f.fila)).toEqual([2, 3]);
  });
});

describe('validarZonasPick', () => {
  it('marca como rechazado un artículo duplicado dentro del mismo archivo', () => {
    const parsed = parsearFilasZonaPick([fila('123', 1, 5), fila('123', 2, 8)]);
    const { validas, rechazadas } = validarZonasPick(parsed);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(2);
    expect(rechazadas[0].motivo).toMatch(/duplicado/);
  });

  it('artículos distintos no chocan entre sí', () => {
    const parsed = parsearFilasZonaPick([fila('123', 1, 5), fila('456', 2, 8)]);
    const { validas } = validarZonasPick(parsed);
    expect(validas).toHaveLength(2);
  });

  it('una fila ya rechazada por formato no se re-evalúa por duplicado', () => {
    const parsed = parsearFilasZonaPick([fila('', 1, 5), fila('', 2, 8)]);
    const { rechazadas } = validarZonasPick(parsed);
    expect(rechazadas.every(f => f.motivo.includes('Código Articulo'))).toBe(true);
  });
});
