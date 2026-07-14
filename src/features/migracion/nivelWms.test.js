import { describe, it, expect } from 'vitest';
import { nivelWmsANumero, numeroANivelWms } from './nivelWms.js';

describe('nivelWmsANumero', () => {
  it('convierte N01-N05 a 1-5', () => {
    expect(nivelWmsANumero('N01')).toBe(1);
    expect(nivelWmsANumero('N02')).toBe(2);
    expect(nivelWmsANumero('N03')).toBe(3);
    expect(nivelWmsANumero('N04')).toBe(4);
    expect(nivelWmsANumero('N05')).toBe(5);
  });

  it('CUERPO no tiene equivalente -- null, nunca un número inventado', () => {
    expect(nivelWmsANumero('CUERPO')).toBeNull();
  });

  it('cualquier otro valor -> null', () => {
    expect(nivelWmsANumero('N06')).toBeNull();
    expect(nivelWmsANumero('')).toBeNull();
    expect(nivelWmsANumero(null)).toBeNull();
    expect(nivelWmsANumero(undefined)).toBeNull();
  });
});

describe('numeroANivelWms', () => {
  it('convierte 1-5 a N01-N05', () => {
    expect(numeroANivelWms(1)).toBe('N01');
    expect(numeroANivelWms(2)).toBe('N02');
    expect(numeroANivelWms(3)).toBe('N03');
    expect(numeroANivelWms(4)).toBe('N04');
    expect(numeroANivelWms(5)).toBe('N05');
  });

  it('fuera de rango -> null', () => {
    expect(numeroANivelWms(0)).toBeNull();
    expect(numeroANivelWms(6)).toBeNull();
    expect(numeroANivelWms(-1)).toBeNull();
  });
});

describe('ida y vuelta', () => {
  it('nivelWmsANumero(numeroANivelWms(n)) === n para 1-5', () => {
    for (let n = 1; n <= 5; n++) {
      expect(nivelWmsANumero(numeroANivelWms(n))).toBe(n);
    }
  });
});
