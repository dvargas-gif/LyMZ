import { describe, it, expect } from 'vitest';
import { puedeIniciarTraslado, esperandoAprobacion, puedeAprobarCupo, puedeDepositarEnBuffer, puedeMarcarListo, todoRecolectado, puedeConfirmar, puedeCancelar, puedeDevolverDelBuffer, pasoDelFlujo } from './flujoMigracionSlot.js';

describe('puedeIniciarTraslado', () => {
  it('sin fila (undefined/null) o "pendiente" -> true', () => {
    expect(puedeIniciarTraslado(undefined)).toBe(true);
    expect(puedeIniciarTraslado(null)).toBe(true);
    expect(puedeIniciarTraslado('pendiente')).toBe(true);
  });
  it('cualquier otro estado -> false', () => {
    ['esperando_aprobacion', 'vaciando', 'recolectando', 'bloqueado', 'confirmado'].forEach(e => expect(puedeIniciarTraslado(e)).toBe(false));
  });
});

describe('esperandoAprobacion / puedeAprobarCupo', () => {
  it('solo en "esperando_aprobacion"', () => {
    expect(esperandoAprobacion('esperando_aprobacion')).toBe(true);
    expect(puedeAprobarCupo('esperando_aprobacion')).toBe(true);
    ['pendiente', undefined, 'vaciando', 'recolectando', 'bloqueado', 'confirmado'].forEach(e => {
      expect(esperandoAprobacion(e)).toBe(false);
      expect(puedeAprobarCupo(e)).toBe(false);
    });
  });
});

describe('puedeDepositarEnBuffer', () => {
  it('solo en "vaciando"', () => {
    expect(puedeDepositarEnBuffer('vaciando')).toBe(true);
    ['pendiente', undefined, 'recolectando', 'bloqueado', 'confirmado'].forEach(e => expect(puedeDepositarEnBuffer(e)).toBe(false));
  });
});

describe('puedeMarcarListo', () => {
  it('solo en "recolectando"', () => {
    expect(puedeMarcarListo('recolectando')).toBe(true);
    ['pendiente', undefined, 'vaciando', 'bloqueado', 'confirmado'].forEach(e => expect(puedeMarcarListo(e)).toBe(false));
  });
});

describe('todoRecolectado', () => {
  it('sin movimientos (sin plan generado todavía) -> true, no bloquea', () => {
    expect(todoRecolectado([])).toBe(true);
    expect(todoRecolectado(undefined)).toBe(true);
  });
  it('todos en estado "recolectado" -> true', () => {
    expect(todoRecolectado([{ estado: 'recolectado' }, { estado: 'recolectado' }])).toBe(true);
  });
  it('al menos uno todavía "pendiente" -> false', () => {
    expect(todoRecolectado([{ estado: 'recolectado' }, { estado: 'pendiente' }])).toBe(false);
  });
});

describe('puedeConfirmar', () => {
  it('solo en "bloqueado"', () => {
    expect(puedeConfirmar('bloqueado')).toBe(true);
    ['pendiente', undefined, 'vaciando', 'recolectando', 'confirmado'].forEach(e => expect(puedeConfirmar(e)).toBe(false));
  });
});

describe('puedeCancelar', () => {
  it('esperando_aprobacion/vaciando/recolectando -- ya no una vez bloqueado (esperando al supervisor)', () => {
    expect(puedeCancelar('esperando_aprobacion')).toBe(true);
    expect(puedeCancelar('vaciando')).toBe(true);
    expect(puedeCancelar('recolectando')).toBe(true);
    ['pendiente', undefined, 'bloqueado', 'confirmado'].forEach(e => expect(puedeCancelar(e)).toBe(false));
  });
});

describe('puedeDevolverDelBuffer', () => {
  it('mismo margen que puedeCancelar -- solo mientras dura vaciando/recolectando', () => {
    expect(puedeDevolverDelBuffer('vaciando')).toBe(true);
    expect(puedeDevolverDelBuffer('recolectando')).toBe(true);
    ['pendiente', undefined, 'bloqueado', 'confirmado'].forEach(e => expect(puedeDevolverDelBuffer(e)).toBe(false));
  });
});

describe('pasoDelFlujo', () => {
  it('mapea cada estado a su número de paso', () => {
    expect(pasoDelFlujo('vaciando')).toBe(1);
    expect(pasoDelFlujo('recolectando')).toBe(2);
    expect(pasoDelFlujo('bloqueado')).toBe(3);
    expect(pasoDelFlujo('confirmado')).toBe(4);
  });
  it('sin traslado en curso -> null', () => {
    expect(pasoDelFlujo(undefined)).toBeNull();
    expect(pasoDelFlujo('pendiente')).toBeNull();
  });
});
