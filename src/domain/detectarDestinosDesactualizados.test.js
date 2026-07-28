import { describe, it, expect } from 'vitest';
import { detectarDestinosDesactualizados } from './detectarDestinosDesactualizados.js';

function filaIdentidad({ rclCodigo, rclNivel = 1, rclSubnivel = 1, mzPasillo, mzColumna, mzNivel, estadoRcl = 'asignado' }) {
  return { mzPasillo, mzColumna, mzNivel, mzSubnivel: 1, rclCodigo, rclNivel, rclSubnivel, estadoRcl };
}
function filaInventarioRcl({ rclCodigo, rclNivel = 1, rclSubnivel = 1, articulo, cantidad = 5 }) {
  return { rclCodigo, rclNivel, rclSubnivel, articulo, cantidad };
}
function filaSlotting(articulo, pasillo, columna, nivel) {
  return { articulo, pasillo, columna, nivel };
}

describe('detectarDestinosDesactualizados -- caso real que lo disparó (RCL146-C003 / artículo 5180060)', () => {
  it('destino importado (identidad_legacy) distinto al destino real (inventario_slotting) -- lo reporta', () => {
    const identidad = [filaIdentidad({ rclCodigo: 'RCL146', rclSubnivel: 3, mzPasillo: 'MZ06', mzColumna: 18, mzNivel: 4 })];
    const inventarioRcl = [filaInventarioRcl({ rclCodigo: 'RCL146', rclSubnivel: 3, articulo: '5180060' })];
    const slotting = [filaSlotting('5180060', 'MZ06', 22, 'N02')]; // el destino real, distinto

    const resultado = detectarDestinosDesactualizados(identidad, inventarioRcl, slotting);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      articulo: '5180060', rclCodigo: 'RCL146', rclSubnivel: 3,
      destinoImportado: { pasillo: 'MZ06', columna: 18, nivel: 'N04' },
      destinoReal: { pasillo: 'MZ06', columna: 22, nivel: 'N02' },
    });
  });

  it('el artículo NO tiene ningún lugar reservado en el plan real -- destinoReal null, caso más grave', () => {
    const identidad = [filaIdentidad({ rclCodigo: 'RCL146', rclSubnivel: 3, mzPasillo: 'MZ06', mzColumna: 18, mzNivel: 4 })];
    const inventarioRcl = [filaInventarioRcl({ rclCodigo: 'RCL146', rclSubnivel: 3, articulo: '5180060' })];
    const resultado = detectarDestinosDesactualizados(identidad, inventarioRcl, []); // inventario_slotting vacío -- nunca tuvo plan
    expect(resultado).toHaveLength(1);
    expect(resultado[0].destinoReal).toBeNull();
  });
});

describe('detectarDestinosDesactualizados -- casos que NO deben reportarse', () => {
  it('destino importado y destino real coinciden exactamente -- no reporta nada', () => {
    const identidad = [filaIdentidad({ rclCodigo: 'RCL200', mzPasillo: 'MZ03', mzColumna: 5, mzNivel: 2 })];
    const inventarioRcl = [filaInventarioRcl({ rclCodigo: 'RCL200', articulo: 'A1' })];
    const slotting = [filaSlotting('A1', 'MZ03', 5, 'N02')];
    expect(detectarDestinosDesactualizados(identidad, inventarioRcl, slotting)).toHaveLength(0);
  });

  it('sub-posición con estado_rcl distinto de "asignado" -- no participa (no hay rcl_codigo real para cruzar)', () => {
    const identidad = [filaIdentidad({ rclCodigo: 'RCL200', mzPasillo: 'MZ03', mzColumna: 5, mzNivel: 2, estadoRcl: 'pendiente_asignar' })];
    const inventarioRcl = [filaInventarioRcl({ rclCodigo: 'RCL200', articulo: 'A1' })];
    const slotting = [filaSlotting('A1', 'MZ99', 1, 'N01')]; // destino real bien distinto, pero no debería importar
    expect(detectarDestinosDesactualizados(identidad, inventarioRcl, slotting)).toHaveLength(0);
  });

  it('sub-posición sin stock real (cantidad 0) -- no hay artículo físico que cruzar', () => {
    const identidad = [filaIdentidad({ rclCodigo: 'RCL200', mzPasillo: 'MZ03', mzColumna: 5, mzNivel: 2 })];
    const inventarioRcl = [filaInventarioRcl({ rclCodigo: 'RCL200', articulo: 'A1', cantidad: 0 })];
    expect(detectarDestinosDesactualizados(identidad, inventarioRcl, [])).toHaveLength(0);
  });

  it('mz_nivel fuera de N01-N05 -- no se puede comparar, no se asume nada', () => {
    const identidad = [filaIdentidad({ rclCodigo: 'RCL200', mzPasillo: 'MZ03', mzColumna: 5, mzNivel: 9 })];
    const inventarioRcl = [filaInventarioRcl({ rclCodigo: 'RCL200', articulo: 'A1' })];
    expect(detectarDestinosDesactualizados(identidad, inventarioRcl, [])).toHaveLength(0);
  });
});

describe('detectarDestinosDesactualizados -- varios artículos en la misma sub-posición', () => {
  it('una sub-posición con varios artículos -- cada uno se evalúa por separado', () => {
    const identidad = [filaIdentidad({ rclCodigo: 'RCL300', mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 1 })];
    const inventarioRcl = [
      filaInventarioRcl({ rclCodigo: 'RCL300', articulo: 'A1' }),
      filaInventarioRcl({ rclCodigo: 'RCL300', articulo: 'A2' }),
    ];
    const slotting = [
      filaSlotting('A1', 'MZ01', 1, 'N01'), // coincide -- no se reporta
      filaSlotting('A2', 'MZ05', 9, 'N03'), // no coincide -- se reporta
    ];
    const resultado = detectarDestinosDesactualizados(identidad, inventarioRcl, slotting);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].articulo).toBe('A2');
  });

  it('ordena los casos "sin destino real" antes que los de "destino distinto" -- más grave primero', () => {
    const identidad = [
      filaIdentidad({ rclCodigo: 'RCL1', mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 1 }),
      filaIdentidad({ rclCodigo: 'RCL2', mzPasillo: 'MZ01', mzColumna: 2, mzNivel: 1 }),
    ];
    const inventarioRcl = [
      filaInventarioRcl({ rclCodigo: 'RCL1', articulo: 'CON-DESTINO-DISTINTO' }),
      filaInventarioRcl({ rclCodigo: 'RCL2', articulo: 'SIN-DESTINO' }),
    ];
    const slotting = [filaSlotting('CON-DESTINO-DISTINTO', 'MZ09', 9, 'N05')];
    const resultado = detectarDestinosDesactualizados(identidad, inventarioRcl, slotting);
    expect(resultado.map(r => r.articulo)).toEqual(['SIN-DESTINO', 'CON-DESTINO-DISTINTO']);
  });
});
