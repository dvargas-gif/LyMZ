import { describe, it, expect } from 'vitest';
import { calcularResumenOcupacion } from './resumenOcupacion.js';
import { CONFIGURACION_OCUPACION_DEFAULT as CFG } from './configuracionOcupacion.js';

function rack(pasillo, columna, niveles) {
  return { pasillo, columna, niveles };
}

describe('calcularResumenOcupacion', () => {
  it('clasifica racks en sobrecargados/enAlerta/ok según los mismos umbrales que colorLlenura', () => {
    const racks = new Map([
      ['MZ01|1', rack('MZ01', 1, { N01: [{ consumo: 5 }] })],       // 5/4.5 = 1.11 -> sobrecargado
      ['MZ01|2', rack('MZ01', 2, { N01: [{ consumo: 4.0 }] })],      // 4.0/4.5 = 0.89 -> alerta
      ['MZ01|3', rack('MZ01', 3, { N01: [{ consumo: 1.0 }] })],      // 1.0/4.5 = 0.22 -> ok
    ]);
    const resumen = calcularResumenOcupacion(racks, CFG);
    expect(resumen.totalRacks).toBe(3);
    expect(resumen.sobrecargados).toHaveLength(1);
    expect(resumen.sobrecargados[0].clave).toBe('MZ01|1');
    expect(resumen.enAlerta).toHaveLength(1);
    expect(resumen.enAlerta[0].clave).toBe('MZ01|2');
    expect(resumen.ok).toHaveLength(1);
    expect(resumen.ok[0].clave).toBe('MZ01|3');
  });

  it('llenuraPromedio es el promedio simple de la llenura de todos los racks', () => {
    const racks = new Map([
      ['MZ01|1', rack('MZ01', 1, { N01: [{ consumo: 4.5 }] })], // llenura 1.0
      ['MZ01|2', rack('MZ01', 2, { N01: [{ consumo: 0 }] })],   // llenura 0.0
    ]);
    const resumen = calcularResumenOcupacion(racks, CFG);
    expect(resumen.llenuraPromedio).toBeCloseTo(0.5);
  });

  it('conNivelesPendientes toma el nivelesAArmar más alto entre los artículos de cada rack, ordenado descendente', () => {
    const racks = new Map([
      ['MZ01|1', rack('MZ01', 1, { N01: [{ consumo: 1, nivelesAArmar: 2 }], N02: [{ consumo: 1, nivelesAArmar: 4 }] })],
      ['MZ01|2', rack('MZ01', 2, { N01: [{ consumo: 1, nivelesAArmar: 0 }] })], // sin pendientes -- no debe aparecer
      ['MZ01|3', rack('MZ01', 3, { N01: [{ consumo: 1, nivelesAArmar: 1 }] })],
    ]);
    const resumen = calcularResumenOcupacion(racks, CFG);
    expect(resumen.conNivelesPendientes.map(f => f.clave)).toEqual(['MZ01|1', 'MZ01|3']);
    expect(resumen.conNivelesPendientes[0].nivelesAArmar).toBe(4); // el máximo del rack, no el primero
  });

  it('topMasLlenos respeta topN y ordena descendente por llenura', () => {
    const racks = new Map([
      ['MZ01|1', rack('MZ01', 1, { N01: [{ consumo: 1 }] })],
      ['MZ01|2', rack('MZ01', 2, { N01: [{ consumo: 4 }] })],
      ['MZ01|3', rack('MZ01', 3, { N01: [{ consumo: 2 }] })],
    ]);
    const resumen = calcularResumenOcupacion(racks, CFG, { topN: 2 });
    expect(resumen.topMasLlenos).toHaveLength(2);
    expect(resumen.topMasLlenos.map(f => f.clave)).toEqual(['MZ01|2', 'MZ01|3']);
  });

  it('sin racks -> resumen vacío consistente, sin dividir por cero', () => {
    const resumen = calcularResumenOcupacion(new Map(), CFG);
    expect(resumen.totalRacks).toBe(0);
    expect(resumen.llenuraPromedio).toBe(0);
    expect(resumen.sobrecargados).toEqual([]);
    expect(resumen.conNivelesPendientes).toEqual([]);
  });
});
