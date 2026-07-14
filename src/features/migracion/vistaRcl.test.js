import { describe, it, expect } from 'vitest';
import { construirVistaRcl } from './vistaRcl.js';

const IDENTIDAD_BASE = { mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 1, mzSubnivel: 1, rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, estadoRcl: 'asignado' };

describe('construirVistaRcl', () => {
  it('arma un rack con el artículo/cantidad del inventario, en el nivel WMS correcto', () => {
    const racks = construirVistaRcl([IDENTIDAD_BASE], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }]);
    const rack = racks.get('MZ01|1');
    expect(rack.niveles.N01).toEqual([{ articulo: 'SKU001', consumo: 0, picks: null, nivelesAArmar: null, rackActual: 'RCL112-C001', clase: '-', tipo: 'NORMAL' }]);
  });

  it('sub-posición "pendiente_asignar"/"sin_rcl" -- no participa (no tiene rcl_codigo real)', () => {
    const racks = construirVistaRcl(
      [{ ...IDENTIDAD_BASE, estadoRcl: 'pendiente_asignar', rclCodigo: null, rclNivel: null, rclSubnivel: null }],
      [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }]
    );
    expect(racks.size).toBe(0);
  });

  it('sub-posición asignada pero sin fila de inventario -- no aparece (no inventar contenido)', () => {
    const racks = construirVistaRcl([IDENTIDAD_BASE], []);
    expect(racks.size).toBe(0);
  });

  it('cantidad 0 -- no ocupa nada en la vista', () => {
    const racks = construirVistaRcl([IDENTIDAD_BASE], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 0 }]);
    expect(racks.size).toBe(0);
  });

  it('cruza por rcl_codigo+nivel+subnivel, no por el nivel MZ -- dos niveles distintos de la misma columna quedan separados', () => {
    const racks = construirVistaRcl(
      [IDENTIDAD_BASE, { ...IDENTIDAD_BASE, mzNivel: 2, rclCodigo: 'RCL112-C001', rclNivel: 2 }],
      [
        { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 5 },
        { rclCodigo: 'RCL112-C001', rclNivel: 2, rclSubnivel: 1, articulo: 'SKU002', cantidad: 7 },
      ]
    );
    const rack = racks.get('MZ01|1');
    expect(rack.niveles.N01[0].articulo).toBe('SKU001');
    expect(rack.niveles.N02[0].articulo).toBe('SKU002');
  });

  it('agrupa varias identidades en el mismo rack MZ (varios niveles ocupados)', () => {
    const racks = construirVistaRcl(
      [IDENTIDAD_BASE, { ...IDENTIDAD_BASE, mzColumna: 2, rclCodigo: 'RCL200-C002' }],
      [
        { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 5 },
        { rclCodigo: 'RCL200-C002', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU003', cantidad: 2 },
      ]
    );
    expect(racks.size).toBe(2);
    expect(racks.get('MZ01|2').niveles.N01[0].articulo).toBe('SKU003');
  });
});
