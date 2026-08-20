-- ---------------------------------------------------------------------
-- Revisión de conflictos: movimiento manual vs. migración pendiente
-- (ver DECISIONES.md ADR-019). Pedido explícito del usuario 2026-08-20:
-- alguien puede mover un artículo a mano en el mapa real mientras ese
-- MISMO artículo ya tiene un migracion_movimiento pendiente hacia otro
-- rack -- sin esto, el movimiento pendiente queda huérfano y Despacho lo
-- sigue ofreciendo como tarea real a un trabajador de piso (reproceso).
--
-- `estado` en migracion_movimientos ya era texto libre sin CHECK (default
-- 'pendiente', documentado como 'pendiente | recolectado' pero nunca
-- forzado en la base) -- agregar 'a_revisar'/'descartado' no rompe nada
-- existente, no hace falta tocar ningún constraint.
--
-- No se toca la RLS de UPDATE (ya permite Operador/Supervisor/Administrador,
-- ver 2026-07-13_migracion_rcl_mz_rls.sql) -- "solo un supervisor resuelve"
-- se gatea en la UI (PanelMigracion.jsx), no en la base, mismo criterio que
-- ya usa el resto del proyecto (ej. los botones de aprobación de equipos).
-- ---------------------------------------------------------------------
alter table migracion_movimientos
  add column if not exists marcado_a_revisar_por uuid references profiles(id),
  add column if not exists marcado_a_revisar_en timestamptz,
  add column if not exists motivo_revision text,
  add column if not exists resuelto_por uuid references profiles(id),
  add column if not exists resuelto_en timestamptz;
