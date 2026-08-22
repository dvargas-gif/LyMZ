-- =====================================================================
-- Zonas de pick -- máximo/mínimo real por artículo en su posición de pick
-- (sesión 2026-08-22, pedido explícito de David: "una tabla de Zonas de
-- PICK en la que vivirá los máximos y mínimos"). Mismo patrón que
-- articulo_dimensiones (2026-07-21_articulo_dimensiones.sql): tabla propia,
-- grano por artículo, import con preview + rechazadas antes de aplicar.
--
-- Distinto de articulo_dimensiones.cantidad_maxima: ese es un INSUMO para
-- calcular volumen_m3 (columna generada). Este máximo/mínimo es un
-- concepto de negocio aparte (documento de máximos/mínimos de pick) --
-- no se fusiona con dimensiones para no mezclar dos fuentes de verdad
-- distintas en una sola columna.
-- =====================================================================

create table if not exists zonas_pick (
  articulo          text primary key,
  cantidad_minima   int not null check (cantidad_minima >= 0),
  cantidad_maxima   int not null check (cantidad_maxima > cantidad_minima),
  importado_por     uuid references profiles(id),
  importado_en      timestamptz not null default now()
);

alter table zonas_pick enable row level security;
create policy zonas_pick_select on zonas_pick for select
  using (auth.uid() is not null);
-- Mismo corte que articulo_dimensiones/identidad_legacy: import es
-- Supervisor/Administrador únicamente.
create policy zonas_pick_insert on zonas_pick for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy zonas_pick_update on zonas_pick for update
  using (rol_actual() in ('Supervisor', 'Administrador'));
