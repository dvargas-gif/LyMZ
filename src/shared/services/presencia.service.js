import { supabase } from './supabaseClient.js';

const CANAL_PRESENCIA = 'presencia-global';

/**
 * Presencia en tiempo real (sesión 2026-07-22) -- primer uso de Supabase
 * Realtime Presence en este proyecto (antes solo había `postgres_changes`,
 * ver crearWarehouseModel.js). Un solo canal global: cada pestaña logueada
 * se "trackea" a sí misma con su usuarioId como key, y el evento 'sync' le
 * da a todos los demás el estado completo de quién está conectado ahora.
 *
 * `onCambio` recibe un Map<usuarioId, {nombre, apodo, rol}> -- ya
 * "aplanado" desde el `presenceState()` crudo de Supabase (que agrupa por
 * key -> array de "tracks", uno por pestaña/dispositivo de esa persona;
 * acá solo importa SI está conectada, no cuántas pestañas tiene abiertas).
 *
 * Devuelve una función de limpieza que llama `removeChannel` (no alcanza
 * con `.unsubscribe()` -- en <React.StrictMode> (ver main.jsx) el efecto
 * que la usa se monta/desmonta/remonta, y sin removeChannel quedan canales
 * duplicados trackeando presencia fantasma).
 */
export function suscribirPresenciaGlobal(sesion, onCambio) {
  const canal = supabase.channel(CANAL_PRESENCIA, {
    config: { presence: { key: sesion.usuarioId } },
  });

  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState();
    const conectados = new Map();
    for (const [usuarioId, tracks] of Object.entries(estado)) {
      const t = tracks[0]; // una persona puede tener varias pestañas/tracks -- alcanza con la primera
      if (t) conectados.set(usuarioId, { nombre: t.nombre, apodo: t.apodo, rol: t.rol });
    }
    onCambio(conectados);
  });

  canal.subscribe(estado => {
    if (estado === 'SUBSCRIBED') {
      canal.track({ usuarioId: sesion.usuarioId, nombre: sesion.nombre, apodo: sesion.apodo, rol: sesion.rol });
    }
  });

  return () => supabase.removeChannel(canal);
}
