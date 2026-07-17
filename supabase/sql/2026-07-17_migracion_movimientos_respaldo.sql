-- =====================================================================
-- Respaldo de UN nivel para "Aplicar plan de recolección" (F1.5-C) --
-- pedido explícito del usuario: poder probar con datos reales sin miedo a
-- desordenar todo -- "Deshacer última aplicación" en PanelMigracion.jsx.
--
-- Guarda el plan PENDIENTE tal cual estaba justo ANTES de la última vez
-- que se tocó "Aplicar" (reemplazarPendientes() lo llena; nunca se toca a
-- mano). Un solo nivel -- se reemplaza entero cada vez que se aplica un
-- plan nuevo, no es un historial completo. Lo ya "recolectado" nunca pasa
-- por acá, porque reemplazarPendientes() tampoco lo toca.
-- =====================================================================
create table if not exists migracion_movimientos_respaldo (
  id             bigserial primary key,
  mz_pasillo     text not null,
  mz_columna     int  not null,
  mz_nivel       text,
  rcl_codigo     text not null,
  rcl_nivel      text,
  articulo       text not null,
  cantidad       numeric not null default 0,
  orden          int not null,
  importado_por  uuid references profiles(id),
  importado_en   timestamptz not null default now(),
  respaldado_en  timestamptz not null default now()
);

alter table migracion_movimientos_respaldo enable row level security;

create policy migracion_movimientos_respaldo_select on migracion_movimientos_respaldo for select
  using (auth.uid() is not null);
-- Mismo corte que migracion_movimientos_insert (2026-07-13_migracion_rcl_mz_rls.sql):
-- solo quien puede aplicar un plan nuevo puede respaldar/deshacer el anterior.
create policy migracion_movimientos_respaldo_insert on migracion_movimientos_respaldo for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy migracion_movimientos_respaldo_delete on migracion_movimientos_respaldo for delete
  using (rol_actual() in ('Supervisor', 'Administrador'));
