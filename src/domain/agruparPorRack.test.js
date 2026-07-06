import { describe, it, expect } from 'vitest';
import { agruparPorRack } from './agruparPorRack.js';
import { resolverPosicionesActuales } from './resolverPosicionesActuales.js';
import { nArts, nivelesOcupados, consumoTotal } from './formulasOcupacion.js';

describe('agruparPorRack', () => {
  it('agrupa artículos de un mismo rack en el mismo nivel', () => {
    const base = [
      { articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL', consumo: 0.5, picks: 10 },
      { articulo: 'A2', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL', consumo: 0.3, picks: 5 },
    ];
    const racks = agruparPorRack(resolverPosicionesActuales(base, []));
    const rack = racks.get('MZ01|1');
    expect(rack.niveles.N01).toHaveLength(2);
    expect(consumoTotal(rack)).toBeCloseTo(0.8);
  });

  it('un artículo movido se agrupa en su rack DESTINO, no en el de origen', () => {
    const base = [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL', consumo: 1, picks: 1 }];
    const movimientos = [{ articulo: 'A1', pasillo: 'MZ02', columna: 5, nivel: 'N03' }];
    const racks = agruparPorRack(resolverPosicionesActuales(base, movimientos));

    expect(racks.has('MZ01|1')).toBe(false);
    expect(racks.get('MZ02|5').niveles.N03).toHaveLength(1);
  });

  it('un artículo eliminado (sala) no aparece en ningún rack', () => {
    const base = [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL', consumo: 1, picks: 1 }];
    const racks = agruparPorRack(resolverPosicionesActuales(base, [], ['A1']));
    expect(racks.size).toBe(0);
  });

  it('rack tipo CUERPO agrupado bajo la clave "CUERPO" -> nivelesOcupados()=1 sin importar cuántos artículos', () => {
    const base = [
      { articulo: 'A1', pasillo: 'MZ02', columna: 20, nivel: 'CUERPO', clase: 'A', tipo: 'CUERPO', consumo: 1, picks: 1 },
      { articulo: 'A2', pasillo: 'MZ02', columna: 20, nivel: 'CUERPO', clase: 'A', tipo: 'CUERPO', consumo: 1, picks: 1 },
    ];
    const racks = agruparPorRack(resolverPosicionesActuales(base, []));
    const rack = racks.get('MZ02|20');
    expect(nArts(rack)).toBe(2);
    expect(nivelesOcupados(rack)).toBe(1);
  });

  it('artículo sin base (sinBase) igual se agrupa en su rack, con consumo 0 (no NaN)', () => {
    const movimientos = [{ articulo: 'FANTASMA', pasillo: 'MZ03', columna: 3, nivel: 'N01' }];
    const racks = agruparPorRack(resolverPosicionesActuales([], movimientos));
    const rack = racks.get('MZ03|3');
    expect(consumoTotal(rack)).toBe(0);
    expect(rack.niveles.N01[0].articulo).toBe('FANTASMA');
  });
});
