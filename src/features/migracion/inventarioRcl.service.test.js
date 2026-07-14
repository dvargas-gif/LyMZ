import { describe, it, expect } from 'vitest';
import { parsearFilaInventario, parsearFilasInventario, validarInventarioRcl } from './inventarioRcl.service.js';

describe('parsearFilaInventario', () => {
  it('parsea una fila válida con headers exactos', () => {
    const fila = parsearFilaInventario(2, { RCL: 'RCL112-C001-N01-1', Articulo: 'SKU001', Cantidad: '25' });
    expect(fila).toMatchObject({ valido: true, rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 25 });
  });

  it('reconoce headers con sinónimos (a diferencia de identidadLegacy.service.js)', () => {
    const fila = parsearFilaInventario(2, { 'Cod. Posición': 'RCL112-C001-N01-1', SKU: 'SKU001', Stock: '10' });
    expect(fila.valido).toBe(true);
    expect(fila.rclCodigo).toBe('RCL112-C001');
    expect(fila.cantidad).toBe(10);
  });

  it('rechaza celda vacía de RCL', () => {
    expect(parsearFilaInventario(2, { RCL: '', Articulo: 'SKU001', Cantidad: '1' }).motivo).toBe('Celda vacía (falta RCL)');
  });

  it('rechaza formato de RCL inválido', () => {
    const fila = parsearFilaInventario(2, { RCL: 'RCL-MAL', Articulo: 'SKU001', Cantidad: '1' });
    expect(fila.valido).toBe(false);
    expect(fila.motivo).toMatch(/Formato de RCL inválido/);
  });

  it('rechaza celda vacía de Artículo', () => {
    expect(parsearFilaInventario(2, { RCL: 'RCL112-C001-N01-1', Articulo: '', Cantidad: '1' }).motivo).toBe('Celda vacía (falta Artículo)');
  });

  it('rechaza cantidad no numérica o negativa', () => {
    expect(parsearFilaInventario(2, { RCL: 'RCL112-C001-N01-1', Articulo: 'SKU001', Cantidad: 'abc' }).valido).toBe(false);
    expect(parsearFilaInventario(2, { RCL: 'RCL112-C001-N01-1', Articulo: 'SKU001', Cantidad: '-5' }).valido).toBe(false);
  });

  it('cantidad vacía -> 0, válida (una sub-posición puede figurar sin stock)', () => {
    const fila = parsearFilaInventario(2, { RCL: 'RCL112-C001-N01-1', Articulo: 'SKU001', Cantidad: '' });
    expect(fila.valido).toBe(true);
    expect(fila.cantidad).toBe(0);
  });
});

describe('parsearFilasInventario', () => {
  it('numera desde la fila 2 y devuelve [] si no hay filas', () => {
    expect(parsearFilasInventario([{ RCL: 'RCL112-C001-N01-1', Articulo: 'A', Cantidad: '1' }]).map(f => f.fila)).toEqual([2]);
    expect(parsearFilasInventario([])).toEqual([]);
  });
});

describe('validarInventarioRcl', () => {
  it('acepta un lote sin conflictos', () => {
    const filas = parsearFilasInventario([
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '5' },
      { RCL: 'RCL112-C001-N02-1', Articulo: 'A2', Cantidad: '3' },
    ]);
    const { validas, rechazadas } = validarInventarioRcl(filas);
    expect(validas).toHaveLength(2);
    expect(rechazadas).toHaveLength(0);
  });

  it('rechaza la MISMA sub-posición repetida dentro del archivo', () => {
    const filas = parsearFilasInventario([
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '5' },
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A2', Cantidad: '3' },
    ]);
    const { validas, rechazadas } = validarInventarioRcl(filas);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(2);
  });
});
