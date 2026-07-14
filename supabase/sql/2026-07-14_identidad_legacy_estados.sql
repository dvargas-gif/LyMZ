-- =====================================================================
-- Migración SOBRE F1 (identidad_legacy ya aplicada, ver
-- 2026-07-09_migracion_rcl_mz_borrador.sql / DECISIONES.md ADR-015).
--
-- Contexto: no toda posición MZ tiene hoy un RCL real conocido -- algunas
-- están pendientes de que el usuario termine de identificarlas a mano
-- (marcadas "*" en su tabla) y otras directamente no existían en el
-- sistema viejo (pasillos nuevos MZ09-MZ12, marcadas "N/A" o vacías). El
-- schema de F1 no distinguía esto -- `rcl_codigo` era NOT NULL, así que no
-- había forma de representar "todavía no sé" o "no aplica" sin inventar un
-- código falso. Se agrega el tercer estado explícito acá, antes de recibir
-- el archivo real.
-- =====================================================================

-- 1) El código deja de ser obligatorio -- "pendiente_asignar"/"sin_rcl" no tienen uno.
alter table identidad_legacy alter column rcl_codigo drop not null;

-- 2) El UNIQUE inline original (rcl_codigo text not null unique) generó una
--    constraint con el nombre por defecto de Postgres -- se reemplaza por un
--    índice único PARCIAL: los NULL nunca chocan entre sí (comportamiento
--    estándar de Postgres para UNIQUE, acá explícito con el WHERE para que
--    quede documentado, no implícito).
alter table identidad_legacy drop constraint if exists identidad_legacy_rcl_codigo_key;
create unique index if not exists identidad_legacy_rcl_codigo_unique
  on identidad_legacy (rcl_codigo) where rcl_codigo is not null;

-- 3) El estado explícito -- default 'asignado' para que las filas ya
--    importadas en F1 (todas con código real) queden consistentes sin tocarlas.
alter table identidad_legacy add column if not exists estado_rcl text not null default 'asignado';
alter table identidad_legacy drop constraint if exists identidad_legacy_estado_rcl_valido;
alter table identidad_legacy add constraint identidad_legacy_estado_rcl_valido
  check (estado_rcl in ('asignado', 'pendiente_asignar', 'sin_rcl'));

-- 4) Coherencia entre estado y código -- 'asignado' siempre con código real,
--    los otros dos siempre sin código. Evita que un futuro UPDATE manual (o
--    un bug del import) deje un estado y un código que se contradicen.
alter table identidad_legacy drop constraint if exists identidad_legacy_estado_coherente;
alter table identidad_legacy add constraint identidad_legacy_estado_coherente
  check (
    (estado_rcl = 'asignado' and rcl_codigo is not null)
    or (estado_rcl <> 'asignado' and rcl_codigo is null)
  );

-- Sin cambios de RLS: las policies de F1 (select/insert/update por rol) no
-- distinguen columna, siguen aplicando igual sobre la fila completa.
