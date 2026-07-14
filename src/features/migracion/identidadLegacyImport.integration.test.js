import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { parsearFilasIdentidad, validarIdentidadLegacy } from './identidadLegacy.service.js';

/**
 * Test de integración contra un archivo REAL (no una lista de objetos a
 * mano) -- ejercita el mismo camino que PanelImportIdentidadLegacy.jsx:
 * XLSX.read() -> sheet_to_json() -> parsearFilasIdentidad() ->
 * validarIdentidadLegacy(). No monta el componente React ni pasa por
 * Supabase real: este proyecto no fabrica credenciales de prueba (ver
 * playwright.config.js) y no hay infraestructura de tests de componente
 * (Testing Library) todavía -- agregarla para un solo test sería una
 * dependencia nueva sin más uso. Esto cubre la misma lógica que la UI
 * ejecuta, con el mismo archivo de bytes real, que es lo que puede fallar
 * de verdad (encoding, headers con espacios, CSV vs XLSX).
 *
 * Fixture: tests/fixtures/identidad_legacy_test.(xlsx|csv) -- 31 filas de
 * datos, mismo contenido en los dos formatos (generados desde el mismo
 * array). 23 válidas (19 "asignado" limpias + 1 "asignado" con espacios de
 * sobra a propósito, confirma que el trim funciona + 1 "sin_rcl" vacío + 1
 * "pendiente_asignar" + 1 "sin_rcl" vía "N/A") + 8 rechazadas, una por cada
 * categoría de error real -- MZ duplicado y RCL duplicado ocupan 2 filas
 * cada uno porque una duplicación no existe en una sola fila.
 */
const RUTA_XLSX = resolve(import.meta.dirname, '../../../tests/fixtures/identidad_legacy_test.xlsx');
const RUTA_CSV = resolve(import.meta.dirname, '../../../tests/fixtures/identidad_legacy_test.csv');

// Simula lo que ya existiría en la base antes de este import -- MZ09-C002
// tiene asignado RCL999-C999, y el fixture intenta reasignarlo a MZ12-C005.
const EXISTENTES = [{ mzPasillo: 'MZ09', mzColumna: 2, rclCodigo: 'RCL999-C999', estadoRcl: 'asignado' }];

function parsearArchivo(ruta, tipo) {
  const datos = tipo === 'buffer' ? readFileSync(ruta) : readFileSync(ruta, 'utf-8');
  const wb = XLSX.read(datos, { type: tipo });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return parsearFilasIdentidad(XLSX.utils.sheet_to_json(hoja, { defval: '' }));
}

