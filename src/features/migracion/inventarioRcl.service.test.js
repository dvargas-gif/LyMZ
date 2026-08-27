import { describe, it, expect } from 'vitest';
import { parsearFilaInventario, parsearFilasInventario, validarInventarioRcl, resolverEstadoYaMigrado } from './inventarioRcl.service.js';

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

  it('detecta una ubicación en formato MZ como "ya migrado" -- no la trata como formato inválido genérico', () => {
    const fila = parsearFilaInventario(2, { RCL: 'MZ03-C005-N01-1', Articulo: 'SKU001', Cantidad: '690' });
    expect(fila.valido).toBe(false);
    expect(fila.yaMigrado).toBe(true);
    expect(fila).toMatchObject({ mzPasillo: 'MZ03', mzColumna: 5, mzNivel: 1, mzSubnivel: 1 });
    expect(fila.motivo).toMatch(/ya está en formato MZ/);
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

  it('acepta la MISMA sub-posición con artículos DISTINTOS -- un nivel compartido entre varios SKU es normal, no un duplicado', () => {
    const filas = parsearFilasInventario([
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '5' },
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A2', Cantidad: '3' },
    ]);
    const { validas, rechazadas } = validarInventarioRcl(filas);
    expect(validas).toHaveLength(2);
    expect(rechazadas).toHaveLength(0);
  });

  it('SUMA cantidades cuando el MISMO artículo se repite en la MISMA sub-posición -- varios pallets del mismo SKU en un lugar es normal, no un error', () => {
    const filas = parsearFilasInventario([
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '5' },
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '8' },
    ]);
    const { validas, rechazadas } = validarInventarioRcl(filas);
    expect(validas).toHaveLength(1);
    expect(validas[0]).toMatchObject({ articulo: 'A1', cantidad: 13, pallets: 2 });
    expect(rechazadas).toHaveLength(0);
  });

  it('suma 3+ pallets del mismo artículo/sub-posición en una sola fila', () => {
    const filas = parsearFilasInventario([
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '5' },
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '8' },
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '2' },
    ]);
    const { validas } = validarInventarioRcl(filas);
    expect(validas).toHaveLength(1);
    expect(validas[0]).toMatchObject({ cantidad: 15, pallets: 3 });
  });

  it('sigue rechazando filas con formato/celda inválidos, sin mezclarlas con la suma', () => {
    const filas = parsearFilasInventario([
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '5' },
      { RCL: 'RCL-MAL', Articulo: 'A2', Cantidad: '3' },
    ]);
    const { validas, rechazadas } = validarInventarioRcl(filas);
    expect(validas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
  });

  it('separa las filas "ya migrado" (ubicación MZ) del resto de rechazadas, sin dejar de contarlas ahí también', () => {
    const filas = parsearFilasInventario([
      { RCL: 'RCL112-C001-N01-1', Articulo: 'A1', Cantidad: '5' },
      { RCL: 'RCL-MAL', Articulo: 'A2', Cantidad: '3' },
      { RCL: 'MZ03-C005-N01-1', Articulo: 'A3', Cantidad: '690' },
    ]);
    const { validas, rechazadas, yaMigrado } = validarInventarioRcl(filas);
    expect(validas).toHaveLength(1);
    expect(rechazadas).toHaveLength(2);
    expect(yaMigrado).toHaveLength(1);
    expect(yaMigrado[0]).toMatchObject({ articulo: 'A3', mzPasillo: 'MZ03', mzColumna: 5 });
  });
});

describe('resolverEstadoYaMigrado', () => {
  const filaBase = parsearFilaInventario(2, { RCL: 'MZ03-C005-N01-1', Articulo: '6032812', Cantidad: '690' });

  it('"confirmado" cuando el motor tiene ese destino+artículo como recolectado', () => {
    const [r] = resolverEstadoYaMigrado([filaBase], [
      { id: 1, mzPasillo: 'MZ03', mzColumna: 5, articulo: '6032812', estado: 'recolectado' },
    ]);
    expect(r.veredicto).toBe('confirmado');
    expect(r.movimientoId).toBe(1);
  });

  it('"pendiente_para_confirmar" cuando hay UN solo movimiento pendiente y ninguno recolectado -- guarda su id para poder marcarlo', () => {
    const [r] = resolverEstadoYaMigrado([filaBase], [
      { id: 7, mzPasillo: 'MZ03', mzColumna: 5, articulo: '6032812', estado: 'pendiente' },
    ]);
    expect(r.veredicto).toBe('pendiente_para_confirmar');
    expect(r.movimientoId).toBe(7);
  });

  it('"requiere_revision_manual" cuando hay más de un movimiento pendiente -- ambiguo, no se adivina cuál', () => {
    const [r] = resolverEstadoYaMigrado([filaBase], [
      { id: 7, mzPasillo: 'MZ03', mzColumna: 5, articulo: '6032812', estado: 'pendiente' },
      { id: 8, mzPasillo: 'MZ03', mzColumna: 5, articulo: '6032812', estado: 'pendiente' },
    ]);
    expect(r.veredicto).toBe('requiere_revision_manual');
    expect(r.movimientoId).toBeNull();
  });

  it('"requiere_revision_manual" cuando el único candidato está a_revisar/descartado -- ya tiene su propio motivo, no se toca solo', () => {
    const [r] = resolverEstadoYaMigrado([filaBase], [
      { id: 9, mzPasillo: 'MZ03', mzColumna: 5, articulo: '6032812', estado: 'a_revisar' },
    ]);
    expect(r.veredicto).toBe('requiere_revision_manual');
    expect(r.movimientoId).toBeNull();
  });

  it('"sin_registro" cuando el motor no tiene ningún movimiento para ese destino+artículo', () => {
    const [r] = resolverEstadoYaMigrado([filaBase], []);
    expect(r.veredicto).toBe('sin_registro');
  });

  it('no confunde artículos ni columnas distintas -- cruza por los 3 campos, no solo el pasillo', () => {
    const [r] = resolverEstadoYaMigrado([filaBase], [
      { mzPasillo: 'MZ03', mzColumna: 6, articulo: '6032812', estado: 'recolectado' },
      { mzPasillo: 'MZ03', mzColumna: 5, articulo: 'OTRO', estado: 'recolectado' },
    ]);
    expect(r.veredicto).toBe('sin_registro');
  });
});
