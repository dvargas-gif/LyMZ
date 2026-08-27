import { describe, it, expect } from 'vitest';
import { buscarSugerencias } from './buscarSugerencias.js';

const CELDAS = [
  { pasillo: 'MZ01', columna: 1 },
  { pasillo: 'MZ02', columna: 1 },
  { pasillo: 'MZ09', columna: 3 },
];

function racksDe(...entradas) {
  const m = new Map();
  for (const [clave, rack] of entradas) m.set(clave, rack);
  return m;
}

describe('buscarSugerencias', () => {
  it('sin texto, devuelve vacío', () => {
    expect(buscarSugerencias('', CELDAS, new Map())).toEqual([]);
  });

  it('encuentra por artículo (parcial)', () => {
    const racks = racksDe(['MZ01|1', { niveles: { N01: [{ articulo: '9041260', rackActual: 'RCL100-C001-N01-1' }] } }]);
    const r = buscarSugerencias('904126', CELDAS, racks);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'articulo', pasillo: 'MZ01', columna: 1, articulo: '9041260' });
  });

  it('encuentra por RCL (rackActual)', () => {
    const racks = racksDe(['MZ01|1', { niveles: { N01: [{ articulo: '9041260', rackActual: 'RCL100-C001-N01-1' }] } }]);
    const r = buscarSugerencias('rcl100-c001', CELDAS, racks);
    expect(r.some(s => s.tipo === 'rcl' && s.articulo === '9041260')).toBe(true);
  });

  it('encuentra por MZ (pasillo-columna)', () => {
    const r = buscarSugerencias('mz09-c003', CELDAS, new Map());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'mz', pasillo: 'MZ09', columna: 3 });
  });

  it('buscar solo el pasillo (sin columna) encuentra todas sus celdas', () => {
    const r = buscarSugerencias('mz01', CELDAS, new Map());
    expect(r).toHaveLength(1); // en este fixture MZ01 solo tiene la columna 1
    expect(r[0].pasillo).toBe('MZ01');
  });

  it('un mismo artículo puede matchear por su propio código Y por su RCL a la vez -- dos sugerencias distintas', () => {
    const racks = racksDe(['MZ01|1', { niveles: { N01: [{ articulo: 'RCL999', rackActual: 'RCL999-C001-N01-1' }] } }]);
    const r = buscarSugerencias('rcl999', CELDAS, racks);
    expect(r).toHaveLength(2);
    expect(r.map(s => s.tipo).sort()).toEqual(['articulo', 'rcl']);
  });

  it('no duplica la misma sugerencia MZ si varios artículos comparten la celda', () => {
    const racks = racksDe(['MZ01|1', { niveles: { N01: [{ articulo: 'A1', rackActual: null }, { articulo: 'A2', rackActual: null }] } }]);
    const r = buscarSugerencias('mz01', CELDAS, racks);
    expect(r.filter(s => s.tipo === 'mz')).toHaveLength(1);
  });

  it('respeta el límite de resultados', () => {
    const celdas = Array.from({ length: 20 }, (_, i) => ({ pasillo: 'MZ01', columna: i + 1 }));
    const r = buscarSugerencias('mz01', celdas, new Map(), 5);
    expect(r).toHaveLength(5);
  });

  it('sin coincidencias, devuelve vacío', () => {
    expect(buscarSugerencias('xyz-no-existe', CELDAS, new Map())).toEqual([]);
  });

  it('artículo sin rackActual (null) no rompe la búsqueda por RCL', () => {
    const racks = racksDe(['MZ01|1', { niveles: { N01: [{ articulo: 'A1', rackActual: null }] } }]);
    expect(() => buscarSugerencias('rcl', CELDAS, racks)).not.toThrow();
  });
});
