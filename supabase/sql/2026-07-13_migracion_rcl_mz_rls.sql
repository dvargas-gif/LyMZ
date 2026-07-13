-- =====================================================================
-- RLS de las 6 tablas de 2026-07-09_migracion_rcl_mz_borrador.sql --
-- ejecutar DESPUÉS de ese archivo. Decisiones de rol confirmadas por el
-- usuario en la sesión 2026-07-13, sin preguntas abiertas:
--   - Lectura: cualquier usuario autenticado, en las 6 tablas.
--   - Import de identidad_legacy (y de migracion_movimientos, mismo
--     criterio -- es la salida del mismo cruce manual): Supervisor o
--     Administrador únicamente.
--   - migracion_buffer y las transiciones de migracion_slots HASTA
--     "bloqueado" (iniciar, vaciar, recolectar, bloquear): cualquier
--     Operador, Supervisor o Administrador -- todos "operan" el flujo.
--   - Transición a "confirmado" (migracion_slots.confirmado_por/en):
--     SOLO Supervisor o Administrador -- reforzado acá con un trigger,
--     no solo la policy de UPDATE genérica (ver nota más abajo: RLS de
--     Postgres no distingue por COLUMNA, solo por fila).
-- =====================================================================

-- ---------------------------------------------------------------------
-- identidad_legacy -- import restringido, lectura abierta.
-- ---------------------------------------------------------------------
alter table identidad_legacy enable row level security;

create policy identidad_legacy_select on identidad_legacy for select
  using (auth.uid() is not null);
create policy identidad_legacy_insert on identidad_legacy for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy identidad_legacy_update on identidad_legacy for update
  using (rol_actual() in ('Supervisor', 'Administrador'));
-- Sin policy de DELETE a propósito: corregir un error de captura es un
-- UPDATE (upsert, ver pantalla de import), nunca un borrado -- mismo
-- criterio que auditoria (append-only) para no perder rastro de qué
-- hubo antes.

-- ---------------------------------------------------------------------
-- migracion_movimientos -- mismo criterio de import que identidad_legacy
-- (Supervisor/Administrador, es la salida del mismo cruce manual), pero
-- el UPDATE de recolectado_por/recolectado_en/estado (paso 2, lo hace el
-- operador en el mapa) SÍ necesita incluir Operador.
-- ---------------------------------------------------------------------
alter table migracion_movimientos enable row level security;

create policy migracion_movimientos_select on migracion_movimientos for select
  using (auth.uid() is not null);
create policy migracion_movimientos_insert on migracion_movimientos for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
create policy migracion_movimientos_update on migracion_movimientos for update
  using (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));

-- ---------------------------------------------------------------------
-- migracion_slots -- INSERT/UPDATE general para cualquier rol operativo
-- (cubre iniciado_*/vaciado_en/bloqueado_*, pasos 1-3 del flujo guiado).
-- La transición a "confirmado" se restringe ADEMÁS con un trigger (ver
-- abajo) porque una policy de RLS no puede decir "cualquiera puede
-- actualizar esta fila, PERO solo Supervisor/Administrador puede tocar
-- estas 2 columnas puntuales" -- eso es una restricción por COLUMNA, y
-- RLS en Postgres solo filtra por FILA. El trigger es el mecanismo real
-- que hace cumplir esto a nivel de base, no solo en la UI.
-- ---------------------------------------------------------------------
alter table migracion_slots enable row level security;

create policy migracion_slots_select on migracion_slots for select
  using (auth.uid() is not null);
create policy migracion_slots_insert on migracion_slots for insert
  with check (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));
create policy migracion_slots_update on migracion_slots for update
  using (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));

create or replace function migracion_slots_forzar_confirmacion_rol()
returns trigger as $$
begin
  if (new.confirmado_por is distinct from old.confirmado_por
      or new.confirmado_en is distinct from old.confirmado_en)
     and rol_actual() not in ('Supervisor', 'Administrador') then
    raise exception 'Solo Supervisor o Administrador puede confirmar un slot como finalizado.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_migracion_slots_confirmacion on migracion_slots;
create trigger trg_migracion_slots_confirmacion
  before update on migracion_slots
  for each row execute function migracion_slots_forzar_confirmacion_rol();

-- ---------------------------------------------------------------------
-- migracion_auditoria -- append-only (mismo criterio que `auditoria`):
-- cualquier rol operativo puede INSERTAR un evento, nadie actualiza ni
-- borra (sin policies de UPDATE/DELETE = denegado por defecto con RLS
-- activo).
-- ---------------------------------------------------------------------
alter table migracion_auditoria enable row level security;

create policy migracion_auditoria_select on migracion_auditoria for select
  using (auth.uid() is not null);
create policy migracion_auditoria_insert on migracion_auditoria for insert
  with check (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));

-- ---------------------------------------------------------------------
-- migracion_buffer -- cualquier rol operativo puede dejar artículos,
-- confirmarlos en lote (ver migracion_slots_forzar_confirmacion_rol,
-- que corre en la tabla de slots, no acá) y marcarlos purgados.
-- ---------------------------------------------------------------------
alter table migracion_buffer enable row level security;

create policy migracion_buffer_select on migracion_buffer for select
  using (auth.uid() is not null);
create policy migracion_buffer_insert on migracion_buffer for insert
  with check (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));
create policy migracion_buffer_update on migracion_buffer for update
  using (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));

-- ---------------------------------------------------------------------
-- migracion_purgas -- mismo criterio: cualquier rol operativo genera y
-- resuelve una tarea de purga.
-- ---------------------------------------------------------------------
alter table migracion_purgas enable row level security;

create policy migracion_purgas_select on migracion_purgas for select
  using (auth.uid() is not null);
create policy migracion_purgas_insert on migracion_purgas for insert
  with check (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));
create policy migracion_purgas_update on migracion_purgas for update
  using (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));
