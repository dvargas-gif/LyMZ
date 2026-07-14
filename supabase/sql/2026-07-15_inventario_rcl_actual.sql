-- =====================================================================
-- F1.5-B: inventario ACTUAL por sub-posición RCL (hoja "Inventario" del
-- archivo real del cliente) -- qué artículo y cuánta cantidad tiene HOY
-- cada sub-posición del sistema viejo. Mismo grano que identidad_legacy
-- (rcl_codigo+nivel+subnivel) para poder cruzarlas: identidad_legacy dice
-- "esta sub-posición RCL es tal MZ", esta tabla dice "esta sub-posición
-- RCL tiene hoy tal artículo" -- juntas arman la "vista RCL" del canvas.
--
-- A diferencia de identidad_legacy (armada a mano, headers exactos), este
-- archivo puede salir de un ERP -- el import usa headers FLEXIBLES (ver
-- inventarioRcl.service.js), no exige nombres de columna exactos.
--
-- Se re-carga periódicamente ("actualizarlo") -- upsert por sub-posición,
-- no un historial: cada import es la foto más reciente de esa posición.
-- =====================================================================
create table if not exists inventario_rcl_actual (
  rcl_codigo      text not null,
  rcl_nivel       int  not null,
  rcl_subnivel    int  not null,
  articulo        text not null,
  cantidad        numeric not null default 0,
  actualizado_por uuid references profiles(id),
  actualizado_en  timestamptz not null default now(),
  primary key (rcl_codigo, rcl_nivel, rcl_subnivel)
);

alter table inventario_rcl_actual enable row level security;

create policy inventario_rcl_actual_select on inventario_rcl_actual for select
  using (auth.uid() is not null);
create policy inventario_rcl_actual_insert on inventario_rcl_actual for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy inventario_rcl_actual_update on inventario_rcl_actual for update
  using (rol_actual() in ('Supervisor', 'Administrador'));
