/**
 * Carga masiva de posiciones (ej. "tengo un Excel con las ubicaciones que
 * quiero, aplicámelo de una"). Funciones puras de normalizar/validar +
 * un método de aplicar que reusa guardarLote() de los servicios de
 * posiciones reales o de sala — nunca duplica esa lógica de guardado.
 */
const PALABRAS_CLAVE = {
  articulo: ['articulo', 'codigo', 'sku', 'material', 'item'],
  pasillo: ['pasillo', 'mz', 'zona'],
  columna: ['columna', 'col'],
  nivel: ['nivel', 'niv'],
  clase: ['clase'],
  grupo: ['grupo'],
  tipo: ['tipo'],
};

function normalizarClave(k) {
  return String(k).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/** Único lugar que decide cómo se compara un código de artículo — Excel y base
 * SIEMPRE pasan por acá antes de compararse, para que "sku001" y "SKU001"
 * sean el mismo artículo en todos los casos (carga masiva Y edición en vivo). */
export function normalizarArticulo(articulo) {
  return String(articulo || '').trim().toUpperCase();
}

/** Convierte filas crudas (Excel/CSV/pegado) a la forma canónica {articulo,pasillo,columna,nivel,clase,grupo,tipo}. */
export function normalizarFilasDestino(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  const filas = [];
  for (const raw of rawRows) {
    const porClave = {};
    for (const k of Object.keys(raw)) porClave[normalizarClave(k)] = raw[k];
    const claves = Object.keys(porClave);
    const buscar = campo => {
      const clave = claves.find(c => PALABRAS_CLAVE[campo].some(kw => c.includes(kw)));
      const valor = clave !== undefined ? porClave[clave] : undefined;
      return valor !== undefined && valor !== '' ? String(valor).trim() : undefined;
    };
    const articulo = buscar('articulo');
    const pasillo = buscar('pasillo');
    const columnaRaw = buscar('columna');
    if (!articulo || !pasillo || columnaRaw === undefined) continue; // fila incompleta (sin código/pasillo/columna) — no hay nada que validar
    // OJO: antes acá se descartaba la fila en silencio si la columna no era
    // un número. Ahora se deja pasar (aunque sea inválida) para que
    // validarCargaMasiva la rechace con un motivo visible — el usuario tiene
    // que VER que esa fila de su Excel no se va a aplicar, y por qué.
    const columna = parseInt(columnaRaw, 10);
    filas.push({
      articulo: normalizarArticulo(articulo),
      pasillo: pasillo.toUpperCase(),
      columna,
      nivel: buscar('nivel')?.toUpperCase(),
      clase: buscar('clase')?.toUpperCase(),
      grupo: buscar('grupo'),
      tipo: buscar('tipo')?.toUpperCase(),
    });
  }
  return filas;
}

/**
 * Valida cada fila deseada contra el estado ACTUAL (real o de una sala,
 * ya resuelto por reporteService.obtener — mismo merge base+overrides de
 * siempre). Completa clase/grupo/tipo desde el estado actual del artículo
 * cuando el Excel no los trae, y detecta:
 * - Columna inválida (0, negativa, vacía o no numérica).
 * - El MISMO artículo repetido en el lote con destinos DISTINTOS → error
 *   crítico, ninguna fila de ese artículo se aplica (no hay forma de saber
 *   cuál de los dos destinos es el correcto).
 * - El mismo artículo repetido con el MISMO destino → no es un conflicto,
 *   es una fila de más; se aplica una sola vez y se avisa como duplicado.
 * - Dos artículos DISTINTOS pidiendo el mismo destino → conflicto (ya existía).
 * - Otro artículo (que NO está en este mismo Excel) ya ocupa ese lugar (ya existía).
 * Todas las comparaciones de artículo pasan por normalizarArticulo(), así
 * que "sku001" en el Excel y "SKU001" en la base son el mismo artículo.
 */
export function validarCargaMasiva(filasDestino, estadoActual) {
  const claveDestino = f => `${f.pasillo}|${f.columna}|${f.nivel || ''}`;

  // Todo el lote se normaliza UNA vez acá — así da igual si las filas ya
  // vinieron normalizadas (desde normalizarFilasDestino) o crudas (desde
  // EdicionEnVivoTabla, que arma la fila a mano).
  const filasNorm = filasDestino.map(f => ({ ...f, articulo: normalizarArticulo(f.articulo) }));

  const porArticulo = new Map(estadoActual.map(a => [normalizarArticulo(a.articulo), a]));

  // Agrupar el lote por artículo para poder distinguir "mismo destino repetido"
  // (inofensivo) de "destinos distintos para el mismo artículo" (crítico).
  const porArticuloEnLote = new Map();
  for (const f of filasNorm) {
    if (!porArticuloEnLote.has(f.articulo)) porArticuloEnLote.set(f.articulo, []);
    porArticuloEnLote.get(f.articulo).push(f);
  }
  const articulosConDestinosDistintos = new Set();
  for (const [articulo, filasDeEseArticulo] of porArticuloEnLote) {
    const destinosUnicos = new Set(filasDeEseArticulo.map(claveDestino));
    if (destinosUnicos.size > 1) articulosConDestinosDistintos.add(articulo);
  }

  // Quién ocupa cada destino HOY, excluyendo a los artículos que también se están moviendo en este lote.
  const articulosEnLote = new Set(porArticuloEnLote.keys());
  const ocupadoPor = new Map();
  for (const a of estadoActual) {
    const articulo = normalizarArticulo(a.articulo);
    if (articulosEnLote.has(articulo)) continue;
    if (!a.pasillo || a.columna == null) continue;
    ocupadoPor.set(`${a.pasillo}|${a.columna}|${a.nivel || ''}`, articulo);
  }

  const destinosVistos = new Map(); // destino -> artículo que lo pidió primero (dos artículos distintos, incompatibles)
  const filasVistasPorArticulo = new Set(); // "ARTICULO__destino" -> ya se vio esta combinación exacta (duplicado inofensivo)

  const filas = filasNorm.map(f => {
    const actual = porArticulo.get(f.articulo);
    const nivel = f.nivel || actual?.nivel || (f.tipo === 'CUERPO' || actual?.tipo === 'CUERPO' ? 'CUERPO' : null);
    const clase = f.clase || actual?.clase || '-';
    const grupo = f.grupo || actual?.grupo || '-';
    const tipo = f.tipo || actual?.tipo || (nivel === 'CUERPO' ? 'CUERPO' : 'NORMAL');
    const fila = { ...f, nivel, clase, grupo, tipo };

    if (!Number.isFinite(f.columna) || f.columna < 1) {
      return { ...fila, valido: false, motivo: `Columna inválida ("${f.columna}") — tiene que ser un número mayor o igual a 1` };
    }

    if (articulosConDestinosDistintos.has(f.articulo)) {
      return { ...fila, valido: false, motivo: `"${f.articulo}" aparece más de una vez en el archivo con destinos distintos — corregí el archivo antes de aplicar` };
    }

    if (!nivel) return { ...fila, valido: false, motivo: 'Sin nivel destino (el artículo no tiene uno actual y el archivo no lo trae)' };

    const key = claveDestino(fila);
    const claveFilaPorArticulo = `${f.articulo}__${key}`;
    if (filasVistasPorArticulo.has(claveFilaPorArticulo)) {
      return { ...fila, valido: true, duplicado: true, motivo: 'Fila duplicada (mismo artículo, mismo destino) — se aplica una sola vez' };
    }
    filasVistasPorArticulo.add(claveFilaPorArticulo);

    if (destinosVistos.has(key)) return { ...fila, valido: false, motivo: `Destino duplicado en el archivo (mismo lugar que "${destinosVistos.get(key)}")` };
    destinosVistos.set(key, f.articulo);

    const ocupante = ocupadoPor.get(key);
    if (ocupante) return { ...fila, valido: false, motivo: `Posición ocupada hoy por "${ocupante}" (no está en tu archivo)` };

    return { ...fila, valido: true, motivo: '' };
  });

  return {
    filas,
    aplicables: filas.filter(f => f.valido && !f.duplicado),
    conflictos: filas.filter(f => !f.valido),
    duplicados: filas.filter(f => f.duplicado),
  };
}
