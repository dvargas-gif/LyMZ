import { describe, it, expect } from 'vitest';
import { detectarArticulosSinHogar } from './articulosSinHogar.js';

const IDENTIDAD = [
  { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, estadoRcl: 'asignado', mzPasillo: 'MZ01', mzColumna: 1 },
];

describe('detectarArticulosSinHogar', () => {
  it('un artículo con fila en inventario_slotting NO es "sin hogar", aunque también esté en inventario RCL/zonas de pick', () => {
    const res = detectarArticulosSinHogar(
      [{ articulo: 'SKU001', rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, cantidad: 5 }],
      [],
      [{ articulo: 'SKU001' }],
      IDENTIDAD,
    );
    expect(res).toEqual([]);
  });

  it('un artículo en inventario RCL sin fila en slotting es "sin hogar", con posición resuelta vía identidad_legacy', () => {
    const res = detectarArticulosSinHogar(
      [{ articulo: 'SKU002', rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, cantidad: 3 }],
      [],
      [],
      IDENTIDAD,
    );
    expect(res).toEqual([{ articulo: 'SKU002', fuente: 'inventario_rcl', mzPasillo: 'MZ01', mzColumna: 1 }]);
  });

  it('cantidad 0 en inventario RCL -- no cuenta como presencia real', () => {
    const res = detectarArticulosSinHogar(
      [{ articulo: 'SKU003', rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, cantidad: 0 }],
      [], [], IDENTIDAD,
    );
    expect(res).toEqual([]);
  });

  it('artículo sin origen RCL resoluble en identidad_legacy -- queda con posición null, no se inventa', () => {
    const res = detectarArticulosSinHogar(
      [{ articulo: 'SKU004', rclCodigo: 'RCL999-C999', rclNivel: 1, rclSubnivel: 1, cantidad: 1 }],
      [], [], IDENTIDAD,
    );
    expect(res).toEqual([{ articulo: 'SKU004', fuente: 'inventario_rcl', mzPasillo: null, mzColumna: null }]);
  });

  it('artículo solo en zonas_pick con ubicacionRcl reconocible -- se resuelve igual que inventario RCL', () => {
    const res = detectarArticulosSinHogar(
      [],
      [{ articulo: 'SKU005', ubicacionRcl: 'RCL112-C001-N01-1' }],
      [], IDENTIDAD,
    );
    expect(res).toEqual([{ articulo: 'SKU005', fuente: 'zona_pick', mzPasillo: 'MZ01', mzColumna: 1 }]);
  });

  it('artículo en zonas_pick sin ubicacionRcl (o formato irreconocible) -- queda listado, posición null', () => {
    const res = detectarArticulosSinHogar(
      [],
      [{ articulo: 'SKU006', ubicacionRcl: '' }, { articulo: 'SKU007', ubicacionRcl: 'texto libre cualquiera' }],
      [], IDENTIDAD,
    );
    expect(res).toEqual([
      { articulo: 'SKU006', fuente: 'zona_pick', mzPasillo: null, mzColumna: null },
      { articulo: 'SKU007', fuente: 'zona_pick', mzPasillo: null, mzColumna: null },
    ]);
  });

  it('un artículo presente en ambas fuentes (inventario RCL y zonas_pick) no se duplica -- gana la primera fuente resuelta', () => {
    const res = detectarArticulosSinHogar(
      [{ articulo: 'SKU008', rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, cantidad: 2 }],
      [{ articulo: 'SKU008', ubicacionRcl: 'RCL112-C001-N01-1' }],
      [], IDENTIDAD,
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ articulo: 'SKU008', fuente: 'inventario_rcl' });
  });
});