describe('import de identidad_legacy contra el fixture real (.xlsx)', () => {
  const { validas, rechazadas } = validarIdentidadLegacy(parsearArchivo(RUTA_XLSX, 'buffer'), EXISTENTES);

  it('carga exactamente 23 filas válidas y rechaza 8', () => {
    expect(validas).toHaveLength(23);
    expect(rechazadas).toHaveLength(8);
  });

  it('acepta la fila con espacios al inicio/final tras el trim (fila 21), estado "asignado"', () => {
    const fila = validas.find(f => f.fila === 21);
    expect(fila).toBeDefined();
    expect(fila.mzPasillo).toBe('MZ10');
    expect(fila.mzColumna).toBe(1);
    expect(fila.estadoRcl).toBe('asignado');
    expect(fila.rclCodigo).toBe('RCL220-C001'); // el propio código también viene con espacios en el archivo -- se recorta igual
  });

  it('las 3 filas de estados especiales (fila 22-24) son VÁLIDAS con el estado_rcl correcto', () => {
    const porFila = fila => validas.find(f => f.fila === fila);

    expect(porFila(22)).toMatchObject({ mzPasillo: 'MZ11', mzColumna: 1, estadoRcl: 'sin_rcl', rclCodigo: null });
    expect(porFila(23)).toMatchObject({ mzPasillo: 'MZ11', mzColumna: 3, estadoRcl: 'pendiente_asignar', rclCodigo: null });
    expect(porFila(24)).toMatchObject({ mzPasillo: 'MZ11', mzColumna: 4, estadoRcl: 'sin_rcl', rclCodigo: null });
  });

  it('rechaza cada categoría de error con el motivo EXACTO prometido', () => {
    const motivoDe = fila => rechazadas.find(f => f.fila === fila)?.motivo;

    expect(motivoDe(25)).toBe('Celda vacía (falta MZ)');
    expect(motivoDe(26)).toBe('Formato de MZ inválido ("MZ1-C1") -- esperado MZ0X-C0YY');
    expect(motivoDe(27)).toBe('Formato de RCL inválido ("XYZ301-C001") -- esperado RCL+números, "*", "N/A", o vacío');
    expect(motivoDe(28)).toBe('MZ duplicado dentro del archivo (MZ12-C001 aparece 2 veces)');
    expect(motivoDe(29)).toBe('MZ duplicado dentro del archivo (MZ12-C001 aparece 2 veces)');
    expect(motivoDe(30)).toBe('RCL duplicado dentro del archivo ("RCL304-C001" aparece 2 veces)');
    expect(motivoDe(31)).toBe('RCL duplicado dentro del archivo ("RCL304-C001" aparece 2 veces)');
    expect(motivoDe(32)).toBe('"RCL999-C999" ya está asignado a MZ09-C002 en la base -- no puede repetirse en MZ12-C005');
  });

  it('ninguna fila válida se cuela entre las rechazadas ni viceversa', () => {
    expect(rechazadas.every(f => !f.valido)).toBe(true);
    expect(validas.every(f => f.valido)).toBe(true);
  });
});

describe('import de identidad_legacy contra el fixture real (.csv) -- mismo resultado que el .xlsx', () => {
  const { validas, rechazadas } = validarIdentidadLegacy(parsearArchivo(RUTA_CSV, 'string'), EXISTENTES);

  it('produce EXACTAMENTE el mismo conteo que la versión .xlsx', () => {
    expect(validas).toHaveLength(23);
    expect(rechazadas).toHaveLength(8);
  });
});

describe('idempotencia -- importar el mismo fixture dos veces seguidas', () => {
  it('la segunda vuelta actualiza en vez de fallar, y el conteo final es igual al de la primera', () => {
    const parsed = parsearArchivo(RUTA_XLSX, 'buffer');

    // Primera vuelta: la base todavía no tiene nada del fixture (solo el
    // registro externo que ya usan los demás tests, MZ09-C002).
    const primera = validarIdentidadLegacy(parsed, EXISTENTES);
    expect(primera.validas).toHaveLength(23);

    // Simula lo que guardarLote() habría dejado en la base tras la primera
    // vuelta (upsert real) -- las 23 filas válidas ya están, más lo que ya
    // había antes. Nunca se llama a Supabase acá (ver nota de la cabecera).
    const existentesTrasPrimeraVuelta = [
      ...EXISTENTES,
      ...primera.validas.map(f => ({ mzPasillo: f.mzPasillo, mzColumna: f.mzColumna, rclCodigo: f.rclCodigo, estadoRcl: f.estadoRcl })),
    ];

    // Segunda vuelta: mismo archivo, sin tocarlo -- ningún MZ debería
    // rechazarse por "ya existe" (upsert, no insert) y el resultado tiene
    // que ser IDÉNTICO al de la primera vuelta.
    const segunda = validarIdentidadLegacy(parsed, existentesTrasPrimeraVuelta);
    expect(segunda.validas).toHaveLength(primera.validas.length);
    expect(segunda.rechazadas).toHaveLength(primera.rechazadas.length);
    expect(segunda.rechazadas.map(f => f.motivo)).toEqual(primera.rechazadas.map(f => f.motivo));
  });
});
