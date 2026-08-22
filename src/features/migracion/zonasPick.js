/**
 * Import de máximos/mínimos de pick por artículo (sesión 2026-08-22) --
 * funciones puras (parseo + validación), mismo criterio que
 * articuloDimensiones.js: nada de Supabase acá, eso vive en
 * src/shared/services/zonasPick.service.js.
 *
 * Nombres de columna tolerantes a espacios/mayúsculas/tildes -- mismo
 * criterio que articuloDimensiones.js (la columna de cantidad ya cambió de
 * nombre una vez en la práctica ahí, acá se previene desde el principio).
 */
/** `Number('')` da `0` -- una celda vacía no es un cero real, se rechaza explícitamente antes de convertir. */
function numeroNoNegativo(valor) {
  if (valor === '' || valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function sinTildes(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Columna de artículo -- probada en orden de más a menos específica.
 * "Id Artículo" es el nombre real del archivo de zonas de pick (2026-08-22);
 * "Código Articulo"/"Articulo" son los que ya usan otros imports de la
 * migración (identidadLegacy.js/articuloDimensiones.js) -- se aceptan los
 * tres para no romper si el nombre vuelve a variar. Comparación sin tildes
 * (mismo criterio que valorCantidadPorPrefijo) -- "Artículo" y "Articulo"
 * tienen que matchear igual.
 */
const PREFIJOS_ARTICULO = ['ID ARTICULO', 'CODIGO ARTICULO', 'ARTICULO'];

function valorArticulo(raw) {
  for (const prefijo of PREFIJOS_ARTICULO) {
    const clave = Object.keys(raw).find(k => sinTildes(k.trim().toUpperCase()).startsWith(prefijo));
    if (clave !== undefined) return raw[clave];
  }
  return undefined;
}

/**
 * Busca la columna de cantidad por un prefijo específico ("CANTIDAD MIN"/
 * "CANTIDAD MAX") -- si hay más de una columna que matchee, nunca adivina
 * cuál usar (mismo criterio que valorCantidadMaxima() de
 * articuloDimensiones.js): devuelve ambiguo=true y la fila se rechaza con
 * un motivo claro.
 */
function valorCantidadPorPrefijo(raw, prefijoSinTildes) {
  const claves = Object.keys(raw).filter(k => sinTildes(k.trim().toUpperCase()).startsWith(prefijoSinTildes));
  if (claves.length === 1) return { valor: raw[claves[0]], ambiguo: false };
  if (claves.length > 1) return { valor: undefined, ambiguo: true };
  return { valor: undefined, ambiguo: false };
}

/**
 * @param {number} fila -- número de fila tal como lo vería el usuario en Excel (fila 2 = primera fila de datos).
 * @param {object} raw -- fila cruda del sheet.
 */
export function parsearFilaZonaPick(fila, raw) {
  const articulo = String(valorArticulo(raw) ?? '').trim();
  const base = { fila, articulo };

  if (!articulo) {
    return { ...base, valido: false, motivo: 'Celda vacía (falta la columna Id Artículo/Código Articulo)' };
  }

  const { valor: valorMinimo, ambiguo: minimoAmbiguo } = valorCantidadPorPrefijo(raw, 'CANTIDAD MIN');
  const { valor: valorMaximo, ambiguo: maximoAmbiguo } = valorCantidadPorPrefijo(raw, 'CANTIDAD MAX');

  if (minimoAmbiguo || maximoAmbiguo) {
    return { ...base, valido: false, motivo: 'Hay más de una columna "Cantidad Min..."/"Cantidad Max..." y no está claro cuál usar -- renombrá esa columna en el archivo.' };
  }

  const cantidadMinima = numeroNoNegativo(valorMinimo);
  const cantidadMaxima = numeroNoNegativo(valorMaximo);

  const faltantes = [];
  if (cantidadMinima == null) faltantes.push('Cantidad Mínima');
  if (cantidadMaxima == null) faltantes.push('Cantidad Máxima');
  if (faltantes.length > 0) {
    return { ...base, valido: false, motivo: `Falta o es inválido: ${faltantes.join(', ')} (deben ser números, 0 o mayores)` };
  }

  if (cantidadMaxima <= cantidadMinima) {
    return { ...base, valido: false, motivo: `La Cantidad Máxima (${cantidadMaxima}) debe ser mayor que la Cantidad Mínima (${cantidadMinima})` };
  }

  return { ...base, valido: true, motivo: '', cantidadMinima, cantidadMaxima };
}

export function parsearFilasZonaPick(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  return rawRows.map((raw, i) => parsearFilaZonaPick(i + 2, raw));
}

/** Duplicado = mismo Código Articulo repetido dentro del MISMO archivo -- re-importar el mismo artículo en una subida futura es un upsert válido, no un duplicado. */
export function validarZonasPick(filasParsed) {
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
