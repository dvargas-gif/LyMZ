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
 * (Testing Library) todavía.
 *
 * Fixture: tests/fixtures/identidad_legacy_test.(xlsx|csv) -- 16 filas de
 * datos, formato SUB-POSICIÓN (MZ01-C001-N01-1 <-> RCL112-C001-N01-1, ver
 * archivo real del cliente). 8 válidas (asignado x4, incluyendo el mismo
 * pasillo+columna en dos niveles distintos -- NO es duplicado; sin_rcl x3
 * -- vacío, "N/A" bare, "N/A-n01-1" con sufijo en minúsculas; pendiente_asignar
 * x1) + 8 rechazadas, una por cada categoría de error real -- MZ duplicado y
 * RCL duplicado ocupan 2 filas cada uno porque una duplicación no existe en
 * una sola fila.
 */
const RUTA_XLSX = resolve(import.meta.dirname, '../../../tests/fixtures/identidad_legacy_test.xlsx');
const RUTA_CSV = resolve(import.meta.dirname, '../../../tests/fixtures/identidad_legacy_test.csv');

// Simula lo que ya existiría en la base antes de este import -- MZ09-C002
// (nivel 1, subnivel 1) tiene asignado RCL999-C999 (nivel 1, subnivel 1), y
// el fixture intenta reasignar esa misma sub-posición RCL a MZ12-C005.
const EXISTENTES = [{ mzPasillo: 'MZ09', mzColumna: 2, mzNivel: 1, mzSubnivel: 1, rclCodigo: 'RCL999-C999', rclNivel: 1, rclSubnivel: 1, estadoRcl: 'asignado' }];

function parsearArchivo(ruta, tipo) {
  const datos = tipo === 'buffer' ? readFileSync(ruta) : readFileSync(ruta, 'utf-8');
  const wb = XLSX.read(datos, { type: tipo });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return parsearFilasIdentidad(XLSX.utils.sheet_to_json(hoja, { defval: '' }));
}

describe('import de identidad_legacy contra el fixture real (.xlsx)', () => {
  const { validas, rechazadas } = validarIdentidadLegacy(parsearArchivo(RUTA_XLSX, 'buffer'), EXISTENTES);

  it('carga exactamente 8 filas válidas y rechaza 8', () => {
    expect(validas).toHaveLength(8);
    expect(rechazadas).toHaveLength(8);
  });

  it('el mismo pasillo+columna en dos niveles distintos (filas 2 y 3) son AMBAS válidas, no duplicado', () => {
    const f2 = validas.find(f => f.fila === 2);
    const f3 = validas.find(f => f.fila === 3);
    expect(f2).toMatchObject({ mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 1, estadoRcl: 'asignado', rclCodigo: 'RCL112-C001' });
    expect(f3).toMatchObject({ mzPasillo: 'MZ01', mzColumna: 1, mzNivel: 2, estadoRcl: 'asignado', rclCodigo: 'RCL112-C001' });
  });

  it('las filas de estados especiales (6-9) son VÁLIDAS con el estado_rcl correcto', () => {
    const porFila = fila => validas.find(f => f.fila === fila);

    expect(porFila(6)).toMatchObject({ mzPasillo: 'MZ09', mzColumna: 1, mzNivel: 1, estadoRcl: 'sin_rcl', rclCodigo: null }); // N/A con sufijo, minúsculas
    expect(porFila(7)).toMatchObject({ mzPasillo: 'MZ09', mzColumna: 2, mzNivel: 1, estadoRcl: 'sin_rcl', rclCodigo: null }); // N/A bare
    expect(porFila(8)).toMatchObject({ mzPasillo: 'MZ10', mzColumna: 1, mzNivel: 1, estadoRcl: 'pendiente_asignar', rclCodigo: null }); // "*"
    expect(porFila(9)).toMatchObject({ mzPasillo: 'MZ10', mzColumna: 2, mzNivel: 1, estadoRcl: 'sin_rcl', rclCodigo: null }); // vacío
  });

  it('rechaza cada categoría de error con el motivo EXACTO prometido', () => {
    const motivoDe = fila => rechazadas.find(f => f.fila === fila)?.motivo;

    expect(motivoDe(10)).toBe('Formato de MZ inválido ("MZ1-C001-N01-1") -- esperado MZ0X-C0YY-N0Z-1');
    expect(motivoDe(11)).toBe('Formato de RCL inválido ("RCLABC-C001-N01-1") -- esperado RCLxxx-Cxxx-N0Z-1, "*", "N/A", o vacío');
    expect(motivoDe(12)).toBe('Celda vacía (falta MZ)');
    expect(motivoDe(13)).toBe('MZ duplicado dentro del archivo (MZ12-C001-N01-1 aparece 2 veces)');
    expect(motivoDe(14)).toBe('MZ duplicado dentro del archivo (MZ12-C001-N01-1 aparece 2 veces)');
    expect(motivoDe(15)).toBe('RCL duplicado dentro del archivo ("RCL160-C001-N01-1" aparece 2 veces)');
    expect(motivoDe(16)).toBe('RCL duplicado dentro del archivo ("RCL160-C001-N01-1" aparece 2 veces)');
    expect(motivoDe(17)).toBe('"RCL999-C999-N01-1" ya está asignado a MZ09-C002-N01-1 en la base -- no puede repetirse en MZ12-C005-N01-1');
  });

  it('ninguna fila válida se cuela entre las rechazadas ni viceversa', () => {
    expect(rechazadas.every(f => !f.valido)).toBe(true);
    expect(validas.every(f => f.valido)).toBe(true);
  });
});

describe('import de identidad_legacy contra el fixture real (.csv) -- mismo resultado que el .xlsx', () => {
  const { validas, rechazadas } = validarIdentidadLegacy(parsearArchivo(RUTA_CSV, 'string'), EXISTENTES);

  it('produce EXACTAMENTE el mismo conteo que la versión .xlsx', () => {
    expect(validas).toHaveLength(8);
    expect(rechazadas).toHaveLength(8);
  });
});

describe('idempotencia -- importar el mismo fixture dos veces seguidas', () => {
  it('la segunda vuelta actualiza en vez de fallar, y el conteo final es igual al de la primera', () => {
    const parsed = parsearArchivo(RUTA_XLSX, 'buffer');

    const primera = validarIdentidadLegacy(parsed, EXISTENTES);
    expect(primera.validas).toHaveLength(8);

    // Simula lo que guardarLote() habría dejado en la base tras la primera
    // vuelta (upsert real) -- las 8 filas válidas ya están, más lo que ya
    // había antes. Nunca se llama a Supabase acá (ver nota de la cabecera).
    const existentesTrasPrimeraVuelta = [
      ...EXISTENTES,
      ...primera.validas.map(f => ({
        mzPasillo: f.mzPasillo, mzColumna: f.mzColumna, mzNivel: f.mzNivel, mzSubnivel: f.mzSubnivel,
        rclCodigo: f.rclCodigo, rclNivel: f.rclNivel, rclSubnivel: f.rclSubnivel, estadoRcl: f.estadoRcl,
      })),
    ];

    const segunda = validarIdentidadLegacy(parsed, existentesTrasPrimeraVuelta);
    expect(segunda.validas).toHaveLength(primera.validas.length);
    expect(segunda.rechazadas).toHaveLength(primera.rechazadas.length);
    expect(segunda.rechazadas.map(f => f.motivo)).toEqual(primera.rechazadas.map(f => f.motivo));
  });
});
