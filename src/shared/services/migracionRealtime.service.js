import { supabase } from './supabaseClient.js';

/**
 * Canal único de "migración en vivo" (2026-08-26, pedido explícito de David:
 * "quiero un real time de los movimientos") -- mismo patrón `postgres_changes`
 * que ya usan mensajes.service.js/presencia.service.js/crearWarehouseModel.js,
 * aplicado a las tablas que arman el estado de una migración en curso.
 *
 * 2026-08-28, pedido explícito de David: "no quiero tener que recargar
 * pantallas... toda información correlacionada la quiero funcional y real
 * time" -- hasta acá solo el Mapa escuchaba este canal; Panel de Migración y
 * Órdenes de Ejecución (Panel de Despacho) cargaban una sola vez al abrir.
 * Se agrega `onDespacho` (despacho_lotes + despacho_tareas) para que Órdenes
 * de Ejecución también viva en tiempo real, sin tocar nada de lo que ya
 * funcionaba para el Mapa.
 *
 * `nombre` -- cada componente que se suscribe pasa el suyo (ej. 'mapa',
 * 'despacho', 'panel-migracion') para que cada uno tenga su propio canal
 * (topic) real -- si dos componentes montados a la vez pidieran el mismo
 * nombre de canal, la librería de Supabase Realtime puede pisarse entre
 * suscripciones que comparten topic.
 *
 * Un solo canal por componente para las tablas que le importan (no uno por
 * tabla) -- más liviano del lado del cliente, y el llamador ya decide qué le
 * importa pasando o no cada callback. Ninguna de estas tablas tiene
 * escenario_id -- solo tiene sentido en las vistas del mapa/operación real.
 */
export const migracionRealtimeService = {
  suscribirCambios({ onMovimiento, onSlot, onBuffer, onAuditoria, onDespacho, nombre }) {
    let canal = supabase.channel(`migracion-en-vivo${nombre ? `-${nombre}` : ''}`);
    if (onMovimiento) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'migracion_movimientos' }, onMovimiento);
    if (onSlot) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'migracion_slots' }, onSlot);
    if (onBuffer) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'migracion_buffer' }, onBuffer);
    if (onAuditoria) canal = canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'migracion_auditoria' }, onAuditoria);
    if (onDespacho) {
      canal = canal
        .on('postgres_changes', { event: '*', schema: 'public', table: 'despacho_lotes' }, onDespacho)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'despacho_tareas' }, onDespacho);
    }
    canal.subscribe();
    return () => supabase.removeChannel(canal);
  },
};
