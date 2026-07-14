/**
 * Import de la tabla maestra RCL<->MZ por posición (identidad_legacy) --
 * F1 de la migración de nomenclatura. Funciones puras (parseo + validación),
 * mismo criterio que cargaMasiva.service.js: nada de Supabase acá, eso vive
 * en src/shared/services/identidadLegacy.service.js.
 *
 * Formato de archivo acordado con el usuario: dos columnas, headers EXACTOS
 * "MZ" y "RCL" (no hay sinónimos como en cargaMasiva -- a propósito, es un
 * archivo que arma una sola persona a mano, no un Excel externo variable).
 *
 * `RCL` no siempre trae un código real -- 3 estados posibles (ver
 * supabase/sql/2026-07-14_identidad_legacy_estados.sql), los 3 son VÁLIDOS,
 * ninguno se rechaza: "asignado" (código real), "pendiente_asignar" (la
 * celda tiene "*" -- el usuario todavía no lo identificó a mano),
 * "sin_rcl" (celda vacía o "N/A"/"n/a"/"na"/"NA" -- la posición es nueva,
 * nunca existió en el sistema viejo). Solo se rechaza un valor que no
 * calza con NINGUNA de las 4 formas (ni código real, ni "*", ni "N/A", ni vacío).
 */
const REGEX_MZ = /^MZ(\d{2})-C(\d{3})$/;
const REGEX_RCL_PREFIJO = /^RCL\d+/;
const REGEX_NA = /^(N\/A|NA)$/i; // acepta N/A, n/a, na, NA -- con o sin slash, sin distinguir mayúsculas

/** Resuelve el estado_rcl de una celda RCL ya recortada -- único lugar que conoce las 4 formas válidas. */
function resolverEstadoRcl(rclTexto) {
  if (rclTexto === '') return { valido: true, estadoRcl: 'sin_rcl', rclCodigo: null };
  if (rclTexto === '*') return { valido: true, estadoRcl: 'pendiente_asignar', rclCodigo: null };
  if (REGEX_NA.test(rclTexto)) return { valido: true, estadoRcl: 'sin_rcl', rclCodigo: null };
  if (REGEX_RCL_PREFIJO.test(rclTexto.toUpperCase())) return { valido: true, estadoRcl: 'asignado', rclCodigo: rclTexto };
  return { valido: false, motivo: `Formato de RCL inválido ("${rclTexto}") -- esperado RCL+números, "*", "N/A", o vacío` };
}

/** Busca una clave de columna tolerando espacios/mayúsculas alrededor del nombre EXACTO -- no una lista de sinónimos. */
function valorDeColumna(raw, nombreExacto) {
  const clave = Object.keys(raw).find(k => k.trim().toUpperCase() === nombreExacto);
  return clave !== undefined ? String(raw[clave] ?? '').trim() : '';
}

/** Clave legible "MZ01-C001" para mensajes y para comparar duplicados. */
export function claveMz(mzPasillo, mzColumna) {
  return `${mzPasillo}-C${String(mzColumna).padStart(3, '0')}`;
}

/**
 * Una fila cruda (del sheet o del CSV) -> forma parseada. `fila` es el
 * número de fila tal como lo vería el usuario en Excel (la primera fila de
 * datos es la 2, ya que la 1 es el encabezado) -- así el reporte de
 * rechazadas puede decir "fila 7", no un índice de array que no significa
 * nada para quien arma el archivo a mano.
 */
export function parsearFilaIdentidad(fila, raw) {
  const mzTexto = valorDeColumna(raw, 'MZ');
  const rclTexto = valorDeColumna(raw, 'RCL');
  const base = { fila, mzTexto, rclTexto };

  if (!mzTexto) {
    return { ...base, valido: false, motivo: 'Celda vacía (falta MZ)' };
  }
  const matchMz = mzTexto.toUpperCase().match(REGEX_MZ);
  if (!matchMz) {
    return { ...base, valido: false, motivo: `Formato de MZ inválido ("${mzTexto}") -- esperado MZ0X-C0YY` };
  }

  const rcl = resolverEstadoRcl(rclTexto);
  if (!rcl.valido) {
    return { ...base, valido: false, motivo: rcl.motivo };
  }

  return {
    ...base, valido: true, motivo: '',
    mzPasillo: `MZ${matchMz[1]}`,
    mzColumna: parseInt(matchMz[2], 10),
    estadoRcl: rcl.estadoRcl,
    rclCodigo: rcl.rclCodigo, // null si no es "asignado" -- tal cual viene si lo es, sufijos NO se normalizan
  };
}

export function parsearFilasIdentidad(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  return rawRows.map((raw, i) => parsearFilaIdentidad(i + 2, raw));
}

/**
 * Valida el lote ya parseado contra sí mismo (MZ/RCL repetidos DENTRO del
 * archivo) y contra lo que ya existe en la base (`existentes`, la salida de
 * identidadLegacyService.listar()) -- un RCL que hoy pertenece a OTRO MZ es
 * un conflicto real (relación 1 a 1 estricta), pero re-importar el MISMO MZ
 * con el MISMO u OTRO rcl_codigo es un upsert válido (idempotente por MZ,
 * confirmado con el usuario -- así puede corregir y resubir mientras arma
 * la tabla a mano, sin que el import le rechace sus propias correcciones).
 *
 * Las filas con `rclCodigo === null` ("pendiente_asignar"/"sin_rcl") quedan
 * EXENTAS de todo el chequeo de duplicado de RCL -- ni entre sí, ni contra
 * la base -- mismo comportamiento que el índice único parcial de Postgres
 * (`WHERE rcl_codigo IS NOT NULL`, ver el SQL de esta migración): los NULL
 * nunca compiten por unicidad.
 */
export function validarIdentidadLegacy(filasParsed, existentes = []) {
  const mzExistentePorRcl = new Map(
    existentes.filter(e => e.rclCodigo != null).map(e => [e.rclCodigo, claveMz(e.mzPasillo, e.mzColumna)])
  );

  const conteoMz = new Map();
  const conteoRcl = new Map();
  for (const f of filasParsed) {
    if (!f.valido) continue;
    const mzKey = claveMz(f.mzPasillo, f.mzColumna);
    conteoMz.set(mzKey, (conteoMz.get(mzKey) || 0) + 1);
    if (f.rclCodigo != null) conteoRcl.set(f.rclCodigo, (conteoRcl.get(f.rclCodigo) || 0) + 1);
  }

  const filas = filasParsed.map(f => {
    if (!f.valido) return f; // ya rechazada por formato/celda vacía -- no se revalida

    const mzKey = claveMz(f.mzPasillo, f.mzColumna);

    if (conteoMz.get(mzKey) > 1) {
      return { ...f, valido: false, motivo: `MZ duplicado dentro del archivo (${mzKey} aparece ${conteoMz.get(mzKey)} veces)` };
    }
    if (f.rclCodigo != null) {
      if (conteoRcl.get(f.rclCodigo) > 1) {
        return { ...f, valido: false, motivo: `RCL duplicado dentro del archivo ("${f.rclCodigo}" aparece ${conteoRcl.get(f.rclCodigo)} veces)` };
      }
      const mzExistente = mzExistentePorRcl.get(f.rclCodigo);
      if (mzExistente && mzExistente !== mzKey) {
        return { ...f, valido: false, motivo: `"${f.rclCodigo}" ya está asignado a ${mzExistente} en la base -- no puede repetirse en ${mzKey}` };
      }
    }
    return f;
  });

  return {
    filas,
    validas: filas.filter(f => f.valido),
    rechazadas: filas.filter(f => !f.valido),
  };
}
