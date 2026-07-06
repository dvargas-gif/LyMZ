import { describe, it, expect } from 'vitest';
import { entradaConStagger, pulsoCambio, transicionLayout } from './variants.js';
import { DURACION, STAGGER_MS } from './tokens.js';

describe('entradaConStagger', () => {
  it('fade + slide-up 8px, con delay proporcional al índice (stagger)', () => {
    const v0 = entradaConStagger(0, false);
    const v3 = entradaConStagger(3, false);
    expect(v0.initial).toEqual({ opacity: 0, y: 8 });
    expect(v0.animate).toEqual({ opacity: 1, y: 0 });
    expect(v0.transition.delay).toBe(0);
    expect(v3.transition.delay).toBeCloseTo(3 * (STAGGER_MS / 1000));
    expect(v0.transition.duration).toBe(DURACION.estado);
  });

  it('con reducido=true, entra directo sin animación (duración 0)', () => {
    const v = entradaConStagger(5, true);
    expect(v.transition.duration).toBe(0);
    expect(v.initial).toEqual(v.animate); // no hay salto visual, arranca ya en el estado final
  });
});

describe('pulsoCambio', () => {
  it('anima escala 1 -> 1.03 -> 1', () => {
    const v = pulsoCambio(false);
    expect(v.animate.scale).toEqual([1, 1.03, 1]);
    expect(v.transition.duration).toBe(DURACION.estado);
  });

  it('con reducido=true, no pulsa', () => {
    const v = pulsoCambio(true);
    expect(v.animate.scale).toBe(1);
    expect(v.transition.duration).toBe(0);
  });
});

describe('transicionLayout', () => {
  it('usa DURACION.estado por defecto', () => {
    expect(transicionLayout(false).duration).toBe(DURACION.estado);
  });
  it('con reducido=true, instantánea', () => {
    expect(transicionLayout(true).duration).toBe(0);
  });
});
