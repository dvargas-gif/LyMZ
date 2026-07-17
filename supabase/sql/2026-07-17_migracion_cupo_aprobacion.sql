-- =====================================================================
-- Capacidad de buffer POR EQUIPO ACTIVO (F2, ver DECISIONES.md ADR-015 y
-- la sesión 2026-07-17): el buffer rodante físico es de 2 cuerpos = 10
-- niveles por equipo. Hasta 3 equipos concurrentes (30 niveles) -- el 1ro
-- arranca libre, el 2do y el 3ro necesitan aprobación de Supervisor o
-- Administrador (se reutiliza el rol Supervisor, no se agrega uno nuevo).
-- Un 4to intento se rechaza hasta que se libere un cupo.
--
-- "Equipo activo" = una fila de migracion_slots en 'vaciando' o
-- 'recolectando' -- mismo grano que el resto del flujo guiado, sin tabla
-- nueva.
-- =====================================================================

-- 1) Nuevo estado + columnas de aprobación.
alter table migracion_slots drop constraint if exists migracion_slots_estado_valido;
alter table migracion_slots add constraint migracion_slots_estado_valido
  check (estado in ('pendiente', 'esperando_aprobacion', 'vaciando', 'recolectando', 'bloqueado', 'confirmado'));

alter table migracion_slots add column if not exists aprobado_por uuid references profiles(id);
alter table migracion_slots add column if not exists aprobado_en timestamptz;

-- ---------------------------------------------------------------------
-- 2) Enforcement del cupo -- NO alcanza con contar desde el cliente (dos
-- operadores clickeando "Iniciar traslado" al mismo instante pueden pasar
-- el cheque los dos a la vez, condición de carrera real). Se serializa con
-- un advisory lock transaccional (mismo idioma Postgres que el resto de
-- este archivo, sin infraestructura nueva) antes de contar y decidir.
--
-- Solo entra en juego cuando la fila está por QUEDAR en 'vaciando' y viene
-- de FUERA del conjunto activo (insert nuevo, o aprobación desde
-- 'esperando_aprobacion') -- revertirAVaciando (recolectando->vaciando)
-- no consume cupo nuevo: ese equipo ya estaba contado como activo.
-- ---------------------------------------------------------------------
create or replace function migracion_slots_forzar_cupo_equipos()
returns trigger as $$
declare
  activos int;
begin
  if new.estado = 'vaciando'
     and (tg_op = 'INSERT' or old.estado not in ('vaciando', 'recolectando')) then

    perform pg_advisory_xact_lock(hashtext('migracion_cupo_equipos'));

    select count(*) into activos
      from migracion_slots
      where estado in ('vaciando', 'recolectando')
        and id is distinct from coalesce(new.id, -1);

    if activos >= 3 then
      raise exception 'Cupo lleno -- ya hay 3 equipos trabajando en simultáneo. Esperá a que se libere uno.';
    elsif activos >= 1 and (tg_op = 'INSERT' or old.estado is distinct from 'esperando_aprobacion') then
      -- 2do/3er equipo intentando arrancar DIRECTO (no viene de una
      -- aprobación ya otorgada) -- se desvía a la cola en vez de arrancar.
      new.estado := 'esperando_aprobacion';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_migracion_slots_cupo on migracion_slots;
create trigger trg_migracion_slots_cupo
  before insert or update on migracion_slots
  for each row execute function migracion_slots_forzar_cupo_equipos();

-- ---------------------------------------------------------------------
-- 3) Rol para aprobar -- mismo patrón que
-- migracion_slots_forzar_confirmacion_rol (2026-07-13_migracion_rcl_mz_rls.sql):
-- RLS no distingue por columna, así que el trigger es el mecanismo real.
-- ---------------------------------------------------------------------
create or replace function migracion_slots_forzar_aprobacion_rol()
returns trigger as $$
begin
  if (new.aprobado_por is distinct from old.aprobado_por
      or new.aprobado_en is distinct from old.aprobado_en)
     and rol_actual() not in ('Supervisor', 'Administrador') then
    raise exception 'Solo Supervisor o Administrador puede aprobar un equipo adicional.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_migracion_slots_aprobacion on migracion_slots;
create trigger trg_migracion_slots_aprobacion
  before update on migracion_slots
  for each row execute function migracion_slots_forzar_aprobacion_rol();

-- Sin cambios de RLS de INSERT/UPDATE/DELETE: las policies de
-- 2026-07-13_migracion_rcl_mz_rls.sql / 2026-07-15_migracion_estados_check.sql
-- ya cubren Operador/Supervisor/Administrador sobre la fila completa --
-- "rechazar" una solicitud propia usa el mismo DELETE que ya existe para
-- cancelar (mismo criterio: cualquier rol operativo puede retirar SU
-- propio traslado, esté esperando aprobación o ya en curso).
