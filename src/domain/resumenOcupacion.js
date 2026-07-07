import { nArts, nivelesOcupados, consumoTotal, llenura, colorLlenura } from './formulasOcupacion.js';

/**
 * Agrega la ocupación de TODOS los racks del mezanine en un solo resumen --
 * el mapa nunca tuvo esta vista (solo celda por celda). Función pura: recibe
 * el Map de racks que ya produce WarehouseModel.racks(), no busca datos.
 */
export function calcularResumenOcupacion(racks, configuracionOcupacion, { topN = 5 } = {}) {
  const filas = [];

  for (const [clave, rack] of racks) {
    const proporcion = llenura(rack, configuracionOcupacion);
    const valoresNivelesAArmar = Object.values(rack.niveles).flat().map(a => a.nivelesAArmar ?? 0);
    const nivelesAArmar = valoresNivelesAArmar.length ? Math.max(...valoresNivelesAArmar) : 0;

    filas.push({
      clave,
      pasillo: rack.pasillo,
      columna: rack.columna,
      nArts: nArts(rack),
      nivelesOcupados: nivelesOcupados(rack),
      consumoTotal: consumoTotal(rack),
      llenura: proporcion,
      colorLlenura: colorLlenura(proporcion, configuracionOcupacion),
      nivelesAArmar,
    });
  }

  const u = configuracionOcupacion.umbralRack;
  const sobrecargados = filas.filter(f => f.llenura > u.sobrecargado);
  const enAlerta = filas.filter(f => f.llenura > u.alerta && f.llenura <= u.sobrecargado);
  const ok = filas.filter(f => f.llenura <= u.alerta);
  const llenuraPromedio = filas.length ? filas.reduce((s, f) => s + f.llenura, 0) / filas.length : 0;
  const conNivelesPendientes = filas.filter(f => f.nivelesAArmar > 0).sort((a, b) => b.nivelesAArmar - a.nivelesAArmar);
  const topMasLlenos = [...filas].sort((a, b) => b.llenura - a.llenura).slice(0, topN);

  return {
    totalRacks: filas.length,
    sobrecargados,
    enAlerta,
    ok,
    llenuraPromedio,
    conNivelesPendientes,
    topMasLlenos,
  };
}
