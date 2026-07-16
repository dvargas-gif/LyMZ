-- =====================================================================
-- Dos gaps encontrados en la revisión previa al deploy a producción
-- (F1.5-C, plan de recolección):
--
-- 1) migracion_movimientos_pendiente_unique -- el índice que
--    migracionMovimientos.service.js.reemplazarPendientes() necesita para
--    su upsert (onConflict sobre mz_pasillo,mz_columna,mz_nivel,rcl_codigo,
--    rcl_nivel,articulo) se había corrido como SQL suelto en una sesión de
--    chat, nunca quedó guardado como migración versionada -- si se
--    reconstruye la base desde supabase/sql/ en orden, el primer "Aplicar"
--    del plan de recolección fallaría con "no unique or exclusion
--    constraint matching the ON CONFLICT specification".
--
-- 2) migracion_movimientos nunca tuvo policy de DELETE (a diferencia de
--    migracion_slots/migracion_buffer, que sí la tienen desde
--    2026-07-15_migracion_estados_check.sql) -- sin esto,
--    reemplazarPendientes()'s DELETE de las filas 'pendiente' viejas
--    afecta 0 filas en silencio (RLS lo bloquea sin error), así que
--    regenerar el plan una segunda vez deja el plan viejo mezclado con
--    el nuevo para siempre.
-- =====================================================================

create unique index if not exists migracion_movimientos_pendiente_unique
  on migracion_movimientos (mz_pasillo, mz_columna, mz_nivel, rcl_codigo, rcl_nivel, articulo)
  where estado = 'pendiente';

drop policy if exists migracion_movimientos_delete on migracion_movimientos;
create policy migracion_movimientos_delete on migracion_movimientos for delete
  using (rol_actual() in ('Supervisor', 'Administrador'));
