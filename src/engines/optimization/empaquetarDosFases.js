import { empaquetarArticulos, ORDEN_POR_VOLUMEN_DESC } from './empaquetarArticulos.js';
import { reservarZonaPrioritaria } from './reservarZonaPrioritaria.js';

/**
 * Motor de dos fases (corrección 2026-08-10 -- ver DECISIONES.md). La Fase 1
 * (reservarZonaPrioritaria.js) reserva la zona óptima/accesible SOLO para
 * sus beneficiarios reales, ANTES de que nada más compita por ese espacio.
 * La Fase 2 empaqueta todo lo demás (lo no reservado + lo que no le tocó
 * reserva) con FFD normal, sobre lo que quedó libre -- respetando lo que la
 * Fase 1 ya ocupó en los mismos huecos físicos (estadoInicial/cuerposExcluidos
 * de empaquetarArticulos.js), nunca empezando de cero encima.
 *
 * @returns {{asignaciones, sinAsignar, totalReservadosFase1, totalFase2}}
 */
export function empaquetarDosFases(articulos, cuerpos, opciones = {}) {
  const fase1 = reservarZonaPrioritaria(articulos, cuerpos, opciones);

  const volumenPorArticulo = new Map(articulos.map(a => [a.articulo, a.volumenM3]));
  const estadoInicial = new Map();
  const cuerposExcluidos = new Set();
  for (const a of fase1.asignaciones) {
    if (a.nivel === 'CUERPO') {
      cuerposExcluidos.add(`${a.pasillo}|${a.columna}`);
      continue;
    }
    const clave = `${a.pasillo}|${a.columna}|${a.nivel}`;
    const previo = estadoInicial.get(clave) ?? { volumenOcupado: 0, articulosDistintos: new Set() };
    previo.volumenOcupado += volumenPorArticulo.get(a.articulo) ?? 0;
    previo.articulosDistintos.add(a.articulo);
    estadoInicial.set(clave, previo);
  }

  const asignadosFase1 = new Set(fase1.asignaciones.map(a => a.articulo));
  const articulosFase2 = articulos.filter(a => !asignadosFase1.has(a.articulo));

  const resultadoFase2 = empaquetarArticulos(articulosFase2, cuerpos, {
    ...opciones,
    comparador: opciones.comparador ?? ORDEN_POR_VOLUMEN_DESC,
    estadoInicial,
    cuerposExcluidos,
  });

  return {
    asignaciones: [...fase1.asignaciones, ...resultadoFase2.asignaciones],
    sinAsignar: resultadoFase2.sinAsignar,
    totalReservadosFase1: fase1.asignaciones.length,
    totalFase2: resultadoFase2.asignaciones.length,
    umbralAltaFrecuencia: fase1.umbralAltaFrecuencia,
  };
}
