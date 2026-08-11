import { describe, it, expect } from 'vitest';
import { construirVistaRcl } from './vistaRcl.js';

const IDENTIDAD_BASE = { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, estadoRcl: 'asignado' };

describe('construirVistaRcl', () => {
  it('arma un rack con el artículo/cantidad del inventario, usando el destino REAL de inventario_slotting (no el de identidad_legacy)', () => {
    const inventarioSlotting = [{ articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01' }];
    const racks = construirVistaRcl([IDENTIDAD_BASE], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }], inventarioSlotting);
    const rack = racks.get('MZ05|9');
    expect(rack.niveles.N01).toEqual([{ articulo: 'SKU001', consumo: 0, picks: null, nivelesAArmar: null, rackActual: 'RCL112-C001', clase: '-', tipo: 'NORMAL' }]);
  });

  it('un artículo sin destino real en inventario_slotting queda EXCLUIDO -- nunca se inventa un destino', () => {
    const racks = construirVistaRcl([IDENTIDAD_BASE], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SIN_DESTINO', cantidad: 10 }], []);
    expect(racks.size).toBe(0);
  });

  it('sub-posición "pendiente_asignar"/"sin_rcl" -- no participa (no tiene rcl_codigo real)', () => {
    const racks = construirVistaRcl(
      [{ ...IDENTIDAD_BASE, estadoRcl: 'pendiente_asignar', rclCodigo: null, rclNivel: null, rclSubnivel: null }],
      [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 10 }],
      [{ articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01' }],
    );
    expect(racks.size).toBe(0);
  });

  it('sub-posición asignada pero sin fila de inventario -- no aparece (no inventar contenido)', () => {
    const racks = construirVistaRcl([IDENTIDAD_BASE], [], []);
    expect(racks.size).toBe(0);
  });

  it('cantidad 0 -- no ocupa nada en la vista', () => {
    const racks = construirVistaRcl([IDENTIDAD_BASE], [{ rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 0 }], [{ articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01' }]);
    expect(racks.size).toBe(0);
  });

  it('dos artículos de la misma sub-posición RCL, con destinos MZ reales DISTINTOS -- cada uno cae en su propio rack (caso real confirmado: 596 de 1182 sub-posiciones están así)', () => {
    const inventarioRcl = [
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 5 },
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU002', cantidad: 7 },
    ];
    const inventarioSlotting = [
      { articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01' },
      { articulo: 'SKU002', pasillo: 'MZ02', columna: 20, nivel: 'CUERPO' },
    ];
    const racks = construirVistaRcl([IDENTIDAD_BASE], inventarioRcl, inventarioSlotting);
    expect(racks.size).toBe(2);
    expect(racks.get('MZ05|9').niveles.N01[0].articulo).toBe('SKU001');
    expect(racks.get('MZ02|20').niveles.CUERPO[0].articulo).toBe('SKU002');
  });

  it('una sub-posición con VARIOS artículos que SÍ comparten destino real -- todos aparecen, ninguno se pisa', () => {
    const inventarioRcl = [
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 5 },
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU002', cantidad: 8 },
    ];
    const inventarioSlotting = [
      { articulo: 'SKU001', pasillo: 'MZ05', columna: 9, nivel: 'N01' },
      { articulo: 'SKU002', pasillo: 'MZ05', columna: 9, nivel: 'N01' },
    ];
    const racks = construirVistaRcl([IDENTIDAD_BASE], inventarioRcl, inventarioSlotting);
    const rack = racks.get('MZ05|9');
    expect(rack.niveles.N01).toHaveLength(2);
    expect(rack.niveles.N01.map(a => a.articulo)).toEqual(['SKU001', 'SKU002']);
  });

  it('agrupa varias identidades en racks MZ reales distintos', () => {
    const identidad = [IDENTIDAD_BASE, { ...IDENTIDAD_BASE, rclCodigo: 'RCL200-C002' }];
    const inventarioRcl = [
      { rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU001', cantidad: 5 },
      { rclCodigo: 'RCL200-C002', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU003', cantidad: 2 },
    ];
    const inventarioSlotting = [
      { articulo: 'SKU001', pasillo: 'MZ01', columna: 1, nivel: 'N01' },
      { articulo: 'SKU003', pasillo: 'MZ01', columna: 2, nivel: 'N01' },
    ];
    const racks = construirVistaRcl(identidad, inventarioRcl, inventarioSlotting);
    expect(racks.size).toBe(2);
    expect(racks.get('MZ01|2').niveles.N01[0].articulo).toBe('SKU003');
  });
});
