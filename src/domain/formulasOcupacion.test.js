import { describe, it, expect } from 'vitest';
import { nArts, nivelesOcupados, consumoTotal, llenura, colorLlenura } from './formulasOcupacion.js';
import { CONFIGURACION_OCUPACION_DEFAULT as CFG } from './configuracionOcupacion.js';

// Estos tests fijan el comportamiento ACTUAL del mapa legacy (05-ayudantes.js)
// -- no se buscó "mejorar" la fórmula, solo reproducirla. Ver INVENTARIO-LOGICA-MAPA.md.

describe('nArts', () => {
  it('cuenta artículos de todos los niveles', () => {
    const rack = { niveles: { N01: [{ consumo: 1 }], N02: [{ consumo: 1 }, { consumo: 1 }] } };
    expect(nArts(rack)).toBe(3);
  });
  it('rack sin niveles -> 0', () => {
    expect(nArts({ niveles: {} })).toBe(0);
  });
});

describe('nivelesOcupados', () => {
  it('cuenta niveles con al menos 1 artículo, ignora niveles vacíos', () => {
    const rack = { niveles: { N01: [], N02: [{ consumo: 1 }], N03: [{ consumo: 1 }] } };
    expect(nivelesOcupados(rack)).toBe(2);
  });
  it('rack tipo CUERPO -> siempre 1, sin importar cuántos artículos', () => {
    const rack = { niveles: { CUERPO: [{ consumo: 1 }, { consumo: 2 }, { consumo: 3 }] } };
    expect(nivelesOcupados(rack)).toBe(1);
  });
  it('rack sin niveles -> 0', () => {
    expect(nivelesOcupados({ niveles: {} })).toBe(0);
  });
});

describe('consumoTotal', () => {
  it('suma el consumo de todos los artículos', () => {
    const rack = { niveles: { N01: [{ consumo: 0.5 }], N02: [{ consumo: 0.3 }, { consumo: 1.0 }] } };
    expect(consumoTotal(rack)).toBeCloseTo(1.8);
  });
  it('trata consumo ausente como 0 (no NaN)', () => {
    const rack = { niveles: { N01: [{ articulo: 'SIN_CONSUMO' }] } };
    expect(consumoTotal(rack)).toBe(0);
  });
});

describe('llenura', () => {
  it('consumoTotal / capacidadUtilRack (4.5 por defecto)', () => {
    const rack = { niveles: { N01: [{ consumo: 2.25 }] } };
    expect(llenura(rack, CFG)).toBeCloseTo(0.5);
  });
  it('se capa en 1.2 aunque el consumo real sea muchísimo mayor', () => {
    const rack = { niveles: { N01: [{ consumo: 100 }] } };
    expect(llenura(rack, CFG)).toBe(1.2);
  });
});

describe('colorLlenura', () => {
  it('>1.0 (sobrecargado) -> rojo', () => {
    expect(colorLlenura(1.111, CFG)).toBe('#C0392B');
  });
  it('>0.85 y <=1.0 (alerta) -> ámbar', () => {
    expect(colorLlenura(0.9, CFG)).toBe('#D08A1E');
  });
  it('>0.4 y <=0.85 (medio) -> teal', () => {
    expect(colorLlenura(0.6, CFG)).toBe('#2E7D83');
  });
  it('<=0.4 -> verde', () => {
    expect(colorLlenura(0.3, CFG)).toBe('#7FB069');
    expect(colorLlenura(0.4, CFG)).toBe('#7FB069'); // exactamente 0.4 no es ">0.4" -> verde, igual que el original
  });
});
