import { describe, it, expect } from 'vitest';
import { claveMz, parsearFilaIdentidad, parsearFilasIdentidad, validarIdentidadLegacy } from './identidadLegacy.service.js';

describe('claveMz', () => {
  it('formatea la sub-posición completa (pasillo+columna+nivel+subnivel)', () => {
    expect(claveMz('MZ01', 1, 1, 1)).toBe('MZ01-C001-N01-1');
    expect(claveMz('MZ08', 41, 5, 1)).toBe('MZ08-C041-N05-1');
  });
});

describe('parsearFilaIdentidad', () => {
  it('parsea una fila válida (asignado)', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' });
    expect(fila).toEqual({
      fila: 2, mzTexto: 'MZ01-C001-N01-1', rclTexto: 'RCL112-C001-N01-1',
      valido: true, motivo: '',
      mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 1, mzSubnivel: 1,
      estadoRcl: 'asignado', rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1,
    });
  });

  it('tolera "Mz"/"mz" (case insensitive) en el lado MZ', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'mz02-c010-n03-1', RCL: 'RCL140-C001-N03-1' });
    expect(fila.valido).toBe(true);
    expect(fila.mzPasillo).toBe('MZ02');
    expect(fila.mzColumna).toBe(10);
    expect(fila.mzNivel).toBe(3);
  });

  it('reconstruye rcl_codigo como RCL{n}-C{m} -- YA NO preserva el string original tal cual', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ01-C001-N01-1', RCL: 'rcl112-c001-n01-1' });
    expect(fila.rclCodigo).toBe('RCL112-C001');
    expect(fila.rclNivel).toBe(1);
    expect(fila.rclSubnivel).toBe(1);
  });

  it('rechaza celda vacía cuando falta el MZ (el RCL vacío ya no es un rechazo -- ver "sin_rcl" abajo)', () => {
    expect(parsearFilaIdentidad(2, { MZ: '', RCL: 'RCL112-C001-N01-1' }).motivo).toBe('Celda vacía (falta MZ)');
  });

  it('rechaza formato de MZ inválido (sin el sufijo de sub-posición)', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ01-C001', RCL: 'RCL112-C001-N01-1' });
    expect(fila.valido).toBe(false);
    expect(fila.motivo).toMatch(/Formato de MZ inválido/);
  });

  it('rechaza formato de RCL inválido (no es código real, ni "*", ni "N/A", ni vacío)', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ01-C001-N01-1', RCL: 'RCLABC-C001-N01-1' });
    expect(fila.valido).toBe(false);
    expect(fila.motivo).toMatch(/Formato de RCL inválido/);
  });

  it('RCL vacío -> VÁLIDA, estado_rcl "sin_rcl", campos RCL null', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ11-C001-N01-1', RCL: '' });
    expect(fila.valido).toBe(true);
    expect(fila.estadoRcl).toBe('sin_rcl');
    expect(fila.rclCodigo).toBeNull();
    expect(fila.rclNivel).toBeNull();
    expect(fila.rclSubnivel).toBeNull();
  });

  it('RCL "*" -> VÁLIDA, estado_rcl "pendiente_asignar", campos RCL null', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ11-C003-N01-1', RCL: '*' });
    expect(fila.valido).toBe(true);
    expect(fila.estadoRcl).toBe('pendiente_asignar');
    expect(fila.rclCodigo).toBeNull();
  });

  it.each(['N/A', 'n/a', 'NA', 'na'])('RCL "%s" (sin sufijo) -> VÁLIDA, estado_rcl "sin_rcl"', variante => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ11-C004-N01-1', RCL: variante });
    expect(fila.valido).toBe(true);
    expect(fila.estadoRcl).toBe('sin_rcl');
    expect(fila.rclCodigo).toBeNull();
  });

  it.each(['N/A-N01-1', 'n/a-n01-1', 'NA-N05-1'])('RCL "%s" (CON sufijo de sub-posición) -> VÁLIDA, estado_rcl "sin_rcl"', variante => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ11-C004-N01-1', RCL: variante });
    expect(fila.valido).toBe(true);
    expect(fila.estadoRcl).toBe('sin_rcl');
    expect(fila.rclCodigo).toBeNull();
  });
});

describe('parsearFilasIdentidad', () => {
  it('numera las filas empezando en 2 (fila 1 = encabezado)', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' },
      { MZ: 'MZ01-C001-N02-1', RCL: 'RCL112-C001-N02-1' },
    ]);
    expect(filas.map(f => f.fila)).toEqual([2, 3]);
  });

  it('devuelve [] si no hay filas', () => {
    expect(parsearFilasIdentidad([])).toEqual([]);
    expect(parsearFilasIdentidad(null)).toEqual([]);
  });
});

