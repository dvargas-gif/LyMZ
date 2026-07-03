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
    if (!articulo || !pasillo || columnaRaw === undefined) continue; // fila incompleta, no sirve
    const columna = parseInt(columnaRaw, 10);
    if (!Number.isFinite(columna)) continue;
    filas.push({
      articulo,
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
 * cuando el Excel no los trae, y detecta conflictos de destino:
 * - Otro artículo (que NO está en este mismo Excel) ya ocupa ese lugar.
 * - Dos filas del propio Excel apuntan al mismo destino.
 * No hace falta que el destino esté "vacío" si el que lo ocupaba hoy
 * también se está reubicando en esta misma carga (se vacía antes de aplicar).
 */
export function validarCargaMasiva(filasDestino, estadoActual) {
  const porArticulo = new Map(estadoActual.map(a => [a.articulo, a]));
  const articulosEnLote = new Set(filasDestino.map(f => f.articulo));

  // Quién ocupa cada destino HOY, excluyendo a los artículos que también se están moviendo en este lote.
  const ocupadoPor = new Map();
  for (const a of estadoActual) {
    if (articulosEnLote.has(a.articulo)) continue;
    if (!a.pasillo || a.columna == null) continue;
    ocupadoPor.set(`${a.pasillo}|${a.columna}|${a.nivel || ''}`, a.articulo);
  }

  const destinosEnLote = new Map(); // key -> primer artículo que lo pidió
  const filas = filasDestino.map(f => {
    const actual = porArticulo.get(f.articulo);
    const nivel = f.nivel || actual?.nivel || (f.tipo === 'CUERPO' || actual?.tipo === 'CUERPO' ? 'CUERPO' : null);
    const clase = f.clase || actual?.clase || '-';
    const grupo = f.grupo || actual?.grupo || '-';
    const tipo = f.tipo || actual?.tipo || (nivel === 'CUERPO' ? 'CUERPO' : 'NORMAL');
    const fila = { ...f, nivel, clase, grupo, tipo };

    if (!nivel) return { ...fila, valido: false, motivo: 'Sin nivel destino (el artículo no tiene uno actual y el Excel no lo trae)' };

    const key = `${fila.pasillo}|${fila.columna}|${fila.nivel}`;
    if (destinosEnLote.has(key)) return { ...fila, valido: false, motivo: `Destino duplicado en el Excel (mismo lugar que ${destinosEnLote.get(key)})` };
    destinosEnLote.set(key, fila.articulo);

    const ocupante = ocupadoPor.get(key);
    if (ocupante) return { ...fila, valido: false, motivo: `Posición ocupada hoy por "${ocupante}" (no está en tu Excel)` };

    return { ...fila, valido: true, motivo: '' };
  });

  return {
    filas,
    aplicables: filas.filter(f => f.valido),
    conflictos: filas.filter(f => !f.valido),
  };
}
