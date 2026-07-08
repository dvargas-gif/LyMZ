import { describe, it, expect } from 'vitest';
import { aplicarMovimientosLocales, invertirLote } from './movimientosLocales.js';

function racksDe(obj) {
  return new Map(Object.entries(obj));
}

describe('aplicarMovimientosLocales', () => {
  it('mueve un artículo de un nivel a otro rack vacío, sin tocar el resto del nivel de origen', () => {
    const base = racksDe({
      'MZ01|1': { pasillo: 'MZ01', columna: 1, niveles: { N02: [{ articulo: 'A1', clase: 'A' }, { articulo: 'A2', clase: 'B' }] } },
    });
    const resultado = aplicarMovimientosLocales(base, [
      { articulo: 'A1', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N02' }, destino: { pasillo: 'MZ01', columna: 2, nivel: 'N03' } },
    ]);
    expect(resultado.get('MZ01|1').niveles.N02).toEqual([{ articulo: 'A2', clase: 'B' }]);
    expect(resultado.get('MZ01|2').niveles.N03).toEqual([{ articulo: 'A1', clase: 'A' }]);
  });

  it('si el rack de origen queda sin ningún nivel ocupado, desaparece del Map (igual que legacy)', () => {
    const base = racksDe({
      'MZ01|1': { pasillo: 'MZ01', columna: 1, niveles: { N02: [{ articulo: 'A1' }] } },
    });
    const resultado = aplicarMovimientosLocales(base, [
      { articulo: 'A1', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N02' }, destino: { pasillo: 'MZ02', columna: 1, nivel: 'N02' } },
    ]);
    expect(resultado.has('MZ01|1')).toBe(false);
  });

  it('mueve un cuerpo completo (varios artículos, mismos niveles preservados) al destino', () => {
    const base = racksDe({
      'MZ01|1': { pasillo: 'MZ01', columna: 1, niveles: { N01: [{ articulo: 'A1' }], N02: [{ articulo: 'A2' }] } },
    });
    const movimientos = [
      { articulo: 'A1', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N01' }, destino: { pasillo: 'MZ05', columna: 3, nivel: 'N01' } },
      { articulo: 'A2', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N02' }, destino: { pasillo: 'MZ05', columna: 3, nivel: 'N02' } },
    ];
    const resultado = aplicarMovimientosLocales(base, movimientos);
    expect(resultado.has('MZ01|1')).toBe(false);
    expect(resultado.get('MZ05|3').niveles).toEqual({ N01: [{ articulo: 'A1' }], N02: [{ articulo: 'A2' }] });
  });

  it('no muta el Map original (inmutable)', () => {
    const base = racksDe({ 'MZ01|1': { pasillo: 'MZ01', columna: 1, niveles: { N02: [{ articulo: 'A1' }] } } });
    aplicarMovimientosLocales(base, [{ articulo: 'A1', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N02' }, destino: { pasillo: 'MZ02', columna: 1, nivel: 'N02' } }]);
    expect(base.get('MZ01|1').niveles.N02).toEqual([{ articulo: 'A1' }]);
  });

  it('agrega al destino sin pisar artículos que ya estaban en ese nivel', () => {
    const base = racksDe({
      'MZ01|1': { pasillo: 'MZ01', columna: 1, niveles: { N02: [{ articulo: 'A1' }] } },
      'MZ02|1': { pasillo: 'MZ02', columna: 1, niveles: { N02: [{ articulo: 'B1' }] } },
    });
    const resultado = aplicarMovimientosLocales(base, [
      { articulo: 'A1', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N02' }, destino: { pasillo: 'MZ02', columna: 1, nivel: 'N02' } },
    ]);
    expect(resultado.get('MZ02|1').niveles.N02).toEqual([{ articulo: 'B1' }, { articulo: 'A1' }]);
  });
});

describe('invertirLote + aplicarMovimientosLocales (ida y vuelta = deshacer)', () => {
  it('aplicar un lote y después su inverso devuelve el estado original', () => {
    const base = racksDe({
      'MZ01|1': { pasillo: 'MZ01', columna: 1, niveles: { N01: [{ articulo: 'A1', clase: 'A' }], N02: [{ articulo: 'A2', clase: 'B' }] } },
    });
    const lote = [
      { articulo: 'A1', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N01' }, destino: { pasillo: 'MZ07', columna: 4, nivel: 'N01' }, clase: 'A' },
      { articulo: 'A2', origen: { pasillo: 'MZ01', columna: 1, nivel: 'N02' }, destino: { pasillo: 'MZ07', columna: 4, nivel: 'N02' }, clase: 'B' },
    ];
    const despuesDeMover = aplicarMovimientosLocales(base, lote);
    expect(despuesDeMover.has('MZ01|1')).toBe(false);

    const despuesDeDeshacer = aplicarMovimientosLocales(despuesDeMover, invertirLote(lote));
    expect(despuesDeDeshacer.get('MZ01|1').niveles).toEqual({ N01: [{ articulo: 'A1', clase: 'A' }], N02: [{ articulo: 'A2', clase: 'B' }] });
    expect(despuesDeDeshacer.has('MZ07|4')).toBe(false);
  });
});
