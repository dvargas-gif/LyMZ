/**
 * Import de la tabla maestra RCL<->MZ por SUB-POSICIÓN (identidad_legacy) --
 * F1 de la migración de nomenclatura. Funciones puras (parseo + validación),
 * mismo criterio que cargaMasiva.service.js: nada de Supabase acá, eso vive
 * en src/shared/services/identidadLegacy.service.js.
 *
 * Formato de archivo acordado con el usuario: dos columnas, headers EXACTOS
 * "MZ" y "RCL" (no hay sinónimos como en cargaMasiva -- a propósito, es un
 * archivo que arma una sola persona a mano, no un Excel externo variable).
 * Grano de fila = SUB-POSICIÓN, no columna: "MZ01-C001-N01-1" <->
 * "RCL112-C001-N01-1" -- 5 sub-niveles (N01-N05) por columna.
 *
 * `RCL` no siempre trae un código real -- 3 estados posibles (ver
 * supabase/sql/2026-07-14_identidad_legacy_estados.sql), los 3 son VÁLIDOS,
 * ninguno se rechaza: "asignado" (código real), "pendiente_asignar" (la
 * celda tiene "*" -- el usuario todavía no lo identificó a mano),
 * "sin_rcl" (celda vacía o "N/A"/"n/a"/"na"/"NA", con o sin el sufijo de
 * sub-posición -- la posición es nueva, nunca existió en el sistema viejo).
 * Solo se rechaza un valor que no calza con NINGUNA de las 4 formas.
 */
const REGEX_MZ = /^MZ(\d{2})-C(\d{3})-N(\d+)-(\d+)$/;
const REGEX_RCL = /^RCL(\d+)-C(\d+)-N(\d+)-(\d+)$/;
const REGEX_NA = /^(N\/A|NA)(-N\d+-\d+)?$/i; // "N/A"/"NA", con o sin el sufijo "-n0X-1" -- ambas formas valen

/** Resuelve el estado_rcl de una celda RCL ya recortada -- único lugar que conoce las 4 formas válidas.
 * Nota: `rclCodigo` ya NO se preserva "tal cual venía" -- se reconstruye como
 * RCL{n}-C{m} a partir de los grupos parseados, porque ahora es una
 * estructura (nivel/subnivel salen aparte), no un string opaco. */
function resolverEstadoRcl(rclTexto) {
  const vacio = { rclCodigo: null, rclNivel: null, rclSubnivel: null };
  if (rclTexto === '') return { valido: true, estadoRcl: 'sin_rcl', ...vacio };
  if (rclTexto === '*') return { valido: true, estadoRcl: 'pendiente_asignar', ...vacio };
  if (REGEX_NA.test(rclTexto)) return { valido: true, estadoRcl: 'sin_rcl', ...vacio };
  const m = rclTexto.toUpperCase().match(REGEX_RCL);
  if (m) {
    return {
      valido: true, estadoRcl: 'asignado',
      rclCodigo: `RCL${m[1]}-C${m[2]}`, rclNivel: parseInt(m[3], 10), rclSubnivel: parseInt(m[4], 10),
    };
  }
  return { valido: false, motivo: `Formato de RCL inválido ("${rclTexto}") -- esperado RCLxxx-Cxxx-N0Z-1, "*", "N/A", o vacío` };
}

/** Busca una clave de columna tolerando espacios/mayúsculas alrededor del nombre EXACTO -- no una lista de sinónimos. */
function valorDeColumna(raw, nombreExacto) {
  const clave = Object.keys(raw).find(k => k.trim().toUpperCase() === nombreExacto);
  return clave !== undefined ? String(raw[clave] ?? '').trim() : '';
}

/** Clave legible "MZ01-C001-N01-1" (sub-posición completa) para mensajes y para comparar duplicados. */
export function claveMz(mzPasillo, mzColumna, mzNivel, mzSubnivel) {
  return `${mzPasillo}-C${String(mzColumna).padStart(3, '0')}-N${String(mzNivel).padStart(2, '0')}-${mzSubnivel}`;
}

