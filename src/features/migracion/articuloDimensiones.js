/**
 * Import de dimensiones reales por artículo (sesión 2026-07-21) -- funciones
 * puras (parseo + validación), mismo criterio que identidadLegacy.js: nada
 * de Supabase acá, eso vive en src/shared/services/articuloDimensiones.service.js.
 *
 * El volumen NO se lee del archivo ni se calcula acá -- Postgres lo calcula
 * solo (columna generada, ver supabase/sql/2026-07-21_articulo_dimensiones.sql).
 * Nunca más un "Volumen" de Excel desactualizado.
 *
 * Nombres de columna tolerantes a espacios/mayúsculas Y a variaciones
 * conocidas (la columna de cantidad ya cambió de nombre una vez en la
 * práctica: "Cantidad" -> "Cantidad MAXIMA ") -- se busca por prefijo, no
 * por el nombre exacto, para no romper de nuevo si vuelve a cambiar.
 */
function valorPorPrefijo(raw, prefijo) {
  const clave = Object.keys(raw).find(k => k.trim().toUpperCase().startsWith(prefijo.toUpperCase()));
  return clave !== undefined ? raw[clave] : undefined;
}

function numeroPositivo(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {number} fila -- número de fila tal como lo vería el usuario en Excel (fila 2 = primera fila de datos).
 * @param {object} raw -- fila cruda del sheet.
 */
export function parsearFilaDimensiones(fila, raw) {
  const articulo = String(valorPorPrefijo(raw, 'Código Articulo') ?? valorPorPrefijo(raw, 'Codigo Articulo') ?? '').trim();
  const base = { fila, articulo };

  if (!articulo) {
    return { ...base, valido: false, motivo: 'Celda vacía (falta Código Articulo)' };
  }

  const largo = numeroPositivo(valorPorPrefijo(raw, 'Largo'));
  const ancho = numeroPositivo(valorPorPrefijo(raw, 'Ancho'));
  const alto = numeroPositivo(valorPorPrefijo(raw, 'Alto'));
  const cantidadMaxima = numeroPositivo(valorPorPrefijo(raw, 'Cantidad'));
  const peso = Number(valorPorPrefijo(raw, 'Peso'));

  const faltantes = [];
  if (!largo) faltantes.push('Largo');
  if (!ancho) faltantes.push('Ancho');
  if (!alto) faltantes.push('Alto');
  if (!cantidadMaxima) faltantes.push('Cantidad');
  if (faltantes.length > 0) {
    return { ...base, valido: false, motivo: `Falta o es inválido: ${faltantes.join(', ')} (deben ser números mayores a 0)` };
  }

  return {
    ...base, valido: true, motivo: '',
    descripcion: String(valorPorPrefijo(raw, 'Descripción') ?? valorPorPrefijo(raw, 'Descripcion') ?? '').trim(),
    largo, ancho, alto, cantidadMaxima,
    peso: Number.isFinite(peso) ? peso : null,
  };
}

export function parsearFilasDimensiones(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  return rawRows.map((raw, i) => parsearFilaDimensiones(i + 2, raw));
}

/** Duplicado = mismo Código Articulo repetido dentro del MISMO archivo -- re-importar el mismo artículo en una subida futura es un upsert válido, no un duplicado. */
export function validarDimensiones(filasParsed) {
  const conteo = new Map();
  for (const f of filasParsed) {
    if (!f.valido) continue;
    conteo.set(f.articulo, (conteo.get(f.articulo) || 0) + 1);
  }

  const filas = filasParsed.map(f => {
    if (!f.valido) return f;
    if (conteo.get(f.articulo) > 1) {
      return { ...f, valido: false, motivo: `Artículo duplicado dentro del archivo ("${f.articulo}" aparece ${conteo.get(f.articulo)} veces)` };
    }
    return f;
  });

  return {
    filas,
    validas: filas.filter(f => f.valido),
    rechazadas: filas.filter(f => !f.valido),
  };
}
