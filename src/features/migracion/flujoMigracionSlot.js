/**
 * Máquina de estados del flujo guiado de migración por slot (F2) --
 * pendiente -> [esperando_aprobacion ->] vaciando -> recolectando ->
 * bloqueado -> confirmado. Funciones puras, sin Supabase (eso vive en
 * migracionSlots.service.js) -- mismo criterio que
 * identidadLegacy.service.js: la regla de negocio se puede testear sin red.
 *
 * Ausencia de fila en migracion_slots === estado 'pendiente' (no se
 * persiste ese estado inicial, ver migracionSlots.service.js.iniciar()) --
 * por eso `estadoSlot` puede venir `undefined`/`null`.
 *
 * `esperando_aprobacion` (F2, capacidad por equipo): un trigger de la base
 * fuerza este estado en vez de 'vaciando' cuando ya hay 1 o 2 equipos
 * activos (2 cuerpos = 10 niveles c/u, máximo 3 concurrentes) -- ver
 * 2026-07-17_migracion_cupo_aprobacion.sql. No es un paso más del flujo
 * guiado (no cuenta para pasoDelFlujo), es una espera ANTES del paso 1.
 */
export function puedeIniciarTraslado(estadoSlot) {
  return estadoSlot == null || estadoSlot === 'pendiente';
}

/** Mientras un slot espera que Supervisor/Administrador le habilite el cupo, no hay botón de acción del lado del operador -- solo el mensaje de espera. */
export function esperandoAprobacion(estadoSlot) {
  return estadoSlot === 'esperando_aprobacion';
}

/** Supervisor/Administrador -- ver src/features/auth/roles.js, mismo corte que puedeConfirmar. */
export function puedeAprobarCupo(estadoSlot) {
  return estadoSlot === 'esperando_aprobacion';
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

/** "Cancelar traslado" -- solo mientras el operador todavía tiene margen de deshacerlo (antes de bloqueado, que ya espera al supervisor). Incluye 'esperando_aprobacion': el propio equipo puede retirar su solicitud antes de que la aprueben. */
export function puedeCancelar(estadoSlot) {
  return estadoSlot === 'esperando_aprobacion' || estadoSlot === 'vaciando' || estadoSlot === 'recolectando';
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
