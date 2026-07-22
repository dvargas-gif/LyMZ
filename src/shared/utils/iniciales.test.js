import { describe, it, expect } from 'vitest';
import { iniciales } from './iniciales.js';

describe('iniciales', () => {
  it('toma la primera letra de las dos primeras palabras, en mayúsculas', () => {
    expect(iniciales('David Vargas')).toBe('DV');
    expect(iniciales('ana maria lopez')).toBe('AM');
  });

  it('con una sola palabra, usa solo esa inicial', () => {
    expect(iniciales('Creador')).toBe('C');
  });

  it('sin nombre, un placeholder neutro en vez de romper', () => {
    expect(iniciales('')).toBe('?');
    expect(iniciales(null)).toBe('?');
    expect(iniciales(undefined)).toBe('?');
  });

  it('tolera espacios extra entre palabras', () => {
    expect(iniciales('  David   Vargas  ')).toBe('DV');
  });
});
