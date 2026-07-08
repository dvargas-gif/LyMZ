import { describe, it, expect } from 'vitest';
import { entradaConStagger, pulsoCambio, transicionLayout, revelarHorizontal, interaccionBoton } from './variants.js';
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

describe('revelarHorizontal', () => {
  it('fade + slide horizontal corto, con exit simétrico y duración de navegación', () => {
    const v = revelarHorizontal(false);
    expect(v.initial).toEqual({ opacity: 0, x: -8 });
    expect(v.animate).toEqual({ opacity: 1, x: 0 });
    expect(v.exit).toEqual({ opacity: 0, x: -8 });
    expect(v.transition.duration).toBe(DURACION.navegacion);
  });

  it('con reducido=true, sin animación (duración 0, sin salto entre initial/animate/exit)', () => {
    const v = revelarHorizontal(true);
    expect(v.transition.duration).toBe(0);
    expect(v.initial).toEqual(v.animate);
    expect(v.exit).toEqual(v.animate);
  });
});

describe('interaccionBoton', () => {
  it('usa transición tween explícita (nunca spring) con DURACION.micro y EASING.entrada', () => {
    const v = interaccionBoton(false);
    expect(v.transition.type).toBe('tween');
    expect(v.transition.duration).toBe(DURACION.micro);
    expect(v.whileHover.y).toBeLessThan(0); // leve elevación, no un salto de borde
    expect(v.whileTap.scale).toBeLessThan(1); // compresión al presionar, sin rebote
  });

  it('con reducido=true, sin hover/tap ni transición', () => {
    const v = interaccionBoton(true);
    expect(v.whileHover).toEqual({});
    expect(v.whileTap).toEqual({});
    expect(v.transition.duration).toBe(0);
  });
});
