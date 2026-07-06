/**
 * Agrupa el resultado de resolverPosicionesActuales() por rack (pasillo+columna),
 * reconstruyendo la forma {niveles: {nivelKey: [articulo,...]}} que necesitan
 * las fórmulas de formulasOcupacion.js -- la misma forma que tenía `cu` en
 * CUERPOS (mapa legacy), pero calculada desde POSICIÓN ACTUAL, no desde un
 * objeto mutado en el tiempo.
 *
 * Función pura. Artículos sin posicionActual (eliminados) no aparecen en
 * ningún rack -- ya no están en ningún lado, igual que en CUERPOS cuando se
 * hace `delete CUERPOS[key]`.
 */
export function agruparPorRack(posicionesResueltas) {
  const racks = new Map();

  for (const r of posicionesResueltas) {
    if (!r.posicionActual) continue; // eliminado -- no ocupa ningún rack

    const { pasillo, columna, nivel, clase, tipo } = r.posicionActual;
    const key = `${pasillo}|${columna}`;

    if (!racks.has(key)) {
      racks.set(key, { pasillo, columna, niveles: {} });
    }
    const rack = racks.get(key);
    if (!rack.niveles[nivel]) rack.niveles[nivel] = [];

    rack.niveles[nivel].push({
      articulo: r.articulo,
      consumo: r.posicionBase?.consumo ?? 0,
      picks: r.posicionBase?.picks ?? null,
      rackActual: r.posicionBase?.rack_actual ?? null,
      clase,
      tipo,
    });
  }

  return racks;
}
