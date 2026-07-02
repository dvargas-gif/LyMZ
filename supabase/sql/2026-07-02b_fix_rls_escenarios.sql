-- Arregla el permiso para crear/ver/borrar salas de simulación.
-- La tabla `escenarios` tenía RLS activado pero le faltaban las políticas
-- (a diferencia de escenario_posiciones/eliminados, que sí las tenían) —
-- por eso "Crear nuevo escenario" rechazaba el insert con un error de
-- row-level security aunque el usuario fuera Administrador.

alter table escenarios enable row level security;

drop policy if exists escenarios_select on escenarios;
create policy escenarios_select on escenarios for select
  using (rol_actual() in ('Administrador','Supervisor'));

drop policy if exists escenarios_insert on escenarios;
create policy escenarios_insert on escenarios for insert
  with check (rol_actual() in ('Administrador','Supervisor'));

drop policy if exists escenarios_update on escenarios;
create policy escenarios_update on escenarios for update
  using (rol_actual() in ('Administrador','Supervisor'));

drop policy if exists escenarios_delete on escenarios;
create policy escenarios_delete on escenarios for delete
  using (rol_actual() in ('Administrador','Supervisor'));
