import { describe, it, expect } from 'vitest';
import { calcularCosto, PESOS_POR_DEFECTO } from './costoCandidato.js';

function terminos(overrides = {}) {
  return { utilizacionResultante: 0, violacionesBlandas: 0, afinidad: 0, ...overrides };
}

describe('calcularCosto', () => {
  it('mayor utilización resultante da MENOR costo (empuja densidad)', () => {
    const bajo = calcularCosto(terminos({ utilizacionResultante: 0.5 }));
    const alto = calcularCosto(terminos({ utilizacionResultante: 0.9 }));
    expect(alto).toBeLessThan(bajo);
  });

  it('afinidad de zona da MENOR costo cuanto más alta (positiva = preferida, negativa = a evitar)', () => {
    const evitar = calcularCosto(terminos({ afinidad: -1 }));
    const neutral = calcularCosto(terminos({ afinidad: 0 }));
    const preferida = calcularCosto(terminos({ afinidad: 2 }));
    expect(evitar).toBeGreaterThan(neutral);
    expect(preferida).toBeLessThan(neutral);
  });

  it('violaciones blandas dan MAYOR costo', () => {
    const sinViolacion = calcularCosto(terminos({ violacionesBlandas: 0 }));
    const conViolacion = calcularCosto(terminos({ violacionesBlandas: 1 }));
    expect(conViolacion).toBeGreaterThan(sinViolacion);
  });

  it('es determinístico -- misma entrada, mismo resultado exacto, siempre', () => {
    const t = terminos({ utilizacionResultante: 0.8, afinidad: 1 });
    expect(calcularCosto(t)).toBe(calcularCosto(t));
  });

  it('acepta pesos configurables distintos de los default, sin tocar el motor', () => {
    const t = terminos({ utilizacionResultante: 0.5 });
    const costoConDefault = calcularCosto(t, PESOS_POR_DEFECTO);
    const costoConPesosCero = calcularCosto(t, { utilizacion: 0, violaciones: 0, afinidad: 0 });
    expect(costoConPesosCero).toBe(0);
    expect(costoConDefault).not.toBe(costoConPesosCero);
  });

  it('el término de distancia ya no existe en la fórmula -- accesibilidad real se maneja con zonas explícitas, no con distancia euclídea', () => {
    expect(PESOS_POR_DEFECTO.distancia).toBeUndefined();
  });

  it('el peso de frecuencia es 0 por defecto -- no cambia el comportamiento ya validado hasta que se pida explícitamente', () => {
    expect(PESOS_POR_DEFECTO.frecuencia).toBe(0);
  });

  it('afinidad por frecuencia da MENOR costo cuanto más alta, solo cuando el peso es distinto de 0', () => {
    const pesos = { ...PESOS_POR_DEFECTO, frecuencia: 3 };
    const sinFrecuencia = calcularCosto(terminos({ afinidadFrecuencia: 0 }), pesos);
    const conFrecuencia = calcularCosto(terminos({ afinidadFrecuencia: 1 }), pesos);
    expect(conFrecuencia).toBeLessThan(sinFrecuencia);
  });
});