describe('validarIdentidadLegacy', () => {
  it('acepta un lote sin conflictos', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' },
      { MZ: 'MZ01-C002-N01-1', RCL: 'RCL113-C001-N01-1' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(2);
    expect(rechazadas).toHaveLength(0);
  });

  it('MISMO pasillo+columna, NIVEL distinto -> NO es duplicado (son las 5 sub-posiciones reales de la columna)', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' },
      { MZ: 'MZ01-C001-N02-1', RCL: 'RCL112-C001-N02-1' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(2);
    expect(rechazadas).toHaveLength(0);
  });

  it('rechaza MZ duplicado dentro del archivo (misma sub-posición exacta, ambas filas)', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' },
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL999-C001-N01-1' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(2);
    rechazadas.forEach(f => expect(f.motivo).toBe('MZ duplicado dentro del archivo (MZ01-C001-N01-1 aparece 2 veces)'));
  });

  it('rechaza RCL duplicado dentro del archivo (mismo código+nivel+subnivel)', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' },
      { MZ: 'MZ01-C002-N01-1', RCL: 'RCL112-C001-N01-1' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(2);
    rechazadas.forEach(f => expect(f.motivo).toBe('RCL duplicado dentro del archivo ("RCL112-C001-N01-1" aparece 2 veces)'));
  });

  it('el MISMO rcl_codigo en NIVEL distinto NO es duplicado (mismo rack físico, otra sub-posición)', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' },
      { MZ: 'MZ01-C001-N02-1', RCL: 'RCL112-C001-N02-1' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(2);
    expect(rechazadas).toHaveLength(0);
  });

  it('rechaza un RCL (sub-posición completa) que ya pertenece a OTRO MZ en la base', () => {
    const filas = parsearFilasIdentidad([{ MZ: 'MZ12-C005-N01-1', RCL: 'RCL999-C999-N01-1' }]);
    const existentes = [{ mzPasillo: 'MZ09', mzColumna: 2, mzNivel: 1, mzSubnivel: 1, rclCodigo: 'RCL999-C999', rclNivel: 1, rclSubnivel: 1 }];
    const { validas, rechazadas } = validarIdentidadLegacy(filas, existentes);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toBe('"RCL999-C999-N01-1" ya está asignado a MZ09-C002-N01-1 en la base -- no puede repetirse en MZ12-C005-N01-1');
  });

  it('es idempotente por sub-posición MZ -- re-importar la MISMA sub-posición (mismo o distinto RCL) no se rechaza', () => {
    const existentes = [{ mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 1, mzSubnivel: 1, rclCodigo: 'RCL112-C001', rclNivel: 1, rclSubnivel: 1 }];
    const mismoRcl = validarIdentidadLegacy(parsearFilasIdentidad([{ MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' }]), existentes);
    expect(mismoRcl.validas).toHaveLength(1);
    const rclCorregido = validarIdentidadLegacy(parsearFilasIdentidad([{ MZ: 'MZ01-C001-N01-1', RCL: 'RCL999-C001-N01-1' }]), existentes);
    expect(rclCorregido.validas).toHaveLength(1);
  });

  it('deja pasar filas válidas aunque otras del mismo lote sean inválidas', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001-N01-1', RCL: 'RCL112-C001-N01-1' },
      { MZ: 'formato-malo', RCL: 'RCL113-C001-N01-1' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
  });

  it('varias filas "pendiente_asignar"/"sin_rcl" (rclCodigo null) NO se marcan como RCL duplicado entre sí', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ11-C001-N01-1', RCL: '*' },
      { MZ: 'MZ11-C002-N01-1', RCL: '*' },
      { MZ: 'MZ11-C003-N01-1', RCL: 'N/A' },
      { MZ: 'MZ11-C004-N01-1', RCL: '' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(4);
    expect(rechazadas).toHaveLength(0);
  });

  it('una fila con rclCodigo null nunca choca contra un rcl_codigo null ya existente en la base', () => {
    const filas = parsearFilasIdentidad([{ MZ: 'MZ11-C005-N01-1', RCL: '*' }]);
    const existentes = [{ mzPasillo: 'MZ11', mzColumna: 6, mzNivel: 1, mzSubnivel: 1, rclCodigo: null, rclNivel: null, rclSubnivel: null, estadoRcl: 'pendiente_asignar' }];
    const { validas, rechazadas } = validarIdentidadLegacy(filas, existentes);
    expect(validas).toHaveLength(1);
    expect(rechazadas).toHaveLength(0);
  });
});
