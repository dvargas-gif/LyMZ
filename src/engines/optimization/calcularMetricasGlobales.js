import { CAPACIDAD_UTIL_NIVEL_M3, CAPACIDAD_UTIL_CUERPO_M3 } from './construirUniversoDeHuecos.js';
import { enRango, ZONA_ACCESIBLE_GENERAL, ZONA_OPTIMA_CLASE_A } from './calcularAfinidadZonas.js';

/**
 * Métricas ESTANDARIZADAS para comparar acomodos entre sí de forma justa
 * (pedido explícito 2026-08-10, propuesto originalmente por una segunda
 * opinión externa -- verificado y adoptado). Sin esto, comparar "V4 vs V5"
 * solo con densidad promedio simple esconde si en realidad se está
 * empeorando el cumplimiento real de zona a cambio de un número que se ve
 * mejor. Estas 4 métricas son las que de verdad le importan al negocio.
 */
export function calcularMetricasGlobales(asignaciones, articulos, opciones = {}) {
  const zonaOptima = opciones.zonas?.optimaClaseA ?? ZONA_OPTIMA_CLASE_A;
  const zonaAccesible = opciones.zonas?.accesibleGeneral ?? ZONA_ACCESIBLE_GENERAL;
  const umbralAltaFrecuencia = opciones.umbralAltaFrecuencia ?? 0;

  const volumenPorArticulo = new Map(articulos.map(a => [a.articulo, a.volumenM3]));
  const infoPorArticulo = new Map(articulos.map(a => [a.articulo, a]));

  const bins = new Map(); // clave -> {tipo, pasillo, columna, nivel, volumen, distintos:Set}
  for (const a of asignaciones) {
    const clave = `${a.pasillo}|${a.columna}|${a.nivel}`;
    if (!bins.has(clave)) bins.set(clave, { pasillo: a.pasillo, columna: a.columna, nivel: a.nivel, volumen: 0, distintos: new Set() });
    const bin = bins.get(clave);
    bin.volumen += volumenPorArticulo.get(a.articulo) ?? 0;
    bin.distintos.add(a.articulo);
  }

  let volumenTotalAsignado = 0;
  let capacidadTotalUsada = 0;
  let nivelesConUnSolo = 0;
  let nivelesUsados = 0;
  for (const bin of bins.values()) {
    volumenTotalAsignado += bin.volumen;
    capacidadTotalUsada += bin.nivel === 'CUERPO' ? CAPACIDAD_UTIL_CUERPO_M3 : CAPACIDAD_UTIL_NIVEL_M3;
    if (bin.nivel !== 'CUERPO') {
      nivelesUsados++;
      if (bin.distintos.size === 1) nivelesConUnSolo++;
    }
  }

  const totalClaseA = articulos.filter(a => a.clase === 'A').length;
  const asignadosClaseAEnOptima = asignaciones.filter(a => {
    const info = infoPorArticulo.get(a.articulo);
    return info?.clase === 'A' && enRango(a, zonaOptima);
  }).length;

  const totalAltaFrecuencia = articulos.filter(a => (a.picksNormalizado ?? 0) >= umbralAltaFrecuencia).length;
  const asignadosAltaFrecuenciaEnAccesible = asignaciones.filter(a => {
    const info = infoPorArticulo.get(a.articulo);
    if (!info || (info.picksNormalizado ?? 0) < umbralAltaFrecuencia) return false;
    return enRango(a, zonaOptima) || enRango(a, zonaAccesible);
  }).length;

  return {
    densidadPonderada: capacidadTotalUsada > 0 ? volumenTotalAsignado / capacidadTotalUsada : 0,
    tasaClaseAEnOptima: totalClaseA > 0 ? asignadosClaseAEnOptima / totalClaseA : null,
    tasaAltaFrecuenciaEnAccesible: totalAltaFrecuencia > 0 ? asignadosAltaFrecuenciaEnAccesible / totalAltaFrecuencia : null,
    fragmentacion: nivelesUsados > 0 ? nivelesConUnSolo / nivelesUsados : 0,
    nivelesUsados,
    cuerposUsadosComoCuerpo: [...bins.values()].filter(b => b.nivel === 'CUERPO').length,
  };
}
