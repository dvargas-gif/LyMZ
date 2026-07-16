import { describe, it, expect } from 'vitest';
import { detectarDestinosListos } from './alertasBuffer.js';

function itemsBuffer(n, overrides = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, destinoMzPasillo: 'MZ06', destinoMzColumna: 11, articulo: `SKU${i}`, cantidad: 1, ...overrides }));
}

describe('detectarDestinosListos', () => {
  it('destino "recolectando" con suficientes artículos en el buffer -- genera alerta', () => {
    const slots = new Map([['MZ06|11', { estado: 'recolectando' }]]);
    const alertas = detectarDestinosListos(itemsBuffer(8), slots, 8);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ mzPasillo: 'MZ06', mzColumna: 11, cantidad: 8 });
  });

  it('menos artículos que el umbral -- no genera alerta todavía', () => {
    const slots = new Map([['MZ06|11', { estado: 'recolectando' }]]);
    const alertas = detectarDestinosListos(itemsBuffer(7), slots, 8);
    expect(alertas).toHaveLength(0);
  });

  it('destino todavía "vaciando" (no terminó su propio vaciado) -- no avisa aunque haya cantidad de sobra', () => {
    const slots = new Map([['MZ06|11', { estado: 'vaciando' }]]);
    const alertas = detectarDestinosListos(itemsBuffer(20), slots, 8);
    expect(alertas).toHaveLength(0);
  });

  it('destino sin slot todavía (nadie inició el traslado ahí) -- no avisa', () => {
    const alertas = detectarDestinosListos(itemsBuffer(20), new Map(), 8);
    expect(alertas).toHaveLength(0);
  });

  it('artículos sin destino resuelto (movimiento_id null) -- se ignoran, nunca cuentan para ningún destino', () => {
    const slots = new Map([['MZ06|11', { estado: 'recolectando' }]]);
    const items = [...itemsBuffer(3), { id: 99, destinoMzPasillo: null, destinoMzColumna: null, articulo: 'SKU-suelto', cantidad: 1 }];
    const alertas = detectarDestinosListos(items, slots, 8);
    expect(alertas).toHaveLength(0); // 3 < 8, y el suelto no suma a nada
  });

  it('varios destinos listos -- ordena por cantidad descendente, el más urgente primero', () => {
    const slots = new Map([['MZ06|11', { estado: 'recolectando' }], ['MZ04|8', { estado: 'bloqueado' }]]);
    const items = [
      ...itemsBuffer(9, { destinoMzPasillo: 'MZ06', destinoMzColumna: 11 }),
      ...itemsBuffer(15, { destinoMzPasillo: 'MZ04', destinoMzColumna: 8 }),
    ];
    const alertas = detectarDestinosListos(items, slots, 8);
    expect(alertas.map(a => `${a.mzPasillo}-C${a.mzColumna}`)).toEqual(['MZ04-C8', 'MZ06-C11']);
  });

  it('destino "confirmado" -- sigue contando como listo para recibir (mismo criterio que recolectando/bloqueado)', () => {
    const slots = new Map([['MZ06|11', { estado: 'confirmado' }]]);
    const alertas = detectarDestinosListos(itemsBuffer(8), slots, 8);
    expect(alertas).toHaveLength(1);
  });
});
