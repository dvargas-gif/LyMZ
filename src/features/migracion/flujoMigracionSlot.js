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

export function puedeConfirmar(estadoSlot) {
  return estadoSlot === 'bloqueado';
}

/** "Cancelar traslado" -- solo mientras el operador todavía tiene margen de deshacerlo (antes de bloqueado, que ya espera al supervisor). */
export function puedeCancelar(estadoSlot) {
  return estadoSlot === 'vaciando' || estadoSlot === 'recolectando';
}

const PASO_POR_ESTADO = { vaciando: 1, recolectando: 2, bloqueado: 3, confirmado: 4 };

/** Paso del flujo guiado (1-4) para mostrar "Paso X de 3" en la UI -- null si no hay traslado en curso todavía. */
export function pasoDelFlujo(estadoSlot) {
  return PASO_POR_ESTADO[estadoSlot] ?? null;
}
