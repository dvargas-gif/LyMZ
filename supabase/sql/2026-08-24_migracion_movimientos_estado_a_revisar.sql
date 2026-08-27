-- =====================================================================
-- Corrige un gap real encontrado en producción (2026-08-24): el SQL de
-- ADR-020 (2026-08-20_migracion_movimientos_revision.sql) agregó las
-- columnas de seguimiento (marcado_a_revisar_por/en, motivo_revision,
-- resuelto_por/en) pero NUNCA actualizó este constraint -- el código
-- (marcarARevisar()/resolverRevision() en migracionMovimientos.service.js)
-- ya escribe estado='a_revisar'/'descartado' desde esa fecha, pero el
-- constraint real solo permitía 'pendiente'/'recolectado'. La cola de
-- revisión de conflictos de Supervisor estuvo rota en producción desde
-- que se pusheó ADR-020, sin que ningún conflicto real la hubiera
-- disparado todavía para exponer el error.
-- =====================================================================
alter table migracion_movimientos drop constraint migracion_movimientos_estado_valido;
alter table migracion_movimientos add constraint migracion_movimientos_estado_valido
  check (estado = any (array['pendiente', 'recolectado', 'a_revisar', 'descartado']));
