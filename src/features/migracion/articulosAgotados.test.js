import { describe, it, expect } from 'vitest';
import { detectarArticulosAgotados, detectarBufferSinStock } from './articulosAgotados.js';

const ARTICULO_BASE = { articulo: 'SKU001', pasillo: 'MZ06', columna: 11, nivel: 'N05', rack_actual: 'RCL119-C004-N05-1' };

describe('detectarArticulosAgotados', () => {
  it('artículo con stock real en su origen RCL -- no aparece como agotado', () => {
    const { agotados } = detectarArticulosAgotados(
      [ARTICULO_BASE],
      [{ rclCodigo: 'RCL119-C004', rclNivel: 5, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }]
    );
    expect(agotados).toHaveLength(0);
  });

  it('artículo cuya sub-posición+artículo no aparece en el inventario nuevo -- agotado', () => {
    const { agotados } = detectarArticulosAgotados([ARTICULO_BASE], []);
    expect(agotados).toHaveLength(1);
    expect(agotados[0]).toMatchObject({ articulo: 'SKU001', rclCodigo: 'RCL119-C004', rclNivel: 5, rclSubnivel: 1 });
  });

  it('artículo con cantidad 0 en el inventario nuevo -- agotado', () => {
    const { agotados } = detectarArticulosAgotados(
      [ARTICULO_BASE],
      [{ rclCodigo: 'RCL119-C004', rclNivel: 5, rclSubnivel: 1, articulo: 'SKU001', cantidad: 0 }]
    );
    expect(agotados).toHaveLength(1);
  });

  it('otro artículo en la MISMA sub-posición con stock -- no hace que SKU001 (sin stock) se salve', () => {
    const { agotados } = detectarArticulosAgotados(
      [ARTICULO_BASE],
      [{ rclCodigo: 'RCL119-C004', rclNivel: 5, rclSubnivel: 1, articulo: 'SKU999', cantidad: 40 }]
    );
    expect(agotados).toHaveLength(1);
    expect(agotados[0].articulo).toBe('SKU001');
  });

  it('artículo sin rack_actual parseable -- va a sinOrigenRcl, nunca se asume agotado', () => {
    const { agotados, sinOrigenRcl } = detectarArticulosAgotados(
      [{ ...ARTICULO_BASE, rack_actual: null }, { ...ARTICULO_BASE, articulo: 'SKU002', rack_actual: 'texto-raro' }],
      []
    );
    expect(agotados).toHaveLength(0);
    expect(sinOrigenRcl).toHaveLength(2);
  });
});

const BUFFER_ITEM_BASE = { id: 1, articulo: 'SKU001', movimientoId: null, origenRclCodigo: 'RCL119-C004', origenNivel: 'N05', origenSubNivel: '1' };

describe('detectarBufferSinStock', () => {
  it('artículo del buffer sin destino y sin stock real en su origen -- candidato a reubicar', () => {
    const sinStock = detectarBufferSinStock([BUFFER_ITEM_BASE], []);
    expect(sinStock).toEqual([{ id: 1, articulo: 'SKU001', origenRclCodigo: 'RCL119-C004', origenNivel: 'N05' }]);
  });

  it('artículo del buffer CON stock real en su origen -- no es candidato', () => {
    const sinStock = detectarBufferSinStock(
      [BUFFER_ITEM_BASE],
      [{ rclCodigo: 'RCL119-C004', rclNivel: 5, rclSubnivel: 1, articulo: 'SKU001', cantidad: 3 }]
    );
    expect(sinStock).toHaveLength(0);
  });

  it('artículo del buffer que YA tiene destino resuelto -- nunca es candidato, aunque su origen no tenga stock', () => {
    const sinStock = detectarBufferSinStock([{ ...BUFFER_ITEM_BASE, movimientoId: 42 }], []);
    expect(sinStock).toHaveLength(0);
  });

  it('sin snapshot de origen (origenRclCodigo null) -- se ignora, nunca se asume', () => {
    const sinStock = detectarBufferSinStock([{ ...BUFFER_ITEM_BASE, origenRclCodigo: null }], []);
    expect(sinStock).toHaveLength(0);
  });

  it('nivel CUERPO (sin equivalente numérico) -- se ignora, no hay con qué cruzar', () => {
    const sinStock = detectarBufferSinStock([{ ...BUFFER_ITEM_BASE, origenNivel: 'CUERPO' }], []);
    expect(sinStock).toHaveLength(0);
  });
});
