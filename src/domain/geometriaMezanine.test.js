import { describe, it, expect } from 'vitest';
import { validarGeometria, indexarPorClave, GeometriaMezanineSchema } from './GeometriaMezanine.js';
import datosCrudos from './geometriaMezanine.data.json';

/**
 * Los datos vienen de un proceso de extracción del DXF real (ver
 * DECISIONES.md) -- estos tests fijan el resultado ya validado con el
 * usuario, no una expectativa inventada. Si el DXF se vuelve a exportar y
 * se re-extrae, este archivo es lo que hay que volver a correr para
 * confirmar que el nuevo resultado sigue siendo razonable.
 */
describe('geometriaMezanine.data.json', () => {
  it('valida contra el schema sin tirar', () => {
    expect(() => validarGeometria(datosCrudos)).not.toThrow();
  });

  it('tiene los 12 pasillos reales (MZ01-MZ12)', () => {
    const g = validarGeometria(datosCrudos);
    const nombres = g.pasillos.map(p => p.pasillo).sort();
    expect(nombres).toEqual(['MZ01','MZ02','MZ03','MZ04','MZ05','MZ06','MZ07','MZ08','MZ09','MZ10','MZ11','MZ12']);
  });

  it('MZ11 no tiene racks construidos todavía (posición reservada, sin ubicaciones)', () => {
    const g = validarGeometria(datosCrudos);
    const mz11 = g.pasillos.find(p => p.pasillo === 'MZ11');
    expect(mz11.ubicaciones).toEqual([]);
  });

  it('MZ11 y MZ12 son verticales -- los demás, horizontales', () => {
    const g = validarGeometria(datosCrudos);
    const verticales = g.pasillos.filter(p => p.orientacion === 'vertical').map(p => p.pasillo).sort();
    expect(verticales).toEqual(['MZ11', 'MZ12']);
  });

  it('cada columna dentro de un pasillo es única (sin duplicados)', () => {
    const g = validarGeometria(datosCrudos);
    for (const p of g.pasillos) {
      const columnas = p.ubicaciones.map(u => u.columna);
      expect(new Set(columnas).size).toBe(columnas.length);
    }
  });

  it('indexarPorClave permite buscar una ubicación puntual por "pasillo|columna"', () => {
    const g = validarGeometria(datosCrudos);
    const indice = indexarPorClave(g);
    const mz04c1 = indice.get('MZ04|1');
    expect(mz04c1).toBeDefined();
    expect(mz04c1.x).toBeCloseTo(305.427, 1);
  });

  it('el total de cuerpos reales con posición es 300 (304 en el plano, 4 descartados como ruido -- ver DECISIONES.md)', () => {
    const g = validarGeometria(datosCrudos);
    const total = g.pasillos.reduce((s, p) => s + p.ubicaciones.length, 0);
    expect(total).toBe(300);
  });
});

describe('GeometriaMezanineSchema', () => {
  it('rechaza una columna no entera o negativa', () => {
    const invalido = { version: 1, unidad: 'metros', generadoDesde: 'x', pasillos: [
      { pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: -1, x: 0, y: 0 }] },
    ] };
    expect(() => GeometriaMezanineSchema.parse(invalido)).toThrow();
  });

  it('rechaza una orientación que no sea horizontal/vertical', () => {
    const invalido = { version: 1, unidad: 'metros', generadoDesde: 'x', pasillos: [
      { pasillo: 'MZ01', orientacion: 'diagonal', ubicaciones: [] },
    ] };
    expect(() => GeometriaMezanineSchema.parse(invalido)).toThrow();
  });
});
