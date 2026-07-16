/**
 * Detecta destinos MZ "listos para colocar" -- acumularon suficientes
 * artículos en el buffer que ya matchean su propio plan de recolección
 * (migracion_movimientos) Y el slot de ese destino ya terminó su propio
 * vaciado (estado 'recolectando' en adelante).
 *
 * Rompe el ciclo de dependencias que describe el usuario (lo que sale de
 * un RCL lo necesita otro destino, y lo que ya había en ese otro lo ocupa
 * el siguiente): en vez de precomputar un orden fijo de todo el almacén,
 * esto se recalcula EN VIVO cada vez que el buffer cambia -- así sigue la
 * cadena real sin importar en qué orden los operadores vacíen posiciones.
 * También evita que el buffer se llene sin límite (mismo espíritu que el
 * umbral de migracion_purgas de ADR-015, aunque acá el criterio es
 * "listo para colocar", no "hay que purgar por acumulación vieja").
 *
 * Función pura, sin Supabase -- derivado, nunca persistido (Ley 3).
 *
 * @param {Array<{id, destinoMzPasillo, destinoMzColumna, articulo, cantidad}>} bufferConDestino
 *   Filas del buffer YA resueltas contra migracion_movimientos (ver MapaCanvas.jsx) --
 *   destinoMzPasillo/destinoMzColumna null si el artículo todavía no tiene destino asignado.
 * @param {Map<string, {estado}>} migracionSlots -- "pasillo|columna" -> slot, mismo Map que ya usa MapaCanvas.jsx.
 * @param {number} umbral -- cantidad mínima acumulada para disparar la alerta (default 8).
 * @returns {Array<{mzPasillo, mzColumna, cantidad, items}>}
 */
export const ESTADOS_LISTO_PARA_RECIBIR = ['recolectando', 'bloqueado', 'confirmado'];

export function detectarDestinosListos(bufferConDestino, migracionSlots, umbral = 8) {
  const porDestino = new Map();
  for (const b of bufferConDestino) {
    if (!b.destinoMzPasillo || b.destinoMzColumna == null) continue; // sin destino resuelto -- no participa
    const clave = `${b.destinoMzPasillo}|${b.destinoMzColumna}`;
    if (!porDestino.has(clave)) porDestino.set(clave, []);
    porDestino.get(clave).push(b);
  }

  const alertas = [];
  for (const [clave, items] of porDestino) {
    const slot = migracionSlots.get(clave);
    if (!slot || !ESTADOS_LISTO_PARA_RECIBIR.includes(slot.estado)) continue; // el destino todavía no terminó su propio vaciado -- nada que avisar todavía
    if (items.length < umbral) continue;
    const [mzPasillo, mzColumnaTexto] = clave.split('|');
    alertas.push({ mzPasillo, mzColumna: Number(mzColumnaTexto), cantidad: items.length, items });
  }
  return alertas.sort((a, b) => b.cantidad - a.cantidad); // el destino con más artículos esperando, primero
}
