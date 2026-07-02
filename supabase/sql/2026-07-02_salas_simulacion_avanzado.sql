-- Salas de simulación — funcionalidad avanzada (bloqueo, limpiar área, picks).
-- Ejecutar una sola vez en el SQL Editor del dashboard de Supabase.
-- No modifica ninguna tabla real (posiciones_actuales, bloqueos, auditoria).

-- 1) "Última actualización" visible en la lista de salas.
alter table escenarios add column if not exists actualizado_en timestamptz not null default now();

-- 2) Bloqueos DENTRO de una sala (nunca toca la tabla real `bloqueos`).
create table if not exists escenario_bloqueos (
  escenario_id  bigint not null references escenarios(id) on delete cascade,
  rack_key      text not null,
  pasillo       text not null,
  columna       int not null,
  actualizado_por uuid references profiles(id),
  actualizado_en  timestamptz not null default now(),
  primary key (escenario_id, rack_key)
);
alter table escenario_bloqueos enable row level security;

create policy escenario_bloqueos_select on escenario_bloqueos for select
  using (rol_actual() in ('Administrador','Supervisor'));
create policy escenario_bloqueos_insert on escenario_bloqueos for insert
  with check (rol_actual() in ('Administrador','Supervisor'));
create policy escenario_bloqueos_update on escenario_bloqueos for update
  using (rol_actual() in ('Administrador','Supervisor'));
create policy escenario_bloqueos_delete on escenario_bloqueos for delete
  using (rol_actual() in ('Administrador','Supervisor'));

-- 3) Datos de picks cargados para simular comportamiento/rotación DENTRO de una sala.
create table if not exists escenario_picks (
  id            bigserial primary key,
  escenario_id  bigint not null references escenarios(id) on delete cascade,
  articulo      text not null,
  nombre        text,
  cantidad_picks numeric not null default 0,
  frecuencia    numeric,
  prioridad     text,
  periodo       text,
  cargado_por   uuid references profiles(id),
  cargado_en    timestamptz not null default now()
);
create index if not exists escenario_picks_escenario_idx on escenario_picks(escenario_id);
alter table escenario_picks enable row level security;

create policy escenario_picks_select on escenario_picks for select
  using (rol_actual() in ('Administrador','Supervisor'));
create policy escenario_picks_insert on escenario_picks for insert
  with check (rol_actual() in ('Administrador','Supervisor'));
create policy escenario_picks_delete on escenario_picks for delete
  using (rol_actual() in ('Administrador','Supervisor'));

-- 4) `actualizado_en` de la sala se actualiza solo, con CUALQUIER cambio real
--    (mover, bloquear, limpiar, cargar picks) — no depende de que alguien
--    toque el botón "Guardar simulación" para quedar reflejado en la lista.
create or replace function tocar_escenario_actualizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update escenarios set actualizado_en = now()
    where id = coalesce(new.escenario_id, old.escenario_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_tocar_escenario_posiciones on escenario_posiciones;
create trigger trg_tocar_escenario_posiciones
  after insert or update or delete on escenario_posiciones
  for each row execute function tocar_escenario_actualizado();

drop trigger if exists trg_tocar_escenario_eliminados on escenario_eliminados;
create trigger trg_tocar_escenario_eliminados
  after insert or update or delete on escenario_eliminados
  for each row execute function tocar_escenario_actualizado();

drop trigger if exists trg_tocar_escenario_bloqueos on escenario_bloqueos;
create trigger trg_tocar_escenario_bloqueos
  after insert or update or delete on escenario_bloqueos
  for each row execute function tocar_escenario_actualizado();

drop trigger if exists trg_tocar_escenario_picks on escenario_picks;
create trigger trg_tocar_escenario_picks
  after insert or delete on escenario_picks
  for each row execute function tocar_escenario_actualizado();

-- 5) Publicar en Realtime para que "Ver reporte" de una sala se refresque sola
--    igual que ya hace el reporte del mapa real. Envuelto en DO/exception para
--    poder re-ejecutar este script sin que falle si ya estaban agregadas.
do $$
begin
  alter publication supabase_realtime add table escenario_posiciones;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table escenario_eliminados;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table escenario_bloqueos;
exception when duplicate_object then null;
end $$;
