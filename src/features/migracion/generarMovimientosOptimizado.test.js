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
    const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }], // destino fijo original, distinto del universo real de huecos
      [RCL_A],
      new Map([['SKU001', 0.05]]),
      GEOMETRIA_MINIMA,
    );
    expect(sinAsignar).toHaveLength(0);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ rclCodigo: 'RCL119-C004', rclNivel: 5, articulo: 'SKU001', cantidad: 10, orden: 1 });
    // El destino viene del universo real (MZ01/MZ02 de GEOMETRIA_MINIMA), no del fijo original (MZ09-C099)
    expect(['MZ01', 'MZ02']).toContain(movimientos[0].mzPasillo);
    expect(movimientos[0].mzPasillo === 'MZ09').toBe(false);
  });

  /**
   * 2026-08-28, corregido dos veces el mismo día tras el incidente real en
   * vivo (David: "no mezclar máquina, no mezclar... no me sirve que
   * mezcles los artículos sin volumen") -- versión anterior de este test
   * esperaba que el sistema usara el destino fijo de inventario_slotting
   * como "respaldo" y generara una tarea normal. Eso fue exactamente lo que
   * mandó a un trabajador real a MZ01-C031 (columna que ya no existe) en la
   * primera acción de la primera prueba en vivo -- y aunque el destino
   * hubiera sido válido, estos artículos NUNCA deben entrar al despacho
   * secuencial: son dominio exclusivo del equipo de movimiento libre
   * (Bairon). Ahora: sin volumen -> NUNCA genera movimiento, siempre cae a
   * `sinAsignar`, sin excepción, exista o no el destino fijo original.
   */
  it('artículo SIN volumen cargado -- NUNCA genera movimiento, cae a `sinAsignar` para el equipo de movimiento libre (Bairon)', () => {
    const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ02', columna: 1, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }],
      [RCL_A],
      new Map(), // sin volumen para SKU001
      GEOMETRIA_MINIMA,
    );
    expect(movimientos).toHaveLength(0);
    expect(sinAsignar).toHaveLength(1);
    expect(sinAsignar[0]).toMatchObject({
      articulo: 'SKU001', rclCodigo: 'RCL119-C004', rclNivel: 5,
      posicionOriginal: { pasillo: 'MZ02', columna: 1, nivel: 'N05' },
    });
    expect(sinAsignar[0].motivo).toMatch(/movimiento libre \(Bairon\)/);
  });

  it('artículo SIN volumen cargado cuyo destino fijo original YA NI EXISTE en la geometría real (bug real 2026-08-28: "la primera acción me genera en el MZ01-C031 pero en el mapa yo solo tengo el cuerpo MZ01-C027") -- mismo resultado: NUNCA genera movimiento', () => {
    const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ01', columna: 31, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' }], // MZ01 solo tiene columnas 1-2 en GEOMETRIA_MINIMA -- C031 es un dato desactualizado de inventario_slotting
      [RCL_A],
      new Map(), // sin volumen para SKU001
      GEOMETRIA_MINIMA,
    );
    expect(movimientos).toHaveLength(0); // nunca se ofrece un destino que no existe físicamente -- ni ningún otro, sin volumen no hay tarea
    expect(sinAsignar).toHaveLength(1);
    expect(sinAsignar[0]).toMatchObject({
      articulo: 'SKU001', rclCodigo: 'RCL119-C004', rclNivel: 5,
      posicionOriginal: { pasillo: 'MZ01', columna: 31, nivel: 'N05' },
    });
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

  it('artículo sin rack_actual parseable -- se ignora, ni movimiento ni sinStock ni sinAsignar', () => {
    const { movimientos, sinStock, sinAsignar } = generarMovimientosMigracionOptimizado(
      [{ articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: null }],
      [],
      new Map(),
      GEOMETRIA_MINIMA,
    );
    expect(movimientos).toHaveLength(0);
    expect(sinStock).toHaveLength(0);
    expect(sinAsignar).toHaveLength(0);
  });

  it('el motor de optimización no encuentra hueco (universo lleno) -- aunque el artículo SÍ tenga volumen real, NUNCA genera movimiento, cae a sinAsignar', () => {
    const geometriaChica = { pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }] };
    const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
      [
        { articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        { articulo: 'SKU003', pasillo: 'MZ01', columna: 1, nivel: 'N04', rack_actual: 'RCL120-C005-N04-1' },
      ],
      [RCL_A, { rclCodigo: 'RCL120-C005', rclNivel: 4, rclSubnivel: 1, articulo: 'SKU003', cantidad: 3 }],
      new Map([['SKU001', 10], ['SKU003', 10]]), // volumen enorme -- ninguno entra en el único hueco chico
      geometriaChica,
    );
    expect(movimientos).toHaveLength(0);
    expect(sinAsignar.map(s => s.articulo).sort()).toEqual(['SKU001', 'SKU003']);
    expect(sinAsignar[0].motivo).toMatch(/revisión manual/);
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

    it('artículos YA puestos ahí (no candidatos) con volumen conocido ocupan los 5 niveles del único cuerpo -- el candidato sin volumen igual cae a sinAsignar, nunca a un destino fantasma', () => {
      const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
        [
          // Un artículo "ya puesto" (sin rack_actual -- no es candidato a mover) por cada uno de los 5 niveles del único cuerpo del universo.
          ...NIVELES_FISICOS.map(nivel => ({ articulo: `YA_PUESTO_${nivel}`, pasillo: 'MZ01', columna: 1, nivel, rack_actual: null })),
          { articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        ],
        [RCL_A],
        new Map([...NIVELES_FISICOS.map(nivel => [`YA_PUESTO_${nivel}`, 0.42]), ['SKU001', 0.05]]), // cada YA_PUESTO deja su nivel casi lleno
        GEOMETRIA_UN_HUECO,
      );
      expect(movimientos).toHaveLength(0);
      expect(sinAsignar).toHaveLength(1);
      expect(sinAsignar[0].articulo).toBe('SKU001');
    });

    it('un artículo YA puesto ahí SIN volumen conocido marca SU nivel lleno igual -- nunca se adivina cuánto ocupa', () => {
      const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
        [
          // Los otros 4 niveles quedan realmente vacíos (sin ningún artículo) -- se bloquean marcando el candidato demasiado grande para ellos.
          { articulo: 'YA_PUESTO_N01', pasillo: 'MZ01', columna: 1, nivel: 'N01', rack_actual: null },
          { articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        ],
        [RCL_A],
        new Map([['SKU001', 0.05]]), // sin volumen para YA_PUESTO_N01
        {
          // Universo de 5 niveles en un solo cuerpo -- N01 queda bloqueado (sin
          // volumen conocido = Infinity), N02-N05 siguen libres para el candidato.
          pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }],
        },
      );
      // N01 queda lleno (sin volumen conocido = Infinity); N02-N05 siguen libres
      // -- el motor SÍ puede ubicarlo ahí. Confirma que "sin volumen" solo tapa SU
      // propio nivel, no el cuerpo entero.
      expect(sinAsignar).toHaveLength(0);
      expect(movimientos[0].mzPasillo).toBe('MZ01');
      expect(movimientos[0].mzNivel).not.toBe('N01');
    });

    it('un candidato NO cuenta como "ya ocupante" de su propio destino fijo -- se excluye de la ocupación inicial', () => {
      // Si SKU001 se contara a sí mismo como ya-ocupante de MZ01-C001-N01, el
      // único hueco quedaría "lleno" antes de que el motor pudiera evaluarlo.
      const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
        [{ articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N01', rack_actual: 'RCL119-C004-N05-1' }],
        [RCL_A],
        new Map([['SKU001', 0.01]]),
        GEOMETRIA_UN_HUECO,
      );
      expect(sinAsignar).toHaveLength(0);
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]).toMatchObject({ mzPasillo: 'MZ01', mzColumna: 1 });
    });
  });

  describe('posiciones_actuales -- movidos a mano después del último inventario_slotting (2026-08-28, "no puede ser que esto pase")', () => {
    const GEOMETRIA_UN_HUECO = { pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }] };

    it('un artículo movido a mano libera su posición vieja de inventario_slotting y ocupa la nueva -- el candidato va al hueco realmente libre, no al que dice el slotting desactualizado', () => {
      const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
        [
          // inventario_slotting (nunca se actualiza): YA_PUESTO figura en N01, y N03-N05 los ocupan otros artículos que nunca se movieron.
          { articulo: 'YA_PUESTO', pasillo: 'MZ01', columna: 1, nivel: 'N01', rack_actual: null },
          { articulo: 'FILLER_N03', pasillo: 'MZ01', columna: 1, nivel: 'N03', rack_actual: null },
          { articulo: 'FILLER_N04', pasillo: 'MZ01', columna: 1, nivel: 'N04', rack_actual: null },
          { articulo: 'FILLER_N05', pasillo: 'MZ01', columna: 1, nivel: 'N05', rack_actual: null },
          { articulo: 'SKU001', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        ],
        [RCL_A],
        new Map([['YA_PUESTO', 0.42], ['FILLER_N03', 0.42], ['FILLER_N04', 0.42], ['FILLER_N05', 0.42], ['SKU001', 0.05]]),
        GEOMETRIA_UN_HUECO,
        // posiciones_actuales: Bairon movió YA_PUESTO de N01 a N02 a mano -- N01 quedó libre de verdad, N02 es el que está físicamente ocupado ahora.
        [{ articulo: 'YA_PUESTO', pasillo: 'MZ01', columna: 1, nivel: 'N02' }],
      );
      // Sin el fix: N02 se seguía viendo "libre" (posiciones_actuales se ignoraba) y el motor se lo hubiera ofrecido a SKU001,
      // chocando con lo que Bairon ya puso ahí físicamente. Con el fix, el único hueco realmente libre es N01.
      expect(sinAsignar).toHaveLength(0);
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]).toMatchObject({ mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 'N01' });
    });

    it('un artículo que solo existe en posiciones_actuales (sin fila en inventario_slotting, ej. carga masiva) también cuenta como ya-ocupante', () => {
      const { movimientos, sinAsignar } = generarMovimientosMigracionOptimizado(
        [
          { articulo: 'FILLER_N02', pasillo: 'MZ01', columna: 1, nivel: 'N02', rack_actual: null },
          { articulo: 'FILLER_N03', pasillo: 'MZ01', columna: 1, nivel: 'N03', rack_actual: null },
          { articulo: 'FILLER_N04', pasillo: 'MZ01', columna: 1, nivel: 'N04', rack_actual: null },
          { articulo: 'FILLER_N05', pasillo: 'MZ01', columna: 1, nivel: 'N05', rack_actual: null },
          { articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' },
        ],
        [RCL_A],
        new Map([['SOLO_MANUAL', 0.42], ['FILLER_N02', 0.42], ['FILLER_N03', 0.42], ['FILLER_N04', 0.42], ['FILLER_N05', 0.42], ['SKU001', 0.05]]),
        GEOMETRIA_UN_HUECO,
        // SOLO_MANUAL nunca tuvo fila en inventario_slotting -- p.ej. se agregó por carga masiva directo a posiciones_actuales.
        [{ articulo: 'SOLO_MANUAL', pasillo: 'MZ01', columna: 1, nivel: 'N01' }],
      );
      // Los 5 niveles del único cuerpo quedan ocupados (4 por inventario_slotting + N01 solo por posiciones_actuales) -- SKU001 SÍ tiene volumen real, pero no hay ningún hueco -- sinAsignar, nunca un destino fantasma.
      expect(movimientos).toHaveLength(0);
      expect(sinAsignar).toHaveLength(1);
      expect(sinAsignar[0].articulo).toBe('SKU001');
    });
  });
});
