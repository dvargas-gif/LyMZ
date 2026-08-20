import { describe, it, expect } from 'vitest';
import { detectarConflictoMigracion } from './detectarConflictoMigracion.js';

describe('detectarConflictoMigracion', () => {
  it('encuentra el movimiento pendiente cuyo artículo coincide con el que se está moviendo a mano', () => {
    const pendientes = [{ id: 1, articulo: '7501137' }, { id: 2, articulo: '2352300' }];
    expect(detectarConflictoMigracion(['7501137'], pendientes)).toEqual([{ id: 1, articulo: '7501137' }]);
  });

  it('sin coincidencias -> []', () => {
    const pendientes = [{ id: 1, articulo: '7501137' }];
    expect(detectarConflictoMigracion(['999999'], pendientes)).toEqual([]);
  });

  it('varios artículos movidos a la vez (mover cuerpo) -- devuelve todos los que coincidan', () => {
    const pendientes = [{ id: 1, articulo: 'A' }, { id: 2, articulo: 'B' }, { id: 3, articulo: 'C' }];
    expect(detectarConflictoMigracion(['A', 'C'], pendientes)).toEqual([{ id: 1, articulo: 'A' }, { id: 3, articulo: 'C' }]);
  });

  it('sin movimientos pendientes -> []', () => {
    expect(detectarConflictoMigracion(['A'], [])).toEqual([]);
  });

  it('sin artículos a mover -> []', () => {
    expect(detectarConflictoMigracion([], [{ id: 1, articulo: 'A' }])).toEqual([]);
  });
});
