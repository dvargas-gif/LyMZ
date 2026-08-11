import { describe, it, expect } from 'vitest';
import { calcularAfinidadZonas } from './calcularAfinidadZonas.js';

function cuerpo(pasillo, columna) { return { pasillo, columna }; }
function articulo(clase) { return { clase }; }

describe('calcularAfinidadZonas -- zonas a evitar (pedido explícito, ~200m de caminata)', () => {
  it('MZ01-C001 da afinidad negativa, sin importar la clase', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ01', 1), articulo('A'))).toBe(-1);
    expect(calcularAfinidadZonas(cuerpo('MZ01', 1), articulo('D'))).toBe(-1);
  });

  it('MZ10, MZ11 y MZ12 enteros dan afinidad negativa (cualquier columna)', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ10', 1), articulo('C'))).toBe(-1);
    expect(calcularAfinidadZonas(cuerpo('MZ11', 5), articulo('C'))).toBe(-1);
    expect(calcularAfinidadZonas(cuerpo('MZ12', 7), articulo('C'))).toBe(-1);
  });

  it('MZ01-C002 (al lado de la zona a evitar) NO se penaliza -- es puntual, no todo MZ01', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ01', 2), articulo('C'))).toBe(0);
  });
});

describe('calcularAfinidadZonas -- zona óptima clase A (ampliada 2026-08-11: MZ01-MZ08, columnas 19-27)', () => {
  it('da +2 si es clase A y cae en la zona óptima, en CUALQUIERA de los 8 pasillos, no solo MZ02', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ02', 23), articulo('A'))).toBe(2);
    expect(calcularAfinidadZonas(cuerpo('MZ01', 20), articulo('A'))).toBe(2);
    expect(calcularAfinidadZonas(cuerpo('MZ08', 27), articulo('A'))).toBe(2);
  });

  it('no da +2 si es la misma zona pero otra clase -- columna 23 está fuera de 9-19, así que da 0, no 1', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ02', 23), articulo('C'))).toBe(0);
  });
});

describe('calcularAfinidadZonas -- zona accesible general (MZ01-08, columnas 9-19, pedido explícito)', () => {
  it('da +1 para CUALQUIER clase, en cualquiera de los 8 pasillos principales', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ01', 12), articulo('D'))).toBe(1);
    expect(calcularAfinidadZonas(cuerpo('MZ08', 9), articulo('B'))).toBe(1);
  });

  it('en el borde (columna 19) un clase A ya cuenta como zona óptima (+2), no accesible general -- la óptima ahora cubre los mismos 8 pasillos', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ05', 19), articulo('A'))).toBe(2);
  });

  it('fuera de 9-27 (y fuera de las otras zonas) da 0', () => {
    expect(calcularAfinidadZonas(cuerpo('MZ04', 30), articulo('C'))).toBe(0);
  });
});

describe('calcularAfinidadZonas -- configurable (Ley 8, sin tocar el motor)', () => {
  it('acepta zonas custom en vez de los defaults', () => {
    const zonasCustom = { accesibleGeneral: { pasillos: ['MZ09'], columnaDesde: 1, columnaHasta: 2 }, aEvitar: [] };
    expect(calcularAfinidadZonas(cuerpo('MZ09', 1), articulo('C'), zonasCustom)).toBe(1);
    expect(calcularAfinidadZonas(cuerpo('MZ10', 1), articulo('C'), zonasCustom)).toBe(0); // ya no está en "a evitar" con esta config custom
  });
});
