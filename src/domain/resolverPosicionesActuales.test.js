import { describe, it, expect } from 'vitest';
import { resolverPosicionesActuales } from './resolverPosicionesActuales.js';

describe('resolverPosicionesActuales', () => {
  it('caso normal: base + movimiento -> posicionActual refleja el movimiento, posicionBase queda intacta', () => {
    const base = [{ articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N02', clase: 'A', tipo: 'NORMAL' }];
    const movimientos = [{ articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01', clase: 'A', tipo: 'NORMAL' }];

    const [r] = resolverPosicionesActuales(base, movimientos);

    expect(r.posicionBase).toEqual(base[0]);
    expect(r.posicionActual).toEqual({ pasillo: 'MZ05', columna: 9, nivel: 'N01', clase: 'A', tipo: 'NORMAL' });
    expect(r.movido).toBe(true);
    expect(r.sinBase).toBe(false);
  });

  it('artículo sin movimientos -> posicionActual es la posición base, movido=false', () => {
    const base = [{ articulo: 'SKU002', pasillo: 'MZ02', columna: 10, nivel: 'N01', clase: 'B', tipo: 'NORMAL' }];

    const [r] = resolverPosicionesActuales(base, []);

    expect(r.posicionActual).toEqual({ pasillo: 'MZ02', columna: 10, nivel: 'N01', clase: 'B', tipo: 'NORMAL' });
    expect(r.movido).toBe(false);
    expect(r.sinBase).toBe(false);
  });

  it('movimientos múltiples sobre el mismo artículo -> gana el último VÁLIDO (los sin destino se ignoran)', () => {
    const base = [{ articulo: 'SKU003', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'C', tipo: 'NORMAL' }];
    const movimientos = [
      { articulo: 'SKU003', pasillo: 'MZ02', columna: 2, nivel: 'N02', clase: 'C', tipo: 'NORMAL' },
      { articulo: 'SKU003', pasillo: null, columna: null }, // inválido -- no puede ganar
      { articulo: 'SKU003', pasillo: 'MZ03', columna: 3, nivel: 'N03', clase: 'C', tipo: 'NORMAL' }, // este es el último válido
    ];

    const [r] = resolverPosicionesActuales(base, movimientos);

    expect(r.posicionActual).toEqual({ pasillo: 'MZ03', columna: 3, nivel: 'N03', clase: 'C', tipo: 'NORMAL' });
  });

  it('artículo en movimientos que NO existe en la base -> sinBase=true explícito, posicionBase=null (no undefined silencioso)', () => {
    const movimientos = [{ articulo: 'SKU_FANTASMA', pasillo: 'MZ01', columna: 1, nivel: 'N01' }];

    const [r] = resolverPosicionesActuales([], movimientos);

    expect(r.posicionBase).toBeNull();
    expect(r.sinBase).toBe(true);
    expect(r.movido).toBe(true);
    expect(r.posicionActual).toEqual({ pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: null, tipo: null });
  });

  it('base vacía y movimientos vacíos -> []', () => {
    expect(resolverPosicionesActuales([], [])).toEqual([]);
  });

  it('base vacía, con movimientos -> todos los artículos resultan sinBase=true', () => {
    const movimientos = [
      { articulo: 'A1', pasillo: 'MZ01', columna: 1 },
      { articulo: 'A2', pasillo: 'MZ01', columna: 2 },
    ];
    const resultado = resolverPosicionesActuales([], movimientos);
    expect(resultado).toHaveLength(2);
    resultado.forEach(r => expect(r.sinBase).toBe(true));
  });

  it('base con movimientos vacíos -> todos los artículos quedan con movido=false, igual a su base', () => {
    const base = [
      { articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL' },
      { articulo: 'A2', pasillo: 'MZ02', columna: 2, nivel: 'N02', clase: 'B', tipo: 'NORMAL' },
    ];
    const resultado = resolverPosicionesActuales(base, []);
    expect(resultado).toHaveLength(2);
    resultado.forEach(r => expect(r.movido).toBe(false));
  });

  it('artículo eliminado (sala) -> posicionActual queda en null explícito, pero posicionBase se conserva', () => {
    const base = [{ articulo: 'SKU004', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL' }];
    const [r] = resolverPosicionesActuales(base, [], ['SKU004']);
    expect(r.posicionActual).toBeNull();
    expect(r.posicionBase).toEqual(base[0]);
  });

  // --- Dato REAL extraído del diagnóstico de ADR-003 ---
  // No hubo un artículo "divergente" real para usar acá: la comparación
  // CUERPOS vs inventario_slotting quedó bloqueada por RLS (ver ADR-003), así
  // que nunca se obtuvo un par de valores real que difiriera entre ambas
  // fuentes. Lo que SÍ se verificó con datos reales (parseo local de
  // public/legacy/js/01-datos.js, sin red) fue el artículo "6104570" dentro
  // del rack "MZ01|16" -- se usa acá tal cual salió de CUERPOS en producción,
  // no como fixture inventado.
  it('con datos reales de producción (CUERPOS, rack MZ01|16, artículo 6104570) sin movimientos -> posición base intacta', () => {
    const baseReal = [{
      articulo: '6104570', pasillo: 'MZ01', columna: 16, nivel: 'N02',
      clase: 'A', tipo: 'NORMAL', picks: 1470, consumo: 0.12, rack_actual: 'RCL132-C001-N04-1',
    }];

    const [r] = resolverPosicionesActuales(baseReal, []);

    expect(r.posicionActual).toEqual({ pasillo: 'MZ01', columna: 16, nivel: 'N02', clase: 'A', tipo: 'NORMAL' });
    expect(r.movido).toBe(false);
    expect(r.posicionBase.rack_actual).toBe('RCL132-C001-N04-1');
  });

  it('con datos reales de producción (CUERPOS, artículo 6104570) + movimiento real a otro rack -> posicionActual cambia, posicionBase conserva el picks/consumo originales', () => {
    const baseReal = [{
      articulo: '6104570', pasillo: 'MZ01', columna: 16, nivel: 'N02',
      clase: 'A', tipo: 'NORMAL', picks: 1470, consumo: 0.12, rack_actual: 'RCL132-C001-N04-1',
    }];
    // Movimiento sintético (no hay uno real disponible, ver nota de ADR-003) --
    // representa "se movió a MZ03 columna 4" para ejercitar la separación
    // base/actual con el resto del registro siendo 100% real.
    const movimientos = [{ articulo: '6104570', pasillo: 'MZ03', columna: 4, nivel: 'N01', clase: 'A', tipo: 'NORMAL' }];

    const [r] = resolverPosicionesActuales(baseReal, movimientos);

    expect(r.posicionActual).toEqual({ pasillo: 'MZ03', columna: 4, nivel: 'N01', clase: 'A', tipo: 'NORMAL' });
    expect(r.posicionBase.picks).toBe(1470);
    expect(r.posicionBase.consumo).toBe(0.12);
  });
});
