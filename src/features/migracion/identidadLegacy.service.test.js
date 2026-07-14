import { describe, it, expect } from 'vitest';
import { claveMz, parsearFilaIdentidad, parsearFilasIdentidad, validarIdentidadLegacy } from './identidadLegacy.service.js';

describe('claveMz', () => {
  it('formatea pasillo+columna con padding a 3 dígitos', () => {
    expect(claveMz('MZ01', 1)).toBe('MZ01-C001');
    expect(claveMz('MZ08', 41)).toBe('MZ08-C041');
  });
});

describe('parsearFilaIdentidad', () => {
  it('parsea una fila válida', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ01-C001', RCL: 'RCL121-C001' });
    expect(fila).toEqual({
      fila: 2, mzTexto: 'MZ01-C001', rclTexto: 'RCL121-C001',
      valido: true, motivo: '', mzPasillo: 'MZ01', mzColumna: 1, estadoRcl: 'asignado', rclCodigo: 'RCL121-C001',
    });
  });

  it('tolera espacios y minúsculas en los headers', () => {
    const fila = parsearFilaIdentidad(2, { ' mz ': 'MZ02-C010', ' rcl ': 'RCL200-001' });
    expect(fila.valido).toBe(true);
    expect(fila.mzPasillo).toBe('MZ02');
    expect(fila.mzColumna).toBe(10);
  });

  it('NO normaliza el sufijo del código RCL -- se guarda tal cual', () => {
    expect(parsearFilaIdentidad(2, { MZ: 'MZ01-C001', RCL: 'RCL121-001' }).rclCodigo).toBe('RCL121-001');
    expect(parsearFilaIdentidad(3, { MZ: 'MZ01-C002', RCL: 'RCL122-C001' }).rclCodigo).toBe('RCL122-C001');
  });

  it('un código real -> estado_rcl "asignado"', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ01-C001', RCL: 'RCL121-C001' });
    expect(fila.estadoRcl).toBe('asignado');
    expect(fila.rclCodigo).toBe('RCL121-C001');
  });

  it('rechaza celda vacía cuando falta el MZ (el RCL vacío ya no es un rechazo -- ver "sin_rcl" abajo)', () => {
    expect(parsearFilaIdentidad(2, { MZ: '', RCL: 'RCL121-C001' }).motivo).toBe('Celda vacía (falta MZ)');
  });

  it('rechaza formato de MZ inválido', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ1-C1', RCL: 'RCL121-C001' });
    expect(fila.valido).toBe(false);
    expect(fila.motivo).toMatch(/Formato de MZ inválido/);
  });

  it('rechaza formato de RCL inválido (no es código real, ni "*", ni "N/A", ni vacío)', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ01-C001', RCL: 'XCL121-C001' });
    expect(fila.valido).toBe(false);
    expect(fila.motivo).toMatch(/Formato de RCL inválido/);
  });

  it('RCL vacío -> VÁLIDA, estado_rcl "sin_rcl", rclCodigo null', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ11-C001', RCL: '' });
    expect(fila.valido).toBe(true);
    expect(fila.estadoRcl).toBe('sin_rcl');
    expect(fila.rclCodigo).toBeNull();
  });

  it('RCL "*" -> VÁLIDA, estado_rcl "pendiente_asignar", rclCodigo null', () => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ11-C003', RCL: '*' });
    expect(fila.valido).toBe(true);
    expect(fila.estadoRcl).toBe('pendiente_asignar');
    expect(fila.rclCodigo).toBeNull();
  });

  it.each(['N/A', 'n/a', 'NA', 'na'])('RCL "%s" -> VÁLIDA, estado_rcl "sin_rcl", rclCodigo null', variante => {
    const fila = parsearFilaIdentidad(2, { MZ: 'MZ11-C004', RCL: variante });
    expect(fila.valido).toBe(true);
    expect(fila.estadoRcl).toBe('sin_rcl');
    expect(fila.rclCodigo).toBeNull();
  });
});

describe('parsearFilasIdentidad', () => {
  it('numera las filas empezando en 2 (fila 1 = encabezado)', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001', RCL: 'RCL121-C001' },
      { MZ: 'MZ01-C002', RCL: 'RCL122-C001' },
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
      { MZ: 'MZ01-C001', RCL: 'RCL121-C001' },
      { MZ: 'MZ01-C002', RCL: 'RCL122-C001' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(2);
    expect(rechazadas).toHaveLength(0);
  });

  it('rechaza MZ duplicado dentro del archivo (ambas filas, no solo la segunda)', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001', RCL: 'RCL121-C001' },
      { MZ: 'MZ01-C001', RCL: 'RCL999-C001' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(2);
    rechazadas.forEach(f => expect(f.motivo).toMatch(/MZ duplicado/));
  });

  it('rechaza RCL duplicado dentro del archivo', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001', RCL: 'RCL121-C001' },
      { MZ: 'MZ01-C002', RCL: 'RCL121-C001' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(2);
    rechazadas.forEach(f => expect(f.motivo).toMatch(/RCL duplicado/));
  });

  it('rechaza un RCL que ya pertenece a OTRO MZ en la base', () => {
    const filas = parsearFilasIdentidad([{ MZ: 'MZ01-C005', RCL: 'RCL121-C001' }]);
    const existentes = [{ mzPasillo: 'MZ09', mzColumna: 2, rclCodigo: 'RCL121-C001' }];
    const { validas, rechazadas } = validarIdentidadLegacy(filas, existentes);
    expect(validas).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toMatch(/ya está asignado a MZ09-C002/);
  });

  it('es idempotente por MZ -- re-importar el MISMO MZ (mismo o distinto RCL) no se rechaza', () => {
    const existentes = [{ mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL121-C001' }];
    const mismoRcl = validarIdentidadLegacy(parsearFilasIdentidad([{ MZ: 'MZ01-C001', RCL: 'RCL121-C001' }]), existentes);
    expect(mismoRcl.validas).toHaveLength(1);
    const rclCorregido = validarIdentidadLegacy(parsearFilasIdentidad([{ MZ: 'MZ01-C001', RCL: 'RCL121-C002' }]), existentes);
    expect(rclCorregido.validas).toHaveLength(1);
  });

  it('deja pasar filas válidas aunque otras del mismo lote sean inválidas', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ01-C001', RCL: 'RCL121-C001' },
      { MZ: 'formato-malo', RCL: 'RCL122-C001' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
  });

  it('varias filas "pendiente_asignar"/"sin_rcl" (rclCodigo null) NO se marcan como RCL duplicado entre sí', () => {
    const filas = parsearFilasIdentidad([
      { MZ: 'MZ11-C001', RCL: '*' },
      { MZ: 'MZ11-C002', RCL: '*' },
      { MZ: 'MZ11-C003', RCL: 'N/A' },
      { MZ: 'MZ11-C004', RCL: '' },
    ]);
    const { validas, rechazadas } = validarIdentidadLegacy(filas, []);
    expect(validas).toHaveLength(4);
    expect(rechazadas).toHaveLength(0);
  });

  it('una fila con rclCodigo null nunca choca contra un rcl_codigo null ya existente en la base', () => {
    const filas = parsearFilasIdentidad([{ MZ: 'MZ11-C005', RCL: '*' }]);
    const existentes = [{ mzPasillo: 'MZ11', mzColumna: 6, rclCodigo: null, estadoRcl: 'pendiente_asignar' }];
    const { validas, rechazadas } = validarIdentidadLegacy(filas, existentes);
    expect(validas).toHaveLength(1);
    expect(rechazadas).toHaveLength(0);
  });
});
