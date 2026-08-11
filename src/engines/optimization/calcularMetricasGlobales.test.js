import { describe, it, expect } from 'vitest';
import { calcularMetricasGlobales } from './calcularMetricasGlobales.js';

function articulo(articulo, volumenM3, clase, picksNormalizado = 0) { return { articulo, volumenM3, clase, picksNormalizado }; }
function asignacion(articulo, pasillo, columna, nivel) { return { articulo, pasillo, columna, nivel }; }

describe('calcularMetricasGlobales', () => {
  it('tasa de clase A en zona óptima: cuenta solo los clase A que cayeron en MZ02 19-27', () => {
    const articulos = [articulo('A1', 0.01, 'A'), articulo('A2', 0.01, 'A')];
    const asignaciones = [asignacion('A1', 'MZ02', 20, 'N01'), asignacion('A2', 'MZ05', 12, 'N01')];
    const m = calcularMetricasGlobales(asignaciones, articulos);
    expect(m.tasaClaseAEnOptima).toBe(0.5); // 1 de 2
  });

  it('tasa de alta frecuencia en zona accesible: usa el umbral pasado por opciones', () => {
    const articulos = [articulo('F1', 0.01, 'D', 0.95), articulo('F2', 0.01, 'D', 0.1)];
    const asignaciones = [asignacion('F1', 'MZ05', 12, 'N01'), asignacion('F2', 'MZ01', 30, 'N01')];
    const m = calcularMetricasGlobales(asignaciones, articulos, { umbralAltaFrecuencia: 0.9 });
    // solo F1 califica como alta frecuencia (>=0.9), y cae en zona accesible -> 1/1
    expect(m.tasaAltaFrecuenciaEnAccesible).toBe(1);
  });

  it('fragmentación: % de niveles usados con exactamente 1 artículo distinto', () => {
    const articulos = [articulo('A1', 0.01), articulo('A2', 0.01), articulo('A3', 0.01)];
    const asignaciones = [
      asignacion('A1', 'MZ01', 1, 'N01'), // solo -- fragmentado
      asignacion('A2', 'MZ01', 1, 'N02'),
      asignacion('A3', 'MZ01', 1, 'N02'), // comparte con A2 -- no fragmentado
    ];
    const m = calcularMetricasGlobales(asignaciones, articulos);
    expect(m.nivelesUsados).toBe(2);
    expect(m.fragmentacion).toBe(0.5); // 1 de 2 niveles con un solo artículo
  });

  it('densidad ponderada: volumen total asignado / capacidad total de los bins usados', () => {
    const articulos = [articulo('A1', 0.2), articulo('A2', 0.2)];
    const asignaciones = [asignacion('A1', 'MZ01', 1, 'N01'), asignacion('A2', 'MZ01', 1, 'N01')];
    const m = calcularMetricasGlobales(asignaciones, articulos);
    expect(m.densidadPonderada).toBeCloseTo(0.4 / 0.4212, 3);
  });

  it('sin artículos clase A en el dataset, la tasa es null (no 0 engañoso -- no aplica, no "cumplió 0%")', () => {
    const m = calcularMetricasGlobales([], [articulo('A1', 0.01, 'D')]);
    expect(m.tasaClaseAEnOptima).toBeNull();
  });
});
