import { describe, it, expect } from 'vitest';
import { generarMovimientosMigracion } from './generarMovimientos.js';

const RCL_A = { rclCodigo: 'RCL119-C004', rclNivel: 5, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 };
const RCL_B = { rclCodigo: 'RCL050-C002', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU002', cantidad: 4 };

describe('generarMovimientosMigracion', () => {
  it('artículo con stock real -- genera un movimiento con la cantidad real (no la del plan original, que no la tiene)', () => {
    const { movimientos, sinStock } = generarMovimientosMigracion(
      [{ articulo: 'SKU001', pasillo: 'MZ06', columna: 11, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }],
      [RCL_A]
    );
    expect(sinStock).toHaveLength(0);
    expect(movimientos).toEqual([
      { mzPasillo: 'MZ06', mzColumna: 11, mzNivel: 'N05', rclCodigo: 'RCL119-C004', rclNivel: 5, articulo: 'SKU001', cantidad: 10, orden: 1 },
    ]);
  });

  it('artículo sin stock real en su origen -- va a sinStock, no genera movimiento (nunca inventa cantidad)', () => {
    const { movimientos, sinStock } = generarMovimientosMigracion(
      [{ articulo: 'SKU001', pasillo: 'MZ06', columna: 11, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }],
      []
    );
    expect(movimientos).toHaveLength(0);
    expect(sinStock).toHaveLength(1);
    expect(sinStock[0]).toMatchObject({ articulo: 'SKU001', rclCodigo: 'RCL119-C004' });
  });

  it('artículo sin rack_actual parseable -- se ignora, ni movimiento ni sinStock', () => {
    const { movimientos, sinStock } = generarMovimientosMigracion(
      [{ articulo: 'SKU001', pasillo: 'MZ06', columna: 11, nivel: 'N05', rack_actual: null }],
      []
    );
    expect(movimientos).toHaveLength(0);
    expect(sinStock).toHaveLength(0);
  });

  it('varios artículos en el MISMO destino MZ, de DISTINTO RCL de origen -- orden agrupa por RCL, no por orden de aparición', () => {
    const { movimientos } = generarMovimientosMigracion(
      [
        { articulo: 'SKU002', pasillo: 'MZ04', columna: 8, nivel: 'N01', rack_actual: 'RCL050-C002-N01-1' },
        { articulo: 'SKU001', pasillo: 'MZ04', columna: 8, nivel: 'N01', rack_actual: 'RCL119-C004-N05-1' },
      ],
      [RCL_A, RCL_B]
    );
    // RCL050 ordena antes que RCL119 alfabéticamente -- el grupo debe respetar eso, no el orden del array de entrada
    expect(movimientos.map(m => m.articulo)).toEqual(['SKU002', 'SKU001']);
    expect(movimientos.map(m => m.orden)).toEqual([1, 2]);
  });

  it('destinos MZ distintos -- cada uno numera su propio orden desde 1', () => {
    const { movimientos } = generarMovimientosMigracion(
      [
        { articulo: 'SKU001', pasillo: 'MZ04', columna: 8, nivel: 'N01', rack_actual: 'RCL119-C004-N05-1' },
        { articulo: 'SKU002', pasillo: 'MZ05', columna: 2, nivel: 'N02', rack_actual: 'RCL050-C002-N01-1' },
      ],
      [RCL_A, RCL_B]
    );
    expect(movimientos.every(m => m.orden === 1)).toBe(true);
  });

  it('sin cantidad en ningún origen -- lista vacía de movimientos, no rompe', () => {
    const { movimientos, sinStock } = generarMovimientosMigracion([], []);
    expect(movimientos).toEqual([]);
    expect(sinStock).toEqual([]);
  });
});
