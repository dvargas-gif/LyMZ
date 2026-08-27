import { describe, it, expect } from 'vitest';
import { construirVistaRcl } from './vistaRcl.js';

const IDENTIDAD_BASE = { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, estadoRcl: 'asignado', mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 1 };

describe('construirVistaRcl', () => {
  it('arma un rack con el artículo/cantidad del inventario, posicionado en la identidad FÍSICA propia del RCL (identidad_legacy), no en un destino de migración', () => {
    const racks = construirVistaRcl([IDENTIDAD_BASE], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }]);
    const rack = racks.get('MZ01|1');
    expect(rack.niveles.N01).toEqual([{
      articulo: 'SKU001', consumo: 0, picks: null, nivelesAArmar: null, rackActual: 'RCL112-C001', clase: '-', tipo: 'NORMAL',
      identidadFisica: { mzPasillo: 'MZ01', mzColumna: 1 }, destinoPlaneado: null,
    }]);
  });

  it('adjunta destinoPlaneado (plan de migración) por artículo cuando se lo pasan -- distinto de la identidad física propia del RCL', () => {
    const destinoPlaneadoPorArticulo = new Map([['SKU001', { mzPasillo: 'MZ04', mzColumna: 30, mzNivel: '1', ambiguo: false }]]);
    const racks = construirVistaRcl(
      [IDENTIDAD_BASE],
      [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }],
      destinoPlaneadoPorArticulo,
    );
    const item = racks.get('MZ01|1').niveles.N01[0];
    expect(item.identidadFisica).toEqual({ mzPasillo: 'MZ01', mzColumna: 1 });
    expect(item.destinoPlaneado).toEqual({ mzPasillo: 'MZ04', mzColumna: 30, mzNivel: '1', ambiguo: false });
  });

  it('convierte el nivel numérico de identidad_legacy (1-5) al formato WMS (N01-N05)', () => {
    const identidad = { ...IDENTIDAD_BASE, mzNivel: 3 };
    const racks = construirVistaRcl([identidad], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }]);
    expect(racks.get('MZ01|1').niveles.N03).toBeDefined();
  });

  it('sub-posición "pendiente_asignar"/"sin_rcl" -- no participa (no tiene posición física conocida)', () => {
    const racks = construirVistaRcl(
      [{ ...IDENTIDAD_BASE, estadoRcl: 'pendiente_asignar', rclCodigo: null, rclNivel: null, rclSubnivel: null }],
      [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }],
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

  it('dos artículos de la MISMA sub-posición RCL comparten la MISMA posición física -- ambos caen en el mismo rack (a diferencia del destino de migración, que sí podía separarlos)', () => {
    const inventarioRcl = [
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 5 },
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU002', cantidad: 7 },
    ];
    const racks = construirVistaRcl([IDENTIDAD_BASE], inventarioRcl);
    expect(racks.size).toBe(1);
    expect(racks.get('MZ01|1').niveles.N01.map(a => a.articulo)).toEqual(['SKU001', 'SKU002']);
  });

  it('agrupa varias identidades en racks MZ reales distintos, según su propia posición física', () => {
    const identidad = [IDENTIDAD_BASE, { ...IDENTIDAD_BASE, rclCodigo: 'RCL200-C002', mzPasillo: 'MZ01', mzColumna: 2 }];
    const inventarioRcl = [
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 5 },
      { rclCodigo: 'RCL200-C002', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU003', cantidad: 2 },
    ];
    const racks = construirVistaRcl(identidad, inventarioRcl);
    expect(racks.size).toBe(2);
    expect(racks.get('MZ01|2').niveles.N01[0].articulo).toBe('SKU003');
  });

  it('sin nivel WMS equivalente -- no se inventa uno (defensivo, no debería pasar con estado asignado)', () => {
    const racks = construirVistaRcl([{ ...IDENTIDAD_BASE, mzNivel: null }], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }]);
    expect(racks.size).toBe(0);
  });
});
