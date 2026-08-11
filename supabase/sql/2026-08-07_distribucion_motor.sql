-- =====================================================================
-- Motor de distribución (Fase 5 -- ver DECISIONES.md ADR-016, plan
-- aprobado 2026-08-06/07). 3 tablas nuevas, ninguna toca
-- inventario_slotting (sigue solo lectura) ni posiciones_actuales
-- directamente -- "aprobar" una propuesta escribe en posiciones_actuales
-- vía el service existente (posicionesService.guardarLote()), no acá.
--
-- No ejecutado por el asistente -- sin acceso a Supabase desde este
-- entorno (mismo caveat que ADR-015). Corrida real a cargo de David,
-- con su aprobación explícita antes de correrlo (Ley 6).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cabecera de una corrida del motor -- una fila por cada vez que se
-- calcula una propuesta completa (se puede recalcular/descartar varias
-- veces antes de aprobar una).
-- ---------------------------------------------------------------------
create table if not exists distribucion_lotes (
  id                  bigserial primary key,
  generado_por        uuid references profiles(id),
  generado_en         timestamptz not null default now(),
  parametros          jsonb not null, -- snapshot de pesos/zonas/reglas usados -- trazabilidad completa de la configuración (Ley 8)
  total_articulos     int not null,
  total_movimientos   int not null,
  total_sin_asignar   int not null,
  metricas_agregadas  jsonb, -- densidad promedio, huecos usados, etc. -- lo mismo que ya muestra el resumen en pantalla
  estado              text not null default 'calculado' check (estado in ('calculado', 'aprobado', 'descartado')),
  aprobado_por        uuid references profiles(id),
  aprobado_en         timestamptz
);
create index if not exists idx_distribucion_lotes_estado on distribucion_lotes(estado);

-- ---------------------------------------------------------------------
-- 2. Borrador de la propuesta -- una fila por artículo, mutable/recalculable
-- mientras el lote no esté aprobado. Nunca es "la posición real" -- eso
-- sigue siendo posiciones_actuales, esta tabla solo existe para poder
-- revisar/exportar/aprobar antes de tocar nada real.
-- ---------------------------------------------------------------------
create table if not exists inventario_slotting_propuesto (
  id                      bigserial primary key,
  lote_id                 bigint not null references distribucion_lotes(id) on delete cascade,
  articulo                text not null,
  pasillo_destino         text not null,
  columna_destino         int not null,
  nivel_destino           text not null, -- N01..N05, o 'CUERPO'
  pasillo_origen          text,          -- null si el artículo no tenía ubicación previa
  columna_origen          int,
  nivel_origen            text,
  utilizacion_resultante  numeric not null, -- 0-1, ocupación del hueco destino tras esta asignación
  afinidad                numeric not null, -- -1 zona a evitar, 0 neutro, 1 zona accesible, 2 zona óptima clase A (ver calcularAfinidadZonas.js)
  violaciones             numeric not null default 0,
  costo_total             numeric not null,
  motivo                  text not null,
  cambia_ubicacion        boolean not null,
  calculado_en            timestamptz not null default now()
);
create index if not exists idx_inventario_slotting_propuesto_lote on inventario_slotting_propuesto(lote_id);
create index if not exists idx_inventario_slotting_propuesto_articulo on inventario_slotting_propuesto(articulo);

-- ---------------------------------------------------------------------
-- 3. Auditoría de aprobación -- append-only, se llena SOLO en el momento
-- de aprobar (nunca antes, nunca se edita después). Tabla NUEVA, no se
-- reusa migracion_auditoria (esa está acoplada al flujo de slots RCL->MZ,
-- un contexto de negocio distinto -- reusarla forzaría texto libre en
-- `detalle` para algo que ya viene estructurado).
--
-- NOTA sobre Ley 3 ("derivados nunca persistidos"): los 3 campos
-- ocupacion_* son una excepción DELIBERADA -- es un hecho histórico
-- congelado en el instante exacto de la aprobación (igual que
-- inventario_slotting.rack_actual ya es un dato congelado), nunca se
-- vuelven a leer como estado vivo ni se recalculan desde acá. Pueden
-- quedar NULL si el service de aprobación no llega a calcularlos con
-- datos reales disponibles en ese momento -- mejor NULL explícito que
-- inventar un número.
-- ---------------------------------------------------------------------
create table if not exists distribucion_auditoria (
  id                          bigserial primary key,
  lote_id                     bigint references distribucion_lotes(id),
  articulo                    text not null,
  pasillo_origen               text,
  columna_origen               int,
  nivel_origen                 text,
  pasillo_destino              text not null,
  columna_destino               int not null,
  nivel_destino                 text not null,
  motivo                       text not null,
  reglas_evaluadas             jsonb not null, -- [{id, descripcion, cumple}], número por número (criterio 6.5: "cada propuesta es explicable")
  ocupacion_origen_antes       numeric,
  ocupacion_destino_antes      numeric,
  ocupacion_destino_despues    numeric,
  costo_total                  numeric not null,
  aprobado_por                 uuid references profiles(id) not null,
  aprobado_en                  timestamptz not null default now()
);
create index if not exists idx_distribucion_auditoria_lote on distribucion_auditoria(lote_id);
create index if not exists idx_distribucion_auditoria_articulo on distribucion_auditoria(articulo);

-- ---------------------------------------------------------------------
-- 4. RLS -- mismo patrón que articulo_dimensiones/pasillos_config: lectura
-- abierta a cualquier autenticado, alta/aprobación solo Supervisor/Administrador
-- (criterio 6.5: "ninguna propuesta se aplica sin aprobación humana").
-- ---------------------------------------------------------------------
alter table distribucion_lotes enable row level security;
create policy distribucion_lotes_select on distribucion_lotes for select
  using (auth.uid() is not null);
create policy distribucion_lotes_insert on distribucion_lotes for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy distribucion_lotes_update on distribucion_lotes for update
  using (rol_actual() in ('Supervisor', 'Administrador'));

alter table inventario_slotting_propuesto enable row level security;
create policy inventario_slotting_propuesto_select on inventario_slotting_propuesto for select
  using (auth.uid() is not null);
create policy inventario_slotting_propuesto_insert on inventario_slotting_propuesto for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy inventario_slotting_propuesto_delete on inventario_slotting_propuesto for delete
  using (rol_actual() in ('Supervisor', 'Administrador'));

alter table distribucion_auditoria enable row level security;
create policy distribucion_auditoria_select on distribucion_auditoria for select
  using (auth.uid() is not null);
create policy distribucion_auditoria_insert on distribucion_auditoria for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
-- Sin policy de update/delete -- append-only real, ni Administrador la edita después.
