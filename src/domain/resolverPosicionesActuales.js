/**
 * Resuelve, para cada artículo, su posición BASE (plan de fábrica,
 * `inventario_slotting`) y su posición ACTUAL (base + el último movimiento
 * válido registrado en `posiciones_actuales` o `escenario_posiciones|), como
 * dos conceptos SEPARADOS — nunca fusionados en un solo objeto "posición".
 *
 * Por qué separados: es la decisión de DECISIONES.md ADR-003. Tanto el mapa
 * legacy (aplicarPosicionGuardada sobre CUERPOS) como el reporteService
 * anterior ya trataban "base" y "overrides" como cosas distintas que se
 * combinan en tiempo de lectura — esta función centraliza ese cálculo (antes
 * duplicado, ver ADR-001) sin perder la distinción.
 *
 * Función pura: recibe los datos, no los busca. Cero imports de React, DOM
 * o Supabase -- movible a Web Worker/Edge Function sin reescritura (Ley 7
 * de MASTER-PROMPT.md).
 *
 * @param {Array<{articulo:string, pasillo:string, columna:number, nivel:?string, clase:?string, tipo:?string, picks?:number, consumo?:number, rack_actual?:string, niveles_a_armar?:number}>} base
 *   Filas de `inventario_slotting` (o el equivalente que se decida usar) -- la foto de fábrica.
 * @param {Array<{articulo:string, pasillo:string, columna:number, nivel:?string, clase:?string, tipo:?string}>} movimientos
 *   Filas de `posiciones_actuales` o `escenario_posiciones` -- overrides sobre la base.
 *   Si dos filas traen el mismo `articulo`, gana la ÚLTIMA que sea válida (tenga
 *   `pasillo` y `columna`) -- una fila sin destino se ignora, nunca "gana por accidente".
 * @param {Array<string|{articulo:string}>} [eliminados]
 *   Artículos "limpiados" (solo tiene efecto real dentro de una sala) -- su
 *   `posicionActual` queda en `null` explícitamente (no se los borra del
 *   resultado: seguir existiendo con posición actual nula es la forma
 *   explícita de decir "ya no está en ningún lado", no un silencio).
 * @param {Array<string|{articulo:string}>} [enBuffer]
 *   Artículos con una fila sin resolver en `migracion_buffer` (F2, ver
 *   ADR-015/DECISIONES.md) -- decisión explícita del usuario: un artículo en
 *   el buffer debe desaparecer de su rack en TODA la app (Dashboard,
 *   Reportes, el mapa fuera del flujo de migración), no solo dentro de la
 *   ficha de traslado. `posicionActual` queda en `null`, igual que
 *   "eliminado", pero se distingue con `enBuffer: true` -- son conceptos
 *   distintos (uno es un traslado en curso, el otro una limpieza real de
 *   una sala) y un consumidor futuro no debería confundirlos.
 * @returns {Array<{
 *   articulo: string,
 *   posicionBase: object|null,
 *   posicionActual: {pasillo:string, columna:number, nivel:?string, clase:?string, tipo:?string}|null,
 *   movido: boolean,
 *   sinBase: boolean,
 *   enBuffer: boolean,
 * }>}
 */
export function resolverPosicionesActuales(base, movimientos, eliminados = [], enBuffer = []) {
  const eliminadosSet = new Set(eliminados.map(e => (typeof e === 'string' ? e : e.articulo)));
  const enBufferSet = new Set(enBuffer.map(e => (typeof e === 'string' ? e : e.articulo)));

  const porArticulo = new Map();

  for (const b of base) {
    porArticulo.set(b.articulo, {
      articulo: b.articulo,
      posicionBase: b,
      posicionActual: { pasillo: b.pasillo, columna: b.columna, nivel: b.nivel, clase: b.clase, tipo: b.tipo },
      movido: false,
      sinBase: false,
      enBuffer: false,
    });
  }

  for (const m of movimientos) {
    if (m.pasillo == null || m.columna == null) continue; // movimiento sin destino: se ignora, no gana

    const existente = porArticulo.get(m.articulo);
    if (existente) {
      existente.posicionActual = {
        pasillo: m.pasillo,
        columna: m.columna,
        nivel: m.nivel,
        clase: m.clase ?? existente.posicionActual?.clase ?? null,
        tipo: m.tipo ?? existente.posicionActual?.tipo ?? null,
      };
      existente.movido = true;
    } else {
      // Caso explícito (Ley 2 -- nada silencioso): el movimiento referencia un
      // artículo que no está en la foto de fábrica. `posicionBase` queda en
      // null y `sinBase` en true a propósito, para que cualquier consumidor
      // pueda distinguir "sin posición base real" de "está en su posición
      // base" sin adivinar por qué faltan clase/tipo.
      porArticulo.set(m.articulo, {
        articulo: m.articulo,
        posicionBase: null,
        posicionActual: { pasillo: m.pasillo, columna: m.columna, nivel: m.nivel, clase: m.clase ?? null, tipo: m.tipo ?? null },
        movido: true,
        sinBase: true,
        enBuffer: false,
      });
    }
  }

  for (const articulo of eliminadosSet) {
    const existente = porArticulo.get(articulo);
    if (existente) existente.posicionActual = null;
  }

  for (const articulo of enBufferSet) {
    const existente = porArticulo.get(articulo);
    if (existente) {
      existente.posicionActual = null;
      existente.enBuffer = true;
    }
  }

  return [...porArticulo.values()];
}
