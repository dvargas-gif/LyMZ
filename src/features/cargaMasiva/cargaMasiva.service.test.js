import { describe, it, expect } from 'vitest';
import { normalizarArticulo, normalizarClave, normalizarFilasDestino, validarCargaMasiva } from './cargaMasiva.service.js';

describe('normalizarArticulo', () => {
  it('recorta espacios y pasa a mayúsculas', () => {
    expect(normalizarArticulo('  sku001  ')).toBe('SKU001');
  });
  it('trata null/undefined como cadena vacía', () => {
    expect(normalizarArticulo(null)).toBe('');
    expect(normalizarArticulo(undefined)).toBe('');
  });
});

describe('normalizarClave', () => {
  it('saca acentos, espacios y separadores, y pasa a minúscula', () => {
    expect(normalizarClave('Código Artículo')).toBe('codigoarticulo');
    expect(normalizarClave('N° Pasillo')).toBe('npasillo');
  });
});

describe('normalizarFilasDestino', () => {
  it('reconoce encabezados aunque no coincidan exacto (SKU, Cod. Pasillo, etc.)', () => {
    const filas = normalizarFilasDestino([
      { SKU: 'abc123', 'Cod. Pasillo': 'mz01', Columna: '5', Nivel: 'n02' },
    ]);
    expect(filas).toEqual([
      { articulo: 'ABC123', pasillo: 'MZ01', columna: 5, nivel: 'N02', clase: undefined, grupo: undefined, tipo: undefined },
    ]);
  });

  it('descarta una fila sin artículo, pasillo o columna', () => {
    const filas = normalizarFilasDestino([{ articulo: 'X1', pasillo: 'MZ01' }]); // sin columna
    expect(filas).toHaveLength(0);
  });

  it('NO descarta una columna no numérica -- la deja pasar para que validarCargaMasiva la rechace con motivo visible', () => {
    const filas = normalizarFilasDestino([{ articulo: 'X1', pasillo: 'MZ01', columna: 'no-es-numero' }]);
    expect(filas).toHaveLength(1);
    expect(Number.isNaN(filas[0].columna)).toBe(true);
  });

  it('devuelve [] si no hay filas', () => {
    expect(normalizarFilasDestino([])).toEqual([]);
    expect(normalizarFilasDestino(null)).toEqual([]);
  });
});

describe('validarCargaMasiva', () => {
  const estadoActual = [
    { articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N02', clase: 'A', grupo: 'G1', tipo: 'NORMAL' },
    { articulo: 'SKU002', pasillo: 'MZ02', columna: 10, nivel: 'N01', clase: 'B', grupo: 'G2', tipo: 'NORMAL' },
  ];

  it('acepta una fila válida a un destino libre', () => {
    const { aplicables, conflictos } = validarCargaMasiva(
      [{ articulo: 'SKU001', pasillo: 'MZ03', columna: 5, nivel: 'N01' }],
      estadoActual
    );
    expect(conflictos).toHaveLength(0);
    expect(aplicables).toHaveLength(1);
  });

  it('rechaza columna 0, negativa o NaN con un motivo claro', () => {
    const { conflictos } = validarCargaMasiva(
      [
        { articulo: 'A1', pasillo: 'MZ01', columna: 0, nivel: 'N01' },
        { articulo: 'A2', pasillo: 'MZ01', columna: -3, nivel: 'N01' },
        { articulo: 'A3', pasillo: 'MZ01', columna: NaN, nivel: 'N01' },
      ],
      []
    );
    expect(conflictos).toHaveLength(3);
    conflictos.forEach(f => expect(f.motivo).toMatch(/Columna inválida/));
  });

  it('mismo artículo repetido con el MISMO destino -> se aplica una sola vez, se marca duplicado', () => {
    const { aplicables, duplicados, conflictos } = validarCargaMasiva(
      [
        { articulo: 'sku001', pasillo: 'MZ05', columna: 9, nivel: 'N01' },
        { articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01' }, // mismo destino, distinta mayúscula
      ],
      estadoActual
    );
    expect(conflictos).toHaveLength(0);
    expect(aplicables).toHaveLength(1);
    expect(duplicados).toHaveLength(1);
    expect(duplicados[0].motivo).toMatch(/Fila duplicada/);
  });

  it('mismo artículo con DESTINOS DISTINTOS -> las dos filas se rechazan (no hay forma de saber cuál vale)', () => {
    const { aplicables, conflictos } = validarCargaMasiva(
      [
        { articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01' },
        { articulo: 'SKU001', pasillo: 'MZ06', columna: 3, nivel: 'N02' },
      ],
      estadoActual
    );
    expect(aplicables).toHaveLength(0);
    expect(conflictos).toHaveLength(2);
    conflictos.forEach(f => expect(f.motivo).toMatch(/destinos distintos/));
  });

  it('dos artículos DISTINTOS pidiendo el mismo destino -> el primero se queda con el lugar, el segundo se rechaza', () => {
    const { aplicables, conflictos } = validarCargaMasiva(
      [
        { articulo: 'SKU001', pasillo: 'MZ07', columna: 4, nivel: 'N01' },
        { articulo: 'SKU002', pasillo: 'MZ07', columna: 4, nivel: 'N01' },
      ],
      estadoActual
    );
    expect(aplicables).toHaveLength(1);
    expect(aplicables[0].articulo).toBe('SKU001');
    expect(conflictos).toHaveLength(1);
    expect(conflictos[0].articulo).toBe('SKU002');
    expect(conflictos[0].motivo).toMatch(/Destino duplicado.*SKU001/);
  });

  it('destino ya ocupado hoy por otro artículo que NO está en el lote -> conflicto', () => {
    const { conflictos } = validarCargaMasiva(
      [{ articulo: 'SKU_NUEVO', pasillo: 'MZ01', columna: 1, nivel: 'N02' }], // mismo lugar que SKU001 hoy
      estadoActual
    );
    expect(conflictos).toHaveLength(1);
    expect(conflictos[0].motivo).toMatch(/Posición ocupada hoy por "SKU001"/);
  });

  it('hereda clase/grupo/tipo del estado actual cuando el archivo no los trae', () => {
    const { aplicables } = validarCargaMasiva(
      [{ articulo: 'sku001', pasillo: 'MZ09', columna: 2, nivel: 'N03' }],
      estadoActual
    );
    expect(aplicables[0].clase).toBe('A');
    expect(aplicables[0].grupo).toBe('G1');
  });
});
