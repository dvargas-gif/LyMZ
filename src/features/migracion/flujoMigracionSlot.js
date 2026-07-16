/**
 * Máquina de estados del flujo guiado de migración por slot (F2) --
 * pendiente -> vaciando -> recolectando -> bloqueado -> confirmado.
 * Funciones puras, sin Supabase (eso vive en migracionSlots.service.js) --
 * mismo criterio que identidadLegacy.service.js: la regla de negocio se
 * puede testear sin red.
 *
 * Ausencia de fila en migracion_slots === estado 'pendiente' (no se
 * persiste ese estado inicial, ver migracionSlots.service.js.iniciar()) --
 * por eso `estadoSlot` puede venir `undefined`/`null`.
 */
export function puedeIniciarTraslado(estadoSlot) {
  return estadoSlot == null || estadoSlot === 'pendiente';
}

export function puedeDepositarEnBuffer(estadoSlot) {
  return estadoSlot === 'vaciando';
}

export function puedeMarcarListo(estadoSlot) {
  return estadoSlot === 'recolectando';
}

/**
 * Todo lo planificado para este destino ya fue recolectado -- ninguno
 * queda 'pendiente'. Antes "Marcar listo" solo miraba el ESTADO del slot
 * (puedeMarcarListo), nunca si de verdad ya se trajeron los artículos --
 * un operador podía bloquear el slot con 0 de 8 recolectados y el
 * supervisor confirmaba sin enterarse de que quedó stock real sin traer
 * del origen RCL. Vacío (sin plan generado todavía para este destino)
 * pasa por default -- eso no es "faltan por recolectar", es "no hay nada
 * planificado que recolectar acá".
 */
export function todoRecolectado(movimientosPendientes = []) {
  return movimientosPendientes.every(m => m.estado === 'recolectado');
}

export function puedeConfirmar(estadoSlot) {
  return estadoSlot === 'bloqueado';
}

/** "Cancelar traslado" -- solo mientras el operador todavía tiene margen de deshacerlo (antes de bloqueado, que ya espera al supervisor). */
export function puedeCancelar(estadoSlot) {
  return estadoSlot === 'vaciando' || estadoSlot === 'recolectando';
}

/** "Devolver" un artículo puntual del buffer (deshacer SOLO ese depósito, ver eliminarUno) -- mismo margen que Cancelar traslado: antes de bloqueado, que ya espera al supervisor. */
export function puedeDevolverDelBuffer(estadoSlot) {
  return estadoSlot === 'vaciando' || estadoSlot === 'recolectando';
}

const PASO_POR_ESTADO = { vaciando: 1, recolectando: 2, bloqueado: 3, confirmado: 4 };

/** Paso del flujo guiado (1-4) para mostrar "Paso X de 3" en la UI -- null si no hay traslado en curso todavía. */
export function pasoDelFlujo(estadoSlot) {
  return PASO_POR_ESTADO[estadoSlot] ?? null;
}
