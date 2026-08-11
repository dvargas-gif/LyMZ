import { describe, it, expect } from 'vitest';
import { construirDiffPropuesta } from './construirDiffPropuesta.js';

function asignacion(overrides = {}) {
  return {
    articulo: 'A1', pasillo: 'MZ02', columna: 5, nivel: 'N01',
    costo: -1, utilizacionResultante: 0.9, afinidad: 0, reglasEvaluadas: [],
    ...overrides,
  };
}

describe('construirDiffPropuesta', () => {
  it('cambiaUbicacion=true cuando el artículo nunca tuvo posición (origen null)', () => {
    const [d] = construirDiffPropuesta([asignacion()], new Map());
    expect(d.origen).toBeNull();
    expect(d.cambiaUbicacion).toBe(true);
  });

  it('cambiaUbicacion=true cuando la posición nueva es distinta de la real actual', () => {
    const posiciones = new Map([['A1', { pasillo: 'MZ01', columna: 1, nivel: 'N01' }]]);
    const [d] = construirDiffPropuesta([asignacion()], posiciones);
    expect(d.origen).toEqual({ pasillo: 'MZ01', columna: 1, nivel: 'N01' });
    expect(d.cambiaUbicacion).toBe(true);
  });

  it('cambiaUbicacion=false cuando la posición propuesta es EXACTAMENTE la misma que la real actual', () => {
    const posiciones = new Map([['A1', { pasillo: 'MZ02', columna: 5, nivel: 'N01' }]]);
    const [d] = construirDiffPropuesta([asignacion()], posiciones);
    expect(d.cambiaUbicacion).toBe(false);
  });

  it('el motivo incluye la ocupación resultante y menciona la zona según la afinidad (óptima, accesible o a evitar)', () => {
    const [neutral] = construirDiffPropuesta([asignacion({ afinidad: 0 })], new Map());
    expect(neutral.motivo).toContain('90.0%');
    expect(neutral.motivo).not.toContain('zona');

    const [optima] = construirDiffPropuesta([asignacion({ afinidad: 2 })], new Map());
    expect(optima.motivo).toContain('zona óptima');

    const [accesible] = construirDiffPropuesta([asignacion({ afinidad: 1 })], new Map());
    expect(accesible.motivo).toContain('zona accesible general');

    const [evitar] = construirDiffPropuesta([asignacion({ afinidad: -1 })], new Map());
    expect(evitar.motivo).toContain('zona a evitar');
  });
});
