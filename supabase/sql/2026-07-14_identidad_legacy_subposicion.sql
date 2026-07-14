-- =====================================================================
-- Identidad legacy pasa de grano "por COLUMNA" a grano "por SUB-POSICIÓN"
-- (columna x nivel x subnivel) -- el archivo real del cliente
-- (Docs/Documentos de base de datos/RCL PA.xlsx, hoja "Migracion RCL - MZ",
-- 1550 filas) trae identidad a este nivel de detalle: MZ01-C001-N01-1 <->
-- RCL112-C001-N01-1, 5 sub-niveles por columna (n01..n05).
--
-- Ejecutar DESPUÉS de 2026-07-14_identidad_legacy_estados.sql (ya aplicado).
--
-- TRUNCATE primero: confirmado con el usuario que la tabla está vacía
-- (select count(*) = 0) -- una fila del grano viejo (por columna) no tenía
-- ningún nivel en particular, así que no hay nada real que migrar/perder.
-- =====================================================================
truncate table identidad_legacy;

alter table identidad_legacy add column if not exists mz_nivel int not null default 1;
alter table identidad_legacy add column if not exists mz_subnivel int not null default 1;
alter table identidad_legacy add column if not exists rcl_nivel int;
alter table identidad_legacy add column if not exists rcl_subnivel int;

-- PK cambia de (mz_pasillo, mz_columna) a la sub-posición completa.
alter table identidad_legacy drop constraint if exists identidad_legacy_pkey;
alter table identidad_legacy add primary key (mz_pasillo, mz_columna, mz_nivel, mz_subnivel);

-- Reemplaza el índice parcial de 2026-07-14_identidad_legacy_estados.sql
-- (antes solo sobre rcl_codigo) -- ahora cubre la sub-posición RCL completa,
-- porque un mismo rcl_codigo (rack físico) tiene una fila por cada uno de
-- sus 5 niveles -- la unicidad real es (código, nivel, subnivel), no el código solo.
drop index if exists identidad_legacy_rcl_codigo_unique;
create unique index if not exists identidad_legacy_rcl_subposicion_unique
  on identidad_legacy (rcl_codigo, rcl_nivel, rcl_subnivel) where rcl_codigo is not null;

-- Coherencia estado_rcl <-> campos RCL, ahora sobre los 3 campos (antes solo rcl_codigo).
alter table identidad_legacy drop constraint if exists identidad_legacy_estado_coherente;
alter table identidad_legacy add constraint identidad_legacy_estado_coherente
  check (
    (estado_rcl = 'asignado' and rcl_codigo is not null and rcl_nivel is not null and rcl_subnivel is not null)
    or (estado_rcl <> 'asignado' and rcl_codigo is null and rcl_nivel is null and rcl_subnivel is null)
  );

-- Sin cambios de RLS: las policies de F1 no distinguen columna.
