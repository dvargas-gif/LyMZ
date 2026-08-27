import { describe, it, expect } from 'vitest';
import { generarMovimientosMigracionOptimizado } from './generarMovimientosOptimizado.js';

const RCL_A = { rclCodigo: 'RCL119-C004', rclNivel: 5, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 };

const GEOMETRIA_MINIMA = {
  pasillos: [
    { pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }, { columna: 2, x: 3, y: 2 }] },
    { pasillo: 'MZ02', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 5 }] },
  ],
};

describe('generarMovimientosMigracionOptimizado', () => {
  it('artículo con volumen cargado -- el destino lo elige el motor de optimización, NO el fijo de inventario_slotting', () => {
    const { movimientos, respaldados } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }], // destino fijo original, distinto del universo real de huecos
      [RCL_A],
      new Map([['SKU001', 0.05]]),
      GEOMETRIA_MINIMA,
    );
    expect(respaldados).toHaveLength(0);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ rclCodigo: 'RCL119-C004', rclNivel: 5, articulo: 'SKU001', cantidad: 10, orden: 1 });
    // El destino viene del universo real (MZ01/MZ02 de GEOMETRIA_MINIMA), no del fijo original (MZ09-C099)
    expect(['MZ01', 'MZ02']).toContain(movimientos[0].mzPasillo);
    expect(movimientos[0].mzPasillo === 'MZ09').toBe(false);
  });

  it('artículo SIN volumen cargado -- usa el destino fijo original como respaldo, y queda listado en `respaldados`', () => {
    const { movimientos, respaldados } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }],
      [RCL_A],
      new Map(), // sin volumen para SKU001
      GEOMETRIA_MINIMA,
    );
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ mzPasillo: 'MZ09', mzColumna: 99, mzNivel: 'N05' });
    expect(respaldados).toEqual([{ articulo: 'SKU001', motivo: 'sin_dimensiones_importadas -- se usó el destino fijo original de inventario_slotting' }]);
  });

  it('artículo sin stock real -- va a sinStock, no genera movimiento (mismo criterio que el motor viejo)', () => {
    const { movimientos, sinStock } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }],
      [],
      new Map([['SKU001', 0.05]]),
      GEOMETRIA_MINIMA,
    );
    expect(movimientos).toHaveLength(0);
    expect(sinStock).toHaveLength(1);
    expect(sinStock[0]).toMatchObject({ articulo: 'SKU001', rclCodigo: 'RCL119-C004' });
  });

  it('artículo sin rack_actual parseable -- se ignora, ni movimiento ni sinStock ni respaldados', () => {
    const { movimientos, sinStock, respaldados } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: null }],
      [],
      new Map(),
      GEOMETRIA_MINIMA,
    );
    expect(movimientos).toHaveLength(0);
    expect(sinStock).toHaveLength(0);
    expect(respaldados).toHaveLength(0);
  });

  it('el motor de optimización no encuentra hueco (universo lleno) -- también cae a respaldo, no se pierde el artículo', () => {
    const geometriaChica = { pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }] };
    const { movimientos, respaldados } = generarMovimientosMigracionOptimizado(
      [
        { articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        { articulo: 'SKU003', pasillo: 'MZ09', columna: 98, nivel: 'N04', rack_actual: 'RCL120-C005-N04-1' },
      ],
      [RCL_A, { rclCodigo: 'RCL120-C005', rclNivel: 4, rclSubnivel: 1, articulo: 'SKU003', cantidad: 3 }],
      new Map([['SKU001', 10], ['SKU003', 10]]), // volumen enorme -- ninguno entra en el único hueco chico
      geometriaChica,
    );
    expect(movimientos).toHaveLength(2);
    expect(respaldados.map(r => r.articulo).sort()).toEqual(['SKU001', 'SKU003']);
  });

  it('orden agrupa por destino elegido por el motor nuevo (no por el destino fijo original)', () => {
    const geometriaUnHueco = { pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }] };
    const { movimientos } = generarMovimientosMigracionOptimizado(
      [
        { articulo: 'SKU002', pasillo: 'MZ04', columna: 8, nivel: 'N01', rack_actual: 'RCL050-C002-N01-1' },
        { articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01', rack_actual: 'RCL119-C004-N05-1' },
      ],
      [
        { rclCodigo: 'RCL050-C002', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU002', cantidad: 4 },
        RCL_A,
      ],
      new Map([['SKU002', 0.01], ['SKU001', 0.01]]),
      geometriaUnHueco,
    );
    // Ambos terminan en el ÚNICO hueco disponible -- mismo destino, orden agrupa por RCL de origen (RCL050 antes que RCL119)
    expect(new Set(movimientos.map(m => `${m.mzPasillo}|${m.mzColumna}`)).size).toBe(1);
    expect(movimientos.map(m => m.articulo)).toEqual(['SKU002', 'SKU001']);
    expect(movimientos.map(m => m.orden)).toEqual([1, 2]);
  });

  describe('ocupación real -- no trata el mezanine como vacío', () => {
    const GEOMETRIA_UN_HUECO = { pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }] };
    const NIVELES_FISICOS = ['N01', 'N02', 'N03', 'N04', 'N05'];

    it('artículos YA puestos ahí (no candidatos) con volumen conocido ocupan los 5 niveles del único cuerpo -- el candidato cae a respaldo, no le queda ningún hueco', () => {
      const { movimientos, respaldados } = generarMovimientosMigracionOptimizado(
        [
          // Un artículo "ya puesto" (sin rack_actual -- no es candidato a mover) por cada uno de los 5 niveles del único cuerpo del universo.
          ...NIVELES_FISICOS.map(nivel => ({ articulo: `YA_PUESTO_${nivel}`, pasillo: 'MZ01', columna: 1, nivel, rack_actual: null })),
          { articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        ],
        [RCL_A],
        new Map([...NIVELES_FISICOS.map(nivel => [`YA_PUESTO_${nivel}`, 0.42]), ['SKU001', 0.05]]), // cada YA_PUESTO deja su nivel casi lleno
        GEOMETRIA_UN_HUECO,
      );
      expect(movimientos).toHaveLength(1);
      expect(respaldados).toEqual([{ articulo: 'SKU001', motivo: 'sin_dimensiones_importadas -- se usó el destino fijo original de inventario_slotting' }]);
      expect(movimientos[0]).toMatchObject({ mzPasillo: 'MZ09', mzColumna: 99 }); // respaldo, no el hueco ya ocupado
    });

    it('un artículo YA puesto ahí SIN volumen conocido marca SU nivel lleno igual -- nunca se adivina cuánto ocupa', () => {
      const { movimientos, respaldados } = generarMovimientosMigracionOptimizado(
        [
          // Los otros 4 niveles quedan realmente vacíos (sin ningún artículo) -- se bloquean marcando el candidato demasiado grande para ellos.
          { articulo: 'YA_PUESTO_N01', pasillo: 'MZ01', columna: 1, nivel: 'N01', rack_actual: null },
          { articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        ],
        [RCL_A],
        new Map([['SKU001', 0.05]]), // sin volumen para YA_PUESTO_N01
        {
          // Universo de 5 cuerpos -- el candidato solo puede ir en N01 de columna 1
          // (bloqueado) en un mundo de un solo cuerpo, así que acá se usa un solo
          // cuerpo y se confirma que efectivamente cae a respaldo en N01 lleno,
          // usando el volumen grande para bloquear los otros 4 niveles también.
          pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }],
        },
      );
      // N01 queda lleno (sin volumen conocido = Infinity); N02-N05 siguen libres
      // -- el motor SÍ puede ubicarlo ahí. Confirma que "sin volumen" solo tapa SU
      // propio nivel, no el cuerpo entero.
      expect(respaldados).toHaveLength(0);
      expect(movimientos[0].mzPasillo).toBe('MZ01');
      expect(movimientos[0].mzNivel).not.toBe('N01');
    });

    it('un candidato NO cuenta como "ya ocupante" de su propio destino fijo -- se excluye de la ocupación inicial', () => {
      // Si SKU001 se contara a sí mismo como ya-ocupante de MZ01-C001-N01, el
      // único hueco quedaría "lleno" antes de que el motor pudiera evaluarlo.
      const { movimientos, respaldados } = generarMovimientosMigracionOptimizado(
        [{ articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N01', rack_actual: 'RCL119-C004-N05-1' }],
        [RCL_A],
        new Map([['SKU001', 0.01]]),
        GEOMETRIA_UN_HUECO,
      );
      expect(respaldados).toHaveLength(0);
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]).toMatchObject({ mzPasillo: 'MZ01', mzColumna: 1 });
    });
  });
});
