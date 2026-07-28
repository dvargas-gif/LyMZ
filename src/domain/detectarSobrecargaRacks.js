/**
 * Fase 1 de verificación de espacios (2026-07-27, pedido explícito) --
 * contraparte de reglasAsignacionCuerpo.js: en vez de detectar CUERPOS con
 * un solo artículo que podrían tener MENOS niveles (subutilización), esto
 * detecta huecos reales (un cuerpo entero, o un nivel individual) donde el
 * volumen de TODO lo asignado ahí SUPERA la capacidad física real -- el
 * riesgo real que puede haber en un rack sobrecargado.
 *
 * A diferencia de reglasAsignacionCuerpo.js (que descarta cuerpos con más
 * de un artículo -- esa regla es específicamente "un solo artículo"), acá
 * el caso que importa es justo ese: varios artículos compartiendo el mismo
 * hueco. `inventario_slotting` no tiene columna de cantidad -- cada fila es
 * un artículo asignado a un pasillo+columna+nivel (o +CUERPO), y
 * articulo_dimensiones.volumen_m3 ya viene multiplicado por
 * cantidad_maxima (ver 2026-07-21_articulo_dimensiones.sql) -- sumar
 * volumenM3 de las filas de un mismo hueco alcanza, sin multiplicar nada
 * más.
 *
 * Dos tipos de hueco, cada uno con su propia capacidad real:
 * - tipo 'CUERPO': el cuerpo entero (5 niveles) es un solo hueco --
 *   capacidad VOLUMEN_CUERPO_REFERENCIA_M3 (2,16 m³). Varias filas con el
 *   mismo pasillo+columna+tipo:'CUERPO' comparten ese mismo hueco.
 * - cualquier otro tipo ('NORMAL'): cada nivel real (N01..N05) es su
 *   propio hueco -- capacidad VOLUMEN_NIVEL_REFERENCIA_M3 (0,432 m³).
 *   Varias filas con el mismo pasillo+columna+nivel comparten ESE hueco
 *   (no el cuerpo entero).
 *
 * Función pura, sin Supabase -- SOLO detecta y reporta, no cambia ni borra
 * nada de inventario_slotting (mismo espíritu que reglasAsignacionCuerpo.js
 * y "Revisar artículos exiliados en el acomodo MZ").
 */
import { VOLUMEN_NIVEL_REFERENCIA_M3, VOLUMEN_CUERPO_REFERENCIA_M3 } from './reglasAsignacionCuerpo.js';

function claveHueco(fila) {
  return fila.tipo === 'CUERPO' ? `${fila.pasillo}|${fila.columna}|CUERPO` : `${fila.pasillo}|${fila.columna}|${fila.nivel}`;
}

function capacidadDe(fila) {
  return fila.tipo === 'CUERPO' ? VOLUMEN_CUERPO_REFERENCIA_M3 : VOLUMEN_NIVEL_REFERENCIA_M3;
}

/**
 * @param {Array<{articulo, pasillo, columna, nivel, tipo}>} inventarioSlotting -- inventarioService.listar()
 * @param {Array<{articulo, volumenM3}>} dimensiones -- articuloDimensionesService.listar()
 * @returns {Array<{pasillo, columna, nivel, articulos, volumenTotal, capacidad, porcentaje}>}
 *   Solo incluye huecos donde el volumen asignado SUPERA la capacidad real.
 *   `nivel` es 'CUERPO' para un cuerpo entero, o el nivel real (ej. 'N01')
 *   para un hueco individual. Ordenado de más a menos sobrecargado.
 */
export function detectarSobrecarga(inventarioSlotting, dimensiones) {
  const volumenPorArticulo = new Map(dimensiones.map(d => [d.articulo, d.volumenM3]));

  const huecos = new Map(); // clave -> { pasillo, columna, nivel, capacidad, articulos: [{articulo, volumen}] }
  for (const fila of inventarioSlotting) {
    const volumen = volumenPorArticulo.get(fila.articulo);
    if (volumen == null) continue; // sin dimensiones importadas -- no se puede evaluar, no se asume nada

    const clave = claveHueco(fila);
    if (!huecos.has(clave)) {
      huecos.set(clave, {
        pasillo: fila.pasillo, columna: fila.columna,
        nivel: fila.tipo === 'CUERPO' ? 'CUERPO' : fila.nivel,
        capacidad: capacidadDe(fila), articulos: [],
      });
    }
    huecos.get(clave).articulos.push({ articulo: fila.articulo, volumen });
  }

  const resultado = [];
  for (const hueco of huecos.values()) {
    const volumenTotal = hueco.articulos.reduce((suma, a) => suma + a.volumen, 0);
    if (volumenTotal <= hueco.capacidad) continue; // dentro de capacidad, nada que reportar
    resultado.push({
      pasillo: hueco.pasillo, columna: hueco.columna, nivel: hueco.nivel,
      articulos: hueco.articulos.map(a => a.articulo),
      volumenTotal, capacidad: hueco.capacidad,
      porcentaje: volumenTotal / hueco.capacidad,
    });
  }
  return resultado.sort((a, b) => b.porcentaje - a.porcentaje);
}
