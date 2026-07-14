-- =====================================================================
-- Pendiente arrastrado desde F1 (ver PROGRESO.md): las columnas `estado`
-- de migracion_slots/migracion_movimientos/migracion_purgas eran `text`
-- libre, sin CHECK que valide los valores permitidos a nivel de base --
-- se agrega acá, al arrancar F2, como se había planeado.
-- =====================================================================

alter table migracion_slots drop constraint if exists migracion_slots_estado_valido;
alter table migracion_slots add constraint migracion_slots_estado_valido
  check (estado in ('pendiente', 'vaciando', 'recolectando', 'bloqueado', 'confirmado'));

alter table migracion_movimientos drop constraint if exists migracion_movimientos_estado_valido;
alter table migracion_movimientos add constraint migracion_movimientos_estado_valido
  check (estado in ('pendiente', 'recolectado'));

alter table migracion_purgas drop constraint if exists migracion_purgas_estado_valido;
alter table migracion_purgas add constraint migracion_purgas_estado_valido
  check (estado in ('pendiente', 'resuelta'));

-- =====================================================================
-- "Cancelar traslado" (F2): F1 nunca dio permiso de DELETE en
-- migracion_slots/migracion_buffer -- hacía falta para poder deshacer un
-- "Iniciar traslado" hecho por error, con o sin artículos ya movidos al
-- buffer. Mismos roles que ya pueden escribir en estas tablas.
-- =====================================================================
drop policy if exists migracion_slots_delete on migracion_slots;
create policy migracion_slots_delete on migracion_slots for delete
  using (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));

drop policy if exists migracion_buffer_delete on migracion_buffer;
create policy migracion_buffer_delete on migracion_buffer for delete
  using (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));
