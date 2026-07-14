import { describe, it, expect } from 'vitest';
import { puedeIniciarTraslado, puedeDepositarEnBuffer, puedeMarcarListo, puedeConfirmar, puedeCancelar, pasoDelFlujo } from './flujoMigracionSlot.js';

describe('puedeIniciarTraslado', () => {
  it('sin fila (undefined/null) o "pendiente" -> true', () => {
    expect(puedeIniciarTraslado(undefined)).toBe(true);
    expect(puedeIniciarTraslado(null)).toBe(true);
    expect(puedeIniciarTraslado('pendiente')).toBe(true);
  });
  it('cualquier otro estado -> false', () => {
    ['vaciando', 'recolectando', 'bloqueado', 'confirmado'].forEach(e => expect(puedeIniciarTraslado(e)).toBe(false));
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

describe('puedeConfirmar', () => {
  it('solo en "bloqueado"', () => {
    expect(puedeConfirmar('bloqueado')).toBe(true);
    ['pendiente', undefined, 'vaciando', 'recolectando', 'confirmado'].forEach(e => expect(puedeConfirmar(e)).toBe(false));
  });
});

describe('puedeCancelar', () => {
  it('solo mientras dura vaciando/recolectando -- ya no una vez bloqueado (esperando al supervisor)', () => {
    expect(puedeCancelar('vaciando')).toBe(true);
    expect(puedeCancelar('recolectando')).toBe(true);
    ['pendiente', undefined, 'bloqueado', 'confirmado'].forEach(e => expect(puedeCancelar(e)).toBe(false));
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
