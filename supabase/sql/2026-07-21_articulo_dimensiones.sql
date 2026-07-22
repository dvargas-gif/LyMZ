-- =====================================================================
-- Dimensiones reales por artículo (sesión 2026-07-21) -- pedido explícito
-- del usuario después de un incidente real: la columna "Volumen" de un
-- Excel de referencia (Reporte de dimensiones.xlsx) quedó calculada con una
-- cantidad vieja (100) y nunca se recalculó cuando se reemplazó por la
-- cantidad máxima real -- llevó a un análisis de capacidad completamente
-- equivocado. La corrección de fondo: `volumen_m3` es una COLUMNA
-- CALCULADA por Postgres (`generated always as ... stored`), nunca un
-- valor que una persona escribe a mano -- es matemáticamente imposible que
-- quede desactualizada, porque Postgres la recalcula solo en cada
-- insert/update de largo/ancho/alto/cantidad_maxima.
-- =====================================================================

create table if not exists articulo_dimensiones (
  articulo          text primary key,
  descripcion       text,
  largo_cm          numeric not null check (largo_cm > 0),
  ancho_cm          numeric not null check (ancho_cm > 0),
  alto_cm           numeric not null check (alto_cm > 0),
  peso_kg           numeric,
  -- Cantidad máxima real que cabe en una posición de zona pick (documento
  -- de máximos/mínimos del negocio) -- NO la cantidad de reposición
  -- (ese es un concepto de negocio distinto, "dura N días sin reponer",
  -- no se guarda acá).
  cantidad_maxima   int not null check (cantidad_maxima > 0),
  -- Generada, no insertada -- ver comentario de arriba. cm -> m3: dividir
  -- el producto (cm x cm x cm) entre 1'000,000 (100^3).
  volumen_m3        numeric generated always as (largo_cm * ancho_cm * alto_cm * cantidad_maxima / 1000000.0) stored,
  importado_por     uuid references profiles(id),
  importado_en      timestamptz not null default now()
);

alter table articulo_dimensiones enable row level security;
create policy articulo_dimensiones_select on articulo_dimensiones for select
  using (auth.uid() is not null);
-- Mismo corte que identidad_legacy/inventario_rcl_actual: import es
-- Supervisor/Administrador únicamente.
create policy articulo_dimensiones_insert on articulo_dimensiones for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy articulo_dimensiones_update on articulo_dimensiones for update
  using (rol_actual() in ('Supervisor', 'Administrador'));
