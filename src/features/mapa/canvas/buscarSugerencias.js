/**
 * Sugerencias de búsqueda del mapa (2026-08-24, pedido explícito: "que
 * pueda buscar por RCL, por MZ, y que sea con sugerencias") -- función
 * pura, sin React/Konva, para poder testearla sin montar el Canvas.
 *
 * Busca en TRES campos a la vez, sobre lo que hoy se ve en pantalla
 * (`racksVisibles` -- respeta el toggle MZ/RCL activo):
 *   - artículo (código exacto o parcial)
 *   - RCL (`rackActual`, la identidad vieja de cada artículo)
 *   - MZ (pasillo, o "pasillo-Ccolumna")
 *
 * Nunca "salta" directo a un resultado -- devuelve una lista para que el
 * usuario elija, incluso si hay un solo match (consistente, sin un caso
 * especial "si hay uno solo, saltar solo").
 */
export function buscarSugerencias(query, celdas, racksVisibles, limite = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const sugerencias = [];
  const vistos = new Set();

  function agregar(item) {
    if (vistos.has(item.clave)) return;
    vistos.add(item.clave);
    sugerencias.push(item);
  }

  for (const celda of celdas) {
    if (sugerencias.length >= limite) break;
    const claveCelda = `${celda.pasillo}|${celda.columna}`;
    const mzTexto = `${celda.pasillo}-C${String(celda.columna).padStart(3, '0')}`;

    if (mzTexto.toLowerCase().includes(q)) {
      agregar({ clave: `mz|${claveCelda}`, tipo: 'mz', etiqueta: mzTexto, pasillo: celda.pasillo, columna: celda.columna, nivel: null });
    }

    const rack = racksVisibles.get(claveCelda);
    if (!rack) continue;

    for (const nivel in rack.niveles) {
      for (const a of rack.niveles[nivel]) {
        if (sugerencias.length >= limite) break;
        if (a.articulo && a.articulo.toLowerCase().includes(q)) {
          agregar({ clave: `articulo|${a.articulo}|${claveCelda}`, tipo: 'articulo', etiqueta: `${a.articulo} → ${mzTexto}`, pasillo: celda.pasillo, columna: celda.columna, nivel, articulo: a.articulo });
        }
        if (a.rackActual && a.rackActual.toLowerCase().includes(q)) {
          agregar({ clave: `rcl|${a.rackActual}|${claveCelda}`, tipo: 'rcl', etiqueta: `${a.rackActual} → ${mzTexto}`, pasillo: celda.pasillo, columna: celda.columna, nivel, articulo: a.articulo });
        }
      }
    }
  }

  return sugerencias;
}
