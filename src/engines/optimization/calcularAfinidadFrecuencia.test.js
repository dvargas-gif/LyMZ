import { describe, it, expect } from 'vitest';
import { calcularAfinidadFrecuencia } from './calcularAfinidadFrecuencia.js';

function cuerpo(pasillo, columna) { return { pasillo, columna }; }
function articulo(picksNormalizado) { return { picksNormalizado }; }

describe('calcularAfinidadFrecuencia', () => {
  it('un artículo sin picks (picksNormalizado 0 o ausente) es neutral en cualquier zona', () => {
    expect(calcularAfinidadFrecuencia(cuerpo('MZ02', 23), articulo(0))).toBe(0);
    expect(calcularAfinidadFrecuencia(cuerpo('MZ02', 23), {})).toBe(0);
  });

  it('en la zona óptima, la afinidad escala con picksNormalizado (2x)', () => {
    expect(calcularAfinidadFrecuencia(cuerpo('MZ02', 23), articulo(1))).toBe(2);
    expect(calcularAfinidadFrecuencia(cuerpo('MZ02', 23), articulo(0.5))).toBe(1);
  });

  it('en la zona accesible general, la afinidad escala con picksNormalizado (1x)', () => {
    expect(calcularAfinidadFrecuencia(cuerpo('MZ05', 12), articulo(1))).toBe(1);
    expect(calcularAfinidadFrecuencia(cuerpo('MZ05', 12), articulo(0.4))).toBeCloseTo(0.4);
  });

  it('en una zona a evitar, penaliza más cuanto más pickeado es el artículo', () => {
    expect(calcularAfinidadFrecuencia(cuerpo('MZ10', 1), articulo(1))).toBe(-1);
    expect(calcularAfinidadFrecuencia(cuerpo('MZ10', 1), articulo(0.2))).toBeCloseTo(-0.2);
  });

  it('fuera de cualquier zona es siempre neutral, sin importar la frecuencia', () => {
    expect(calcularAfinidadFrecuencia(cuerpo('MZ01', 30), articulo(1))).toBe(0);
  });

  it('es independiente de la clase -- no recibe ni usa ese campo', () => {
    const conClaseD = calcularAfinidadFrecuencia(cuerpo('MZ02', 23), { picksNormalizado: 0.8, clase: 'D' });
    const sinClase = calcularAfinidadFrecuencia(cuerpo('MZ02', 23), { picksNormalizado: 0.8 });
    expect(conClaseD).toBe(sinClase);
  });

  it('acepta zonas configurables, igual que calcularAfinidadZonas', () => {
    const zonasCustom = { accesibleGeneral: { pasillo: 'MZ09', columnaDesde: 1, columnaHasta: 5 }, optimaClaseA: { pasillo: 'MZ09', columnaDesde: 6, columnaHasta: 10 }, aEvitar: [] };
    expect(calcularAfinidadFrecuencia(cuerpo('MZ09', 3), articulo(1), zonasCustom)).toBe(1);
    expect(calcularAfinidadFrecuencia(cuerpo('MZ01', 1), articulo(1), zonasCustom)).toBe(0);
  });
});
