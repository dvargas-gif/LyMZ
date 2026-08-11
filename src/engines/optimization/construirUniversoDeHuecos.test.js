import { describe, it, expect } from 'vitest';
import { construirUniversoDeHuecos, TOLERANCIA_OCUPACION, CAPACIDAD_UTIL_NIVEL_M3, CAPACIDAD_UTIL_CUERPO_M3 } from './construirUniversoDeHuecos.js';
import datosCrudos from '../../domain/geometriaMezanine.data.json';
import { validarGeometria } from '../../domain/GeometriaMezanine.js';

const geometriaReal = validarGeometria(datosCrudos);

describe('TOLERANCIA_OCUPACION', () => {
  it('es 97.5% -- 2.5% de espacio libre máximo, pedido explícito', () => {
    expect(TOLERANCIA_OCUPACION).toBe(0.975);
  });

  it('la capacidad útil de nivel y cuerpo son 97.5% de las constantes de referencia', () => {
    expect(CAPACIDAD_UTIL_NIVEL_M3).toBeCloseTo(0.432 * 0.975, 6);
    expect(CAPACIDAD_UTIL_CUERPO_M3).toBeCloseTo(2.16 * 0.975, 6);
  });
});

describe('construirUniversoDeHuecos', () => {
  it('aplana pasillos/ubicaciones a una lista plana de cuerpos con pasillo/columna/x/y', () => {
    const geometria = {
      pasillos: [
        { pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }, { columna: 2, x: 3, y: 2 }] },
        { pasillo: 'MZ02', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 5 }] },
      ],
    };
    const cuerpos = construirUniversoDeHuecos(geometria);
    expect(cuerpos).toHaveLength(3);
    expect(cuerpos).toContainEqual({ pasillo: 'MZ01', columna: 1, x: 1, y: 2 });
    expect(cuerpos).toContainEqual({ pasillo: 'MZ02', columna: 1, x: 1, y: 5 });
  });

  it('con la geometría real, incluye los 12 pasillos y MZ08 tiene exactamente 39 columnas (número real del DXF, no el esquemático)', () => {
    const cuerpos = construirUniversoDeHuecos(geometriaReal);
    const pasillos = new Set(cuerpos.map(c => c.pasillo));
    expect(pasillos).toEqual(new Set(['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08', 'MZ09', 'MZ10', 'MZ11', 'MZ12']));
    expect(cuerpos.filter(c => c.pasillo === 'MZ08')).toHaveLength(39);
  });

  it('con la geometría real, el total de cuerpos es 304 (mismo número ya validado en geometriaMezanine.test.js)', () => {
    expect(construirUniversoDeHuecos(geometriaReal)).toHaveLength(304);
  });
});
