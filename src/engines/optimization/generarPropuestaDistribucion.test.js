import { describe, it, expect } from 'vitest';
import { generarPropuestaDistribucion } from './generarPropuestaDistribucion.js';
import { CAPACIDAD_UTIL_CUERPO_M3 } from './construirUniversoDeHuecos.js';

// Geometría sintética mínima. MZ02 columna 20 es la "zona óptima" de este
// test (zona configurable, ver `zonas.optimaClaseA` en opciones abajo).
function geometriaSintetica() {
  return {
    pasillos: [
      { pasillo: 'MZ02', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 0 }, { columna: 20, x: 3, y: 0 }] },
      { pasillo: 'MZ05', orientacion: 'horizontal', ubicaciones: [
        { columna: 1, x: 100, y: 0 }, { columna: 2, x: 101, y: 0 }, { columna: 3, x: 102, y: 0 },
      ] },
    ],
  };
}

const OPCIONES_TEST = { zonas: { optimaClaseA: { pasillo: 'MZ02', columnaDesde: 20, columnaHasta: 20 } } };

/**
 * Dataset sintético (pedido explícito de verificación, F5b) -- resultado
 * calculado a mano antes de correr el motor:
 * - 1 "grande" (no entra en un nivel) -> debe caer en un hueco tipo CUERPO.
 * - 1 clase A chico -> debe preferir la columna 20 de MZ02 (única en la zona).
 * - 10 artículos chicos variados -> deben entrar todos (sobra espacio real).
 * - 1 que supera incluso la capacidad de un cuerpo completo -> sin asignar.
 * - 1 sin dimensiones (volumenM3 null) -> sin asignar, motivo explícito.
 * Total: 14 artículos, 12 asignados, 2 sin asignar.
 */
function datasetSintetico() {
  const chicos = Array.from({ length: 10 }, (_, i) => ({ articulo: `M${i + 1}`, volumenM3: 0.01, clase: 'B' }));
  return [
    { articulo: 'GRANDE', volumenM3: 1.5, clase: 'C' },
    { articulo: 'A_ZONA', volumenM3: 0.05, clase: 'A' },
    ...chicos,
    { articulo: 'IMPOSIBLE', volumenM3: CAPACIDAD_UTIL_CUERPO_M3 + 1, clase: 'C' },
    { articulo: 'SIN_DIM', volumenM3: null, clase: 'C' },
  ];
}

describe('generarPropuestaDistribucion -- dataset sintético de 14 artículos', () => {
  it('produce el resumen agregado esperado, calculado a mano', () => {
    const propuesta = generarPropuestaDistribucion(datasetSintetico(), new Map(), geometriaSintetica(), OPCIONES_TEST);

    expect(propuesta.resumen.totalArticulos).toBe(14);
    expect(propuesta.resumen.totalSinAsignar).toBe(2);
    expect(propuesta.resumen.totalAsignados).toBe(12);
    expect(propuesta.resumen.totalMovimientos).toBe(12); // sin posición previa -- todos son "movimiento" nuevo
  });

  it('el artículo GRANDE cae en un hueco tipo CUERPO', () => {
    const propuesta = generarPropuestaDistribucion(datasetSintetico(), new Map(), geometriaSintetica(), OPCIONES_TEST);
    const grande = propuesta.diff.find(d => d.articulo === 'GRANDE');
    expect(grande.destino.nivel).toBe('CUERPO');
  });

  it('el artículo clase A (A_ZONA) se ubica en la columna 20 de MZ02, la única en la zona óptima', () => {
    const propuesta = generarPropuestaDistribucion(datasetSintetico(), new Map(), geometriaSintetica(), OPCIONES_TEST);
    const aZona = propuesta.diff.find(d => d.articulo === 'A_ZONA');
    expect(aZona.destino).toMatchObject({ pasillo: 'MZ02', columna: 20 });
    expect(aZona.afinidad).toBe(2);
  });

  it('IMPOSIBLE y SIN_DIM quedan sin asignar con sus motivos exactos, nunca en silencio', () => {
    const propuesta = generarPropuestaDistribucion(datasetSintetico(), new Map(), geometriaSintetica(), OPCIONES_TEST);
    expect(propuesta.sinAsignar).toContainEqual({ articulo: 'IMPOSIBLE', motivo: 'excede_capacidad_maxima_de_un_cuerpo' });
    expect(propuesta.sinAsignar).toContainEqual({ articulo: 'SIN_DIM', motivo: 'sin_dimensiones_importadas' });
  });

  it('los 10 artículos chicos (M1-M10) quedan todos asignados -- sobra espacio real en el universo sintético', () => {
    const propuesta = generarPropuestaDistribucion(datasetSintetico(), new Map(), geometriaSintetica(), OPCIONES_TEST);
    for (let i = 1; i <= 10; i++) {
      expect(propuesta.diff.find(d => d.articulo === `M${i}`)).toBeDefined();
    }
  });

  it('respeta una posición actual real -- si el destino coincide con donde ya estaba, cambiaUbicacion es false', () => {
    const posiciones = new Map([['A_ZONA', { pasillo: 'MZ02', columna: 20, nivel: 'N01' }]]);
    const propuesta = generarPropuestaDistribucion(datasetSintetico(), posiciones, geometriaSintetica(), OPCIONES_TEST);
    const aZona = propuesta.diff.find(d => d.articulo === 'A_ZONA');
    // El motor siempre elige N01 primero entre niveles idénticos (empate determinístico) -- coincide con la posición ya dada.
    expect(aZona.cambiaUbicacion).toBe(false);
  });

  it('es determinístico -- misma entrada, mismo resultado exacto en dos corridas completas', () => {
    const r1 = generarPropuestaDistribucion(datasetSintetico(), new Map(), geometriaSintetica(), OPCIONES_TEST);
    const r2 = generarPropuestaDistribucion(datasetSintetico(), new Map(), geometriaSintetica(), OPCIONES_TEST);
    expect(r1).toEqual(r2);
  });
});
