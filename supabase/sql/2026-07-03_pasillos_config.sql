-- Estructura mínima para "Añadir rack" (extender un pasillo hasta una
-- columna mayor). No mueve ni crea filas de artículos: el mapa ya dibuja
-- vacía cualquier columna sin datos, esto solo guarda hasta dónde dibujar
-- cada pasillo, en vez de tenerlo fijo en el código (MZ01=27, resto=36).

create table if not exists pasillos_config (
  pasillo        text primary key,
  max_columna    int not null,
  actualizado_por uuid references profiles(id),
  actualizado_en  timestamptz not null default now()
);
alter table pasillos_config enable row level security;

-- Cualquier usuario logueado necesita LEER esto (todos ven el mismo mapa).
drop policy if exists pasillos_config_select on pasillos_config;
create policy pasillos_config_select on pasillos_config for select
  using (auth.uid() is not null);

-- Escribir (crear/extender) es EXCLUSIVO de Administrador -- ni Supervisor.
drop policy if exists pasillos_config_insert on pasillos_config;
create policy pasillos_config_insert on pasillos_config for insert
  with check (rol_actual() = 'Administrador');
drop policy if exists pasillos_config_update on pasillos_config;
create policy pasillos_config_update on pasillos_config for update
  using (rol_actual() = 'Administrador');
