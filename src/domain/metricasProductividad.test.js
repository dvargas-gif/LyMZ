import { describe, it, expect } from 'vitest';
import { calcularMetricasPorUsuario, agruparPor, calcularMetricasDespachoPorTrabajador, calcularMetricasMigracionPorPersona } from './metricasProductividad.js';

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

describe('calcularMetricasDespachoPorTrabajador', () => {
  function tarea({ trabajadorNumero, tipo = 'vaciar', estado = 'confirmada', resueltoEn = null }) {
    return { trabajadorNumero, tipo, estado, resueltoEn };
  }

  it('solo cuenta confirmada como completada, separa vaciar/recolectar', () => {
    const tareas = [
      tarea({ trabajadorNumero: 1, tipo: 'vaciar', resueltoEn: '2026-08-19T10:00:00Z' }),
      tarea({ trabajadorNumero: 1, tipo: 'recolectar', resueltoEn: '2026-08-19T10:05:00Z' }),
    ];
    const [t1] = calcularMetricasDespachoPorTrabajador(tareas);
    expect(t1.completadas).toBe(2);
    expect(t1.vaciar).toBe(1);
    expect(t1.recolectar).toBe(1);
  });

  it('cancelada no cuenta como completada, pero sí se reporta aparte', () => {
    const tareas = [tarea({ trabajadorNumero: 2, estado: 'cancelada' })];
    const [t2] = calcularMetricasDespachoPorTrabajador(tareas);
    expect(t2.completadas).toBe(0);
    expect(t2.canceladas).toBe(1);
  });

  it('pendiente (ni confirmada ni cancelada) no suma en ningún contador', () => {
    const tareas = [tarea({ trabajadorNumero: 3, estado: 'pendiente' })];
    const [t3] = calcularMetricasDespachoPorTrabajador(tareas);
    expect(t3.completadas).toBe(0);
    expect(t3.canceladas).toBe(0);
  });

  it('ordena por completadas descendente', () => {
    const tareas = [
      tarea({ trabajadorNumero: 1 }),
      tarea({ trabajadorNumero: 2 }), tarea({ trabajadorNumero: 2 }),
    ];
    const [primero] = calcularMetricasDespachoPorTrabajador(tareas);
    expect(primero.trabajadorNumero).toBe(2);
  });

  it('sin tareas -> []', () => {
    expect(calcularMetricasDespachoPorTrabajador([])).toEqual([]);
  });
});

describe('calcularMetricasMigracionPorPersona', () => {
  const nombres = new Map([['u1', 'Ana'], ['u2', 'Beto']]);
  const resolverNombre = id => nombres.get(id) ?? 'Desconocido';

  function slot({ iniciadoPor = null, iniciadoEn = null, bloqueadoPor = null, bloqueadoEn = null, confirmadoPor = null, confirmadoEn = null, aprobadoPor = null, aprobadoEn = null }) {
    return { iniciadoPor, iniciadoEn, bloqueadoPor, bloqueadoEn, confirmadoPor, confirmadoEn, aprobadoPor, aprobadoEn };
  }

  it('suma acciones de una persona a través de distintos roles y distintos slots', () => {
    const slots = [
      slot({ iniciadoPor: 'u1', iniciadoEn: '2026-08-19T10:00:00Z' }),
      slot({ confirmadoPor: 'u1', confirmadoEn: '2026-08-19T11:00:00Z' }),
    ];
    const [ana] = calcularMetricasMigracionPorPersona(slots, resolverNombre);
    expect(ana.usuario).toBe('Ana');
    expect(ana.iniciados).toBe(1);
    expect(ana.confirmados).toBe(1);
    expect(ana.totalAcciones).toBe(2);
  });

  it('un slot sin ninguna persona atribuida (todo null) no agrega a nadie', () => {
    const slots = [slot({})];
    expect(calcularMetricasMigracionPorPersona(slots, resolverNombre)).toEqual([]);
  });

  it('ordena por total de acciones descendente', () => {
    const slots = [
      slot({ iniciadoPor: 'u1', iniciadoEn: '2026-08-19T10:00:00Z' }),
      slot({ iniciadoPor: 'u2', iniciadoEn: '2026-08-19T10:00:00Z' }),
      slot({ bloqueadoPor: 'u2', bloqueadoEn: '2026-08-19T10:05:00Z' }),
    ];
    const [primero] = calcularMetricasMigracionPorPersona(slots, resolverNombre);
    expect(primero.usuario).toBe('Beto');
  });

  it('persona no encontrada en resolverNombre -> "Desconocido"', () => {
    const slots = [slot({ iniciadoPor: 'u-fantasma', iniciadoEn: '2026-08-19T10:00:00Z' })];
    const [u] = calcularMetricasMigracionPorPersona(slots, resolverNombre);
    expect(u.usuario).toBe('Desconocido');
  });

  it('sin slots -> []', () => {
    expect(calcularMetricasMigracionPorPersona([], resolverNombre)).toEqual([]);
  });
});
