-- =====================================================================
-- Esquema de base de datos · WMS Slotting Mezanine (PostgreSQL / Supabase)
-- =====================================================================
-- Este archivo es documentación de referencia, NO una migración ejecutable
-- ni la fuente de verdad del esquema real. Reconstruido a partir de:
--   (a) los 4 scripts versionados en supabase/sql/*.sql (fuente confiable), y
--   (b) los nombres de tabla/columna que usa cada *.service.js (fuente
--       observacional: es lo que el código SUPONE que existe, no una lectura
--       directa de la base).
-- No tengo acceso de introspección directo a Supabase en este entorno, así
-- que TODO lo marcado [NO VERSIONADO] es una reconstrucción, no un hecho
-- confirmado. Antes de usar este archivo para recrear la base desde cero,
-- verificalo contra `information_schema` / el Dashboard de Supabase.
--
-- La versión anterior de este archivo (usuarios/roles/sesiones con
-- password_hash propio) es de ANTES de migrar a Supabase Auth + RLS y ya
-- no refleja nada real — reemplazada por completo acá.
-- =====================================================================

-- ---------------------------------------------------------------------
-- IDENTIDAD Y ACCESO
-- ---------------------------------------------------------------------

-- [NO VERSIONADO] Espejo de auth.users + el rol de la app. id = auth.users.id.
-- RLS real: no hay archivo en supabase/sql/ que la defina — se asume creada
-- a mano en el Dashboard. usuarios.service.js y auth.service.js dependen de
-- que "Administrador" pueda leer/escribir cualquier fila y cualquier otro
-- usuario solo la propia (para login/perfil).
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  email        text,
  rol          text not null default 'Solo lectura', -- Administrador | Supervisor | Operador | Solo lectura
  activo       boolean not null default true,
  apodo        text
);
-- alter table profiles enable row level security;  -- [NO VERSIONADO] estado real sin confirmar

-- Función de conveniencia que usan TODAS las políticas de supabase/sql/*.sql
-- (rol_actual() in (...)). No está definida en ningún script versionado acá
-- — existe en la base real pero su cuerpo exacto no se pudo confirmar.
-- create function rol_actual() returns text ...  -- [NO VERSIONADO]

-- Actualiza SOLO la columna `apodo` de la propia fila — security definer para
-- que un usuario no pueda colarse un cambio de rol junto con el apodo.
-- create function actualizar_mi_apodo(nuevo_apodo text) ...  -- [NO VERSIONADO, ver miPerfil.service.js]

-- [NO VERSIONADO] Registro de intentos de login (existan o no la cuenta).
create table if not exists intentos_login (
  id         bigserial primary key,
  email      text not null,
  ip         text,
  exitoso    boolean not null,
  fecha_hora timestamptz not null default now()
);

-- [NO VERSIONADO] Historial completo, append-only — nunca se hace DELETE
-- desde la app (ni siquiera hay un método delete() en la capa de acceso).
-- OJO: los nombres de columna de abajo son los que manda audit.service.js
-- tal cual (camelCase); no se pudo confirmar si la tabla real usa esos
-- mismos nombres o el equivalente en snake_case con un mapeo intermedio.
create table if not exists auditoria (
  id             bigserial primary key,
  "usuarioId"    uuid references profiles(id),
  "usuarioNombre" text,
  fecha          text not null, -- 'YYYY-MM-DD'
  hora           text not null, -- 'HH:MM:SS'
  ip             text,
  accion         text not null, -- movimiento | login | logout | login_fallido | cambio_password | admin
  estado         text not null default 'Correcto', -- Correcto | Cancelado | Deshecho
  observaciones  text,
  "rackOrigen"    text,
  "nivelOrigen"   text,
  "rackDestino"   text,
  "nivelDestino"  text,
  articulo       text,
  cantidad       numeric default 0,
  "tipoMovimiento" text -- individual | cuerpo_completo
);
create index if not exists idx_auditoria_fecha on auditoria(fecha);
create index if not exists idx_auditoria_accion on auditoria(accion);

-- ---------------------------------------------------------------------
-- MAPA REAL (mismas tablas que un HTML legacy embebido en el mapa lee vía
-- postMessage — nunca las consulta directo)
-- ---------------------------------------------------------------------

-- [NO VERSIONADO] Plan base del slotting: la foto "de fábrica" (3016
-- artículos), solo lectura desde la app.
create table if not exists inventario_slotting (
  articulo          text not null,
  pasillo           text,
  columna           int,
  nivel             text,
  clase             text, -- A | B | C | D | '-'
  tipo              text, -- NORMAL | CUERPO
  picks             numeric,
  consumo           numeric,
  rack_actual       text,
  niveles_a_armar   int
);

-- [NO VERSIONADO] Catálogo de descripciones de artículo, solo lectura.
create table if not exists articulos_info (
  articulo     text primary key,
  descripcion  text
);

-- [NO VERSIONADO] Última posición conocida de cada artículo movido — foto
-- más reciente por artículo (upsert-only, nunca se borra la fila física).
create table if not exists posiciones_actuales (
  articulo         text primary key,
  pasillo          text not null,
  columna          int not null,
  nivel            text,
  clase            text,
  grupo            text,
  tipo             text,
  actualizado_por  uuid references profiles(id),
  actualizado_en   timestamptz not null default now()
);

-- [NO VERSIONADO] Posiciones bloqueadas físicamente (presencia = bloqueada).
create table if not exists bloqueos (
  rack_key         text primary key,
  pasillo          text not null,
  columna          int not null,
  actualizado_por  uuid references profiles(id),
  actualizado_en   timestamptz not null default now()
);

-- [NO VERSIONADO] Configuración global del croquis — fila única (id=1).
create table if not exists config_mapa (
  id               int primary key default 1,
  tema             text not null default 'claro', -- claro | oscuro | alto_contraste
  orientacion      text not null default 'horizontal', -- horizontal | vertical
  actualizado_por  uuid references profiles(id),
  actualizado_en   timestamptz not null default now(),
  constraint config_mapa_singleton check (id = 1)
);

-- [VERSIONADO: supabase/sql/2026-07-03_pasillos_config.sql +
--  2026-07-04_pasillos_config_seguridad.sql] Hasta qué columna dibuja cada
-- pasillo. "Añadir rack" solo sube este número; nunca crea filas de
-- artículos ni pasillos nuevos.
create table if not exists pasillos_config (
  pasillo          text primary key,
  max_columna      int not null,
  actualizado_por  uuid references profiles(id),
  actualizado_en   timestamptz not null default now(),
  constraint pasillos_config_max_columna_positivo check (max_columna > 0)
);
-- Trigger evitar_reducir_pasillo(): un UPDATE nunca puede bajar max_columna
-- respecto al valor actual (ver 2026-07-04_pasillos_config_seguridad.sql).
alter table pasillos_config enable row level security;
create policy pasillos_config_select on pasillos_config for select
  using (auth.uid() is not null);
create policy pasillos_config_insert on pasillos_config for insert
  with check (rol_actual() = 'Administrador');
create policy pasillos_config_update on pasillos_config for update
  using (rol_actual() = 'Administrador');

-- ---------------------------------------------------------------------
-- SALAS DE SIMULACIÓN (copias aisladas — nunca tocan las tablas de arriba)
-- ---------------------------------------------------------------------

-- [VERSIONADO: supabase/sql/2026-07-02b_fix_rls_escenarios.sql]
create table if not exists escenarios (
  id                  bigserial primary key,
  nombre              text not null,
  creado_por          uuid references profiles(id),
  creado_por_nombre   text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
alter table escenarios enable row level security;
create policy escenarios_select on escenarios for select
  using (rol_actual() in ('Administrador','Supervisor'));
create policy escenarios_insert on escenarios for insert
  with check (rol_actual() in ('Administrador','Supervisor'));
create policy escenarios_update on escenarios for update
  using (rol_actual() in ('Administrador','Supervisor'));
create policy escenarios_delete on escenarios for delete
  using (rol_actual() in ('Administrador','Supervisor'));

-- [NO VERSIONADO] Posiciones movidas DENTRO de una sala — mismo shape que
-- posiciones_actuales, con escenario_id de más.
create table if not exists escenario_posiciones (
  escenario_id     bigint not null references escenarios(id) on delete cascade,
  articulo         text not null,
  pasillo          text not null,
  columna          int not null,
  nivel            text,
  clase            text,
  grupo            text,
  tipo             text,
  actualizado_por  uuid references profiles(id),
  actualizado_en   timestamptz not null default now(),
  primary key (escenario_id, articulo)
);
-- alter table escenario_posiciones enable row level security;  -- [NO VERSIONADO, se asume existente]

-- [NO VERSIONADO] Artículos "limpiados" (vaciados) dentro de una sala.
create table if not exists escenario_eliminados (
  escenario_id   bigint not null references escenarios(id) on delete cascade,
  articulo       text not null,
  eliminado_por  uuid references profiles(id),
  eliminado_en   timestamptz not null default now(),
  primary key (escenario_id, articulo)
);
-- alter table escenario_eliminados enable row level security;  -- [NO VERSIONADO, se asume existente]

-- [VERSIONADO: supabase/sql/2026-07-02_salas_simulacion_avanzado.sql]
create table if not exists escenario_bloqueos (
  escenario_id     bigint not null references escenarios(id) on delete cascade,
  rack_key         text not null,
  pasillo          text not null,
  columna          int not null,
  actualizado_por  uuid references profiles(id),
  actualizado_en   timestamptz not null default now(),
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

-- [VERSIONADO: supabase/sql/2026-07-02_salas_simulacion_avanzado.sql]
-- Cada carga de picks REEMPLAZA la anterior (dataset de trabajo, no histórico).
create table if not exists escenario_picks (
  id              bigserial primary key,
  escenario_id    bigint not null references escenarios(id) on delete cascade,
  articulo        text not null,
  nombre          text,
  cantidad_picks  numeric not null default 0,
  frecuencia      numeric,
  prioridad       text,
  periodo         text,
  cargado_por     uuid references profiles(id),
  cargado_en      timestamptz not null default now()
);
create index if not exists escenario_picks_escenario_idx on escenario_picks(escenario_id);
alter table escenario_picks enable row level security;
create policy escenario_picks_select on escenario_picks for select
  using (rol_actual() in ('Administrador','Supervisor'));
create policy escenario_picks_insert on escenario_picks for insert
  with check (rol_actual() in ('Administrador','Supervisor'));
create policy escenario_picks_delete on escenario_picks for delete
  using (rol_actual() in ('Administrador','Supervisor'));

-- Trigger tocar_escenario_actualizado(): cualquier cambio real en una sala
-- (mover/bloquear/limpiar/cargar picks) actualiza escenarios.actualizado_en
-- solo, sin depender del botón "Guardar simulación".
-- (definición completa en supabase/sql/2026-07-02_salas_simulacion_avanzado.sql)

-- Realtime: escenario_posiciones, escenario_eliminados y escenario_bloqueos
-- están publicadas en supabase_realtime (mismo mecanismo que el reporte del
-- mapa real) para que "Ver reporte" de una sala se refresque solo.

-- =====================================================================
-- PENDIENTE (Fase 2 del roadmap de arquitectura, no ejecutada todavía):
-- extraer las políticas RLS reales de `profiles`, `posiciones_actuales`,
-- `bloqueos`, `auditoria`, `articulos_info`, `inventario_slotting`,
-- `config_mapa`, `escenario_posiciones` y `escenario_eliminados` desde
-- pg_policies y versionarlas acá — hoy son "[NO VERSIONADO]" en este
-- archivo, lo que significa "no confirmado desde el repo", NO "no existen".
-- =====================================================================
