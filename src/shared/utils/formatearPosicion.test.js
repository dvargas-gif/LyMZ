import { describe, it, expect } from 'vitest';
import { formatearPosicion } from './formatearPosicion.js';

describe('formatearPosicion', () => {
  it('arma pasillo-Ccolumna-nivel cuando hay nivel', () => {
    expect(formatearPosicion('MZ01', 5, 'N02')).toBe('MZ01-C005-N02');
  });

  it('omite el nivel si no se pasa', () => {
    expect(formatearPosicion('MZ02', 12)).toBe('MZ02-C012');
  });

  it('rellena la columna a 3 dígitos', () => {
    expect(formatearPosicion('MZ03', 7)).toBe('MZ03-C007');
    expect(formatearPosicion('MZ03', 123)).toBe('MZ03-C123');
  });

  it('usa 0 si la columna es null/undefined', () => {
    expect(formatearPosicion('MZ04', undefined)).toBe('MZ04-C000');
    expect(formatearPosicion('MZ04', null)).toBe('MZ04-C000');
  });

  it('acepta "CUERPO" como nivel igual que cualquier otro', () => {
    expect(formatearPosicion('MZ05', 30, 'CUERPO')).toBe('MZ05-C030-CUERPO');
  });
});
