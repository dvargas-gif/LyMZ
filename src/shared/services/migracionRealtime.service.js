import { supabase } from './supabaseClient.js';

/**
 * Canal único de "migración en vivo" (2026-08-26, pedido explícito de David:
 * "quiero un real time de los movimientos") -- mismo patrón `postgres_changes`
 * que ya usan mensajes.service.js/presencia.service.js/crearWarehouseModel.js,
 * aplicado a las tablas que arman el estado de una migración en curso.
 *
 * Un solo canal para las 4 tablas (no uno por tabla) -- más liviano del lado
 * del cliente, y el llamador ya decide qué le importa pasando o no cada
 * callback. Solo tiene sentido en el mapa real (ninguna de estas tablas tiene
 * escenario_id) -- el llamador decide cuándo suscribirse/desuscribirse.
 */
export const migracionRealtimeService = {
  suscribirCambios({ onMovimiento, onSlot, onBuffer, onAuditoria }) {
    let canal = supabase.channel('migracion-en-vivo');
    if (onMovimiento) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'migracion_movimientos' }, onMovimiento);
    if (onSlot) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'migracion_slots' }, onSlot);
    if (onBuffer) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'migracion_buffer' }, onBuffer);
    if (onAuditoria) canal = canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'migracion_auditoria' }, onAuditoria);
    canal.subscribe();
    return () => supabase.removeChannel(canal);
  },
};
