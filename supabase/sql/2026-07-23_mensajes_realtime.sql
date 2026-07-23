-- =====================================================================
-- La mensajería (2026-07-22_mensajeria_presencia.sql) usa Postgres Changes
-- para "mensaje entrante" (mensajes.service.js:suscribirMensajesEntrantes)
-- y "confirmación de lectura" (suscribirConfirmacionesLectura) -- pero la
-- tabla `mensajes` nunca se agregó a la publicación `supabase_realtime`.
-- Sin esto, Postgres Changes simplemente no transmite NADA para esa tabla
-- (no es un error visible, no es un bug de React -- la base nunca avisa),
-- así que la única forma de ver un mensaje nuevo era refrescar la pestaña.
-- Pedido explícito 2026-07-23: "el tener que refrescar la pestaña no tiene
-- sentido operacional".
--
-- Mismo patrón ya usado en este proyecto para las salas de simulación (ver
-- 2026-07-02_salas_simulacion_avanzado.sql) -- envuelto en DO/exception
-- para poder re-ejecutar este script sin que falle si ya estaba agregada.
-- =====================================================================
do $$
begin
  alter publication supabase_realtime add table mensajes;
exception when duplicate_object then null;
end $$;
