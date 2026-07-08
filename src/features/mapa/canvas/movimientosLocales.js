/**
 * Aplica un lote de movimientos al Map de racks EN MEMORIA -- mismo
 * criterio que el mapa legacy mutando CUERPOS directamente (ver
 * confirmar()/soltarCuerpoEn() en 08-interacciones.js), pero de forma
 * inmutable: devuelve un Map nuevo, nunca muta el que recibe.
 *
 * Mover 1 artículo y mover un cuerpo completo son la MISMA operación
 * (sacar un artículo de un nivel, ponerlo en otro) aplicada 1 o N veces --
 * deshacer también es esto mismo, solo que con origen/destino invertidos
 * (ver invertirLote). Un solo camino para las 3 acciones, no una función
 * por cada una.
 */
export function aplicarMovimientosLocales(racksBase, movimientos) {
  const copia = new Map(racksBase);
  const yaClonados = new Map(); // evita clonar el mismo rack 2 veces dentro del mismo lote (ej. cuerpo completo con varios artículos yendo al mismo destino)

  function rackClonado(pasillo, columna) {
    const clave = `${pasillo}|${columna}`;
    if (yaClonados.has(clave)) return yaClonados.get(clave);
    const original = copia.get(clave);
    const rack = original ? { pasillo, columna, niveles: { ...original.niveles } } : { pasillo, columna, niveles: {} };
    yaClonados.set(clave, rack);
    copia.set(clave, rack);
    return rack;
  }

  for (const mov of movimientos) {
    const claveOrigen = `${mov.origen.pasillo}|${mov.origen.columna}`;
    const rackOrigen = rackClonado(mov.origen.pasillo, mov.origen.columna);
    const nivelOrigen = rackOrigen.niveles[mov.origen.nivel] || [];
    const idx = nivelOrigen.findIndex(a => a.articulo === mov.articulo);
    // Si el artículo ya no está donde el lote dice (estado se desincronizó, ej. otro cambio en el medio) se reconstruye con lo mínimo -- explícito, no se cae silenciosamente.
    const articuloObj = idx >= 0 ? nivelOrigen[idx] : { articulo: mov.articulo, clase: mov.clase ?? null, tipo: mov.tipo ?? null, consumo: 0, picks: null, rackActual: null, nivelesAArmar: null };

    if (idx >= 0) {
      const restante = nivelOrigen.slice(0, idx).concat(nivelOrigen.slice(idx + 1));
      rackOrigen.niveles = { ...rackOrigen.niveles };
      if (restante.length) rackOrigen.niveles[mov.origen.nivel] = restante;
      else delete rackOrigen.niveles[mov.origen.nivel];
    }
    if (Object.keys(rackOrigen.niveles).length === 0) copia.delete(claveOrigen);

    const rackDestino = rackClonado(mov.destino.pasillo, mov.destino.columna);
    rackDestino.niveles = { ...rackDestino.niveles, [mov.destino.nivel]: [...(rackDestino.niveles[mov.destino.nivel] || []), articuloObj] };
  }

  return copia;
}

/** Invierte un lote de `cambios` (ver MapaCanvas.jsx) -- destino y origen se intercambian, listo para pasárselo tal cual a aplicarMovimientosLocales() al deshacer. */
export function invertirLote(lote) {
  return lote.map(c => ({ articulo: c.articulo, origen: c.destino, destino: c.origen, clase: c.clase, tipo: c.tipo }));
}
