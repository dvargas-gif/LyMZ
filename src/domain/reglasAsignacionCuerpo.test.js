import { describe, it, expect } from 'vitest';
import {
  nivelesRecomendados, detectarCuerposParaAjustarNiveles, VOLUMEN_CUERPO_REFERENCIA_M3,
  CANTIDAD_NIVELES_CUERPO, VOLUMEN_NIVEL_REFERENCIA_M3,
} from './reglasAsignacionCuerpo.js';

function filaSlotting(articulo, pasillo, columna, tipo = 'CUERPO') {
  return { articulo, pasillo, columna, tipo };
}
function dimension(articulo, volumenM3) {
  return { articulo, volumenM3 };
}
/** Volumen exacto para que el artículo represente `porcentaje` (0-1) del cuerpo. */
function volumenParaPorcentaje(porcentaje) {
  return VOLUMEN_CUERPO_REFERENCIA_M3 * porcentaje;
}

describe('VOLUMEN_CUERPO_REFERENCIA_M3', () => {
  it('es el volumen de un nivel (0,432 m³, dato real del archivo de dimensiones) por 5 niveles', () => {
    expect(VOLUMEN_NIVEL_REFERENCIA_M3).toBe(0.432);
    expect(CANTIDAD_NIVELES_CUERPO).toBe(5);
    expect(VOLUMEN_CUERPO_REFERENCIA_M3).toBeCloseTo(2.16, 10);
  });
});

describe('nivelesRecomendados -- tabla confirmada con el usuario', () => {
  it('menos del 30% -> 5 niveles (cuerpo completo, sin ajuste)', () => {
    expect(nivelesRecomendados(0)).toBe(5);
    expect(nivelesRecomendados(0.01)).toBe(5);
    expect(nivelesRecomendados(0.29)).toBe(5);
    expect(nivelesRecomendados(0.2999)).toBe(5);
  });

  it('exactamente 30% ya NO es "menos del 30%" -- cae en la banda de 30-40% (3 niveles)', () => {
    expect(nivelesRecomendados(0.30)).toBe(3);
  });

  it('30% a menos de 40% -> 3 niveles (35% confirmado explícitamente por el usuario)', () => {
    expect(nivelesRecomendados(0.35)).toBe(3);
    expect(nivelesRecomendados(0.3999)).toBe(3);
  });

  it('exactamente 40% cae en la banda de 40-50% (2 niveles)', () => {
    expect(nivelesRecomendados(0.40)).toBe(2);
  });

  it('40% a menos de 50% -> 2 niveles', () => {
    expect(nivelesRecomendados(0.45)).toBe(2);
    expect(nivelesRecomendados(0.4999)).toBe(2);
  });

  it('50% o más -> 1 nivel ("solo", confirmado igual de 50% a 68%+ en adelante)', () => {
    expect(nivelesRecomendados(0.50)).toBe(1);
    expect(nivelesRecomendados(0.60)).toBe(1);
    expect(nivelesRecomendados(0.68)).toBe(1);
    expect(nivelesRecomendados(0.90)).toBe(1);
  });

  it('un artículo que necesitaría más del 100% del cuerpo no rompe -- cae en el mínimo (1), no hay banda de tope superior definida', () => {
    expect(nivelesRecomendados(1.5)).toBe(1);
  });
});

describe('detectarCuerposParaAjustarNiveles', () => {
  it('NO marca un cuerpo por debajo del 30% -- 5 niveles ya es lo correcto, nada que ajustar', () => {
    const slotting = [filaSlotting('A1', 'MZ01', 5)];
    const dimensiones = [dimension('A1', volumenParaPorcentaje(0.10))];
    expect(detectarCuerposParaAjustarNiveles(slotting, dimensiones)).toHaveLength(0);
  });

  it('marca un cuerpo de 35% con la recomendación de 3 niveles', () => {
    const slotting = [filaSlotting('A1', 'MZ01', 5)];
    const dimensiones = [dimension('A1', volumenParaPorcentaje(0.35))];
    const resultado = detectarCuerposParaAjustarNiveles(slotting, dimensiones);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ pasillo: 'MZ01', columna: 5, articulo: 'A1', nivelesRecomendados: 3 });
    expect(resultado[0].porcentaje).toBeCloseTo(0.35, 5);
  });

  it('marca un cuerpo de 60% con la recomendación de 1 nivel ("solo")', () => {
    const slotting = [filaSlotting('A1', 'MZ01', 5)];
    const dimensiones = [dimension('A1', volumenParaPorcentaje(0.60))];
    const resultado = detectarCuerposParaAjustarNiveles(slotting, dimensiones);
    expect(resultado[0].nivelesRecomendados).toBe(1);
  });

  it('NO aplica la regla si el cuerpo tiene MÁS de un artículo (la regla es específicamente "un solo artículo")', () => {
    const slotting = [filaSlotting('A1', 'MZ01', 5), filaSlotting('A2', 'MZ01', 5)];
    const dimensiones = [dimension('A1', volumenParaPorcentaje(0.60)), dimension('A2', volumenParaPorcentaje(0.60))];
    expect(detectarCuerposParaAjustarNiveles(slotting, dimensiones)).toHaveLength(0);
  });

  it('ignora filas que no son tipo CUERPO (niveles individuales)', () => {
    const slotting = [{ articulo: 'A1', pasillo: 'MZ01', columna: 5, tipo: 'NORMAL' }];
    const dimensiones = [dimension('A1', volumenParaPorcentaje(0.60))];
    expect(detectarCuerposParaAjustarNiveles(slotting, dimensiones)).toHaveLength(0);
  });

  it('no asume nada si el artículo no tiene dimensiones importadas', () => {
    const slotting = [filaSlotting('SIN-DIMENSION', 'MZ01', 5)];
    expect(detectarCuerposParaAjustarNiveles(slotting, [])).toHaveLength(0);
  });

  it('ordena del ajuste más urgente (menos niveles recomendados) al menos urgente', () => {
    const slotting = [filaSlotting('A1', 'MZ01', 1), filaSlotting('A2', 'MZ01', 2), filaSlotting('A3', 'MZ01', 3)];
    const dimensiones = [
      dimension('A1', volumenParaPorcentaje(0.35)), // -> 3 niveles
      dimension('A2', volumenParaPorcentaje(0.60)), // -> 1 nivel
      dimension('A3', volumenParaPorcentaje(0.45)), // -> 2 niveles
    ];
    const resultado = detectarCuerposParaAjustarNiveles(slotting, dimensiones);
    expect(resultado.map(r => r.articulo)).toEqual(['A2', 'A3', 'A1']);
  });
});