/** Ídem para el lado RCL -- código base + su propia sub-posición (nivel/subnivel pueden diferir de los de MZ, son racks físicos distintos). */
function claveRcl(rclCodigo, rclNivel, rclSubnivel) {
  return `${rclCodigo}-N${String(rclNivel).padStart(2, '0')}-${rclSubnivel}`;
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
  const matchMz = mzTexto.toUpperCase().match(REGEX_MZ); // toUpperCase ya cubre "Mz" vs "MZ"
  if (!matchMz) {
    return { ...base, valido: false, motivo: `Formato de MZ inválido ("${mzTexto}") -- esperado MZ0X-C0YY-N0Z-1` };
  }

  const rcl = resolverEstadoRcl(rclTexto);
  if (!rcl.valido) {
    return { ...base, valido: false, motivo: rcl.motivo };
  }

  return {
    ...base, valido: true, motivo: '',
    mzPasillo: `MZ${matchMz[1]}`,
    mzColumna: parseInt(matchMz[2], 10),
    mzNivel: parseInt(matchMz[3], 10),
    mzSubnivel: parseInt(matchMz[4], 10),
    estadoRcl: rcl.estadoRcl,
    rclCodigo: rcl.rclCodigo, // null si no es "asignado"
    rclNivel: rcl.rclNivel,
    rclSubnivel: rcl.rclSubnivel,
  };
}

export function parsearFilasIdentidad(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  return rawRows.map((raw, i) => parsearFilaIdentidad(i + 2, raw));
}

/**
 * Valida el lote ya parseado contra sí mismo (MZ/RCL repetidos DENTRO del
 * archivo) y contra lo que ya existe en la base (`existentes`, la salida de
 * identidadLegacyService.listar()) -- un RCL que hoy pertenece a OTRA
 * sub-posición MZ es un conflicto real (relación 1 a 1 estricta sobre
 * código+nivel+subnivel), pero re-importar la MISMA sub-posición MZ con el
 * MISMO u OTRO rcl_codigo es un upsert válido (idempotente, confirmado con
 * el usuario).
 *
 * Las claves de duplicado son la SUB-POSICIÓN completa (pasillo+columna+
 * nivel+subnivel para MZ; código+nivel+subnivel para RCL) -- dos filas con
 * el mismo pasillo+columna pero NIVEL distinto NO son duplicado (son las
 * 5 sub-posiciones reales de esa columna), justo el caso que el archivo
 * real trae por diseño.
 *
 * Las filas con `rclCodigo === null` ("pendiente_asignar"/"sin_rcl") quedan
 * EXENTAS de todo el chequeo de duplicado de RCL -- ni entre sí, ni contra
 * la base -- mismo comportamiento que el índice único parcial de Postgres
 * (`WHERE rcl_codigo IS NOT NULL`): los NULL nunca compiten por unicidad.
 */
export function validarIdentidadLegacy(filasParsed, existentes = []) {
  const mzExistentePorRcl = new Map(
    existentes
      .filter(e => e.rclCodigo != null)
      .map(e => [claveRcl(e.rclCodigo, e.rclNivel, e.rclSubnivel), claveMz(e.mzPasillo, e.mzColumna, e.mzNivel, e.mzSubnivel)])
  );

  const conteoMz = new Map();
  const conteoRcl = new Map();
  for (const f of filasParsed) {
    if (!f.valido) continue;
    const mzKey = claveMz(f.mzPasillo, f.mzColumna, f.mzNivel, f.mzSubnivel);
    conteoMz.set(mzKey, (conteoMz.get(mzKey) || 0) + 1);
    if (f.rclCodigo != null) {
      const rclKey = claveRcl(f.rclCodigo, f.rclNivel, f.rclSubnivel);
      conteoRcl.set(rclKey, (conteoRcl.get(rclKey) || 0) + 1);
    }
  }

  const filas = filasParsed.map(f => {
    if (!f.valido) return f; // ya rechazada por formato/celda vacía -- no se revalida

    const mzKey = claveMz(f.mzPasillo, f.mzColumna, f.mzNivel, f.mzSubnivel);

    if (conteoMz.get(mzKey) > 1) {
      return { ...f, valido: false, motivo: `MZ duplicado dentro del archivo (${mzKey} aparece ${conteoMz.get(mzKey)} veces)` };
    }
    if (f.rclCodigo != null) {
      const rclKey = claveRcl(f.rclCodigo, f.rclNivel, f.rclSubnivel);
      if (conteoRcl.get(rclKey) > 1) {
        return { ...f, valido: false, motivo: `RCL duplicado dentro del archivo ("${rclKey}" aparece ${conteoRcl.get(rclKey)} veces)` };
      }
      const mzExistente = mzExistentePorRcl.get(rclKey);
      if (mzExistente && mzExistente !== mzKey) {
        return { ...f, valido: false, motivo: `"${rclKey}" ya está asignado a ${mzExistente} en la base -- no puede repetirse en ${mzKey}` };
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
