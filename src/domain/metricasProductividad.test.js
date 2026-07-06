import { describe, it, expect } from 'vitest';
import { calcularMetricasPorUsuario, agruparPor } from './metricasProductividad.js';

// Fijan el comportamiento ACTUAL de Productividad.jsx -- no se cambió ni una
// línea de la lógica al portarla, solo el lugar donde vive.

describe('calcularMetricasPorUsuario', () => {
  it('cuenta movimientos, errores y deshechos por usuario', () => {
    const movimientos = [
      { usuarioNombre: 'Ana', estado: 'Correcto', fecha: '2026-07-01', hora: '10:00:00' },
      { usuarioNombre: 'Ana', estado: 'Cancelado', fecha: '2026-07-01', hora: '10:05:00' },
      { usuarioNombre: 'Ana', estado: 'Deshecho', fecha: '2026-07-01', hora: '10:10:00' },
    ];
    const [ana] = calcularMetricasPorUsuario(movimientos);
    expect(ana.movimientos).toBe(3);
    expect(ana.errores).toBe(1);
    expect(ana.deshechos).toBe(1);
    expect(ana.productividad).toBe(33); // (3-1-1)/3 = 33%
  });

  it('usuarioNombre ausente -> "Desconocido"', () => {
    const [u] = calcularMetricasPorUsuario([{ estado: 'Correcto', fecha: '2026-07-01', hora: '10:00:00' }]);
    expect(u.usuario).toBe('Desconocido');
  });

  it('tiempo promedio entre movimientos, en minutos redondeados', () => {
    const movimientos = [
      { usuarioNombre: 'Ana', estado: 'Correcto', fecha: '2026-07-01', hora: '10:00:00' },
      { usuarioNombre: 'Ana', estado: 'Correcto', fecha: '2026-07-01', hora: '10:10:00' },
    ];
    const [ana] = calcularMetricasPorUsuario(movimientos);
    expect(ana.tiempoPromedio).toBe('10 min');
  });

  it('un solo movimiento -> tiempo promedio "—" (no hay diffs que promediar)', () => {
    const [u] = calcularMetricasPorUsuario([{ usuarioNombre: 'Ana', estado: 'Correcto', fecha: '2026-07-01', hora: '10:00:00' }]);
    expect(u.tiempoPromedio).toBe('—');
  });

  it('ordena por cantidad de movimientos, descendente', () => {
    const movimientos = [
      { usuarioNombre: 'Ana', estado: 'Correcto', fecha: '2026-07-01', hora: '10:00:00' },
      { usuarioNombre: 'Beto', estado: 'Correcto', fecha: '2026-07-01', hora: '10:00:00' },
      { usuarioNombre: 'Beto', estado: 'Correcto', fecha: '2026-07-01', hora: '10:05:00' },
    ];
    const [primero] = calcularMetricasPorUsuario(movimientos);
    expect(primero.usuario).toBe('Beto');
  });

  it('sin movimientos -> []', () => {
    expect(calcularMetricasPorUsuario([])).toEqual([]);
  });
});

describe('agruparPor', () => {
  it('cuenta ocurrencias agrupadas por la clave que devuelve claveFn', () => {
    const movimientos = [{ fecha: '2026-07-01' }, { fecha: '2026-07-01' }, { fecha: '2026-07-02' }];
    expect(agruparPor(movimientos, m => m.fecha)).toEqual({ '2026-07-01': 2, '2026-07-02': 1 });
  });

  it('sin movimientos -> {}', () => {
    expect(agruparPor([], m => m.fecha)).toEqual({});
  });
});
