-- Fase 1 (bug crítico #4): "Añadir rack" no debe poder reducir un pasillo,
-- no debe aceptar valores <= 0, y dos administradores extendiendo el mismo
-- pasillo a la vez no deben poder pisarse silenciosamente.
--
-- Por qué un CHECK + TRIGGER en la base, y no un RPC:
-- Un trigger BEFORE UPDATE ve el valor OLD recién confirmado en el momento
-- exacto en que cada UPDATE se ejecuta -- Postgres ya serializa los UPDATE
-- concurrentes sobre la MISMA fila (toma el lock de a uno). Eso alcanza para
-- cerrar la condición de carrera sin tocar pasillosConfigService.extender()
-- ni AddRackModal.jsx: el upsert() que ya usan sigue funcionando igual,
-- porque Postgres SÍ dispara BEFORE UPDATE en la rama "DO UPDATE" de un
-- upsert. Es la opción más chica: 1 constraint + 1 función + 1 trigger,
-- cero cambios de código en el cliente.
--
-- Se mantiene además el chequeo en AddRackModal.jsx (feedback inmediato sin
-- ida y vuelta al servidor) -- este SQL es el que de verdad garantiza la
-- regla pase lo que pase (RLS bypass, llamada directa a la API, otro admin
-- en simultáneo, etc.).

-- 1) Nunca <= 0, para cualquier fila (nueva o existente), venga de donde venga.
alter table pasillos_config drop constraint if exists pasillos_config_max_columna_positivo;
alter table pasillos_config add constraint pasillos_config_max_columna_positivo check (max_columna > 0);

-- 2) Nunca puede REDUCIRSE una fila ya existente (extender, no encoger).
create or replace function evitar_reducir_pasillo()
returns trigger
language plpgsql
as $$
begin
  if new.max_columna < old.max_columna then
    raise exception 'No se puede reducir "%": ya llega hasta C0%, se intentó bajarlo a C0%', old.pasillo, old.max_columna, new.max_columna;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evitar_reducir_pasillo on pasillos_config;
create trigger trg_evitar_reducir_pasillo
  before update on pasillos_config
  for each row execute function evitar_reducir_pasillo();

-- 3) El trigger de arriba solo ve pasillos que YA tienen fila en esta tabla.
--    Un pasillo que nunca se extendió no tiene fila todavía -- su límite de
--    hoy vive solo hardcodeado en el código (MAXCOL_MZ01=27 en el mapa
--    legacy, y el mismo valor en AddRackModal.jsx). Si alguien insertara esa
--    PRIMERA fila con un valor más bajo (saltándose el modal), el trigger no
--    tendría un "antes" con qué compararlo y no lo frenaría.
--    Se siembran los 8 pasillos con su valor real de HOY para que a partir de
--    acá toda extensión sea siempre un UPDATE, protegido sin excepción.
--    "on conflict do nothing": si un pasillo ya tiene fila (por ejemplo si ya
--    extendiste MZ01 antes), esta siembra NO la toca ni la pisa.
insert into pasillos_config (pasillo, max_columna) values
  ('MZ01', 27),
  ('MZ02', 36),
  ('MZ03', 36),
  ('MZ04', 36),
  ('MZ05', 36),
  ('MZ06', 36),
  ('MZ07', 36),
  ('MZ08', 36)
on conflict (pasillo) do nothing;

-- ============================================================
-- ROLLBACK (correr esto para deshacer TODO lo de este archivo)
-- ============================================================
-- drop trigger if exists trg_evitar_reducir_pasillo on pasillos_config;
-- drop function if exists evitar_reducir_pasillo();
-- alter table pasillos_config drop constraint if exists pasillos_config_max_columna_positivo;
-- -- Las filas sembradas en el paso 3 NO se borran en el rollback a propósito:
-- -- son el mismo valor que ya usaba el código como default, borrarlas no
-- -- cambia el comportamiento visible, solo destaparía de nuevo el hueco del
-- -- primer insert. Si de verdad querés vaciarlas:
-- -- delete from pasillos_config where pasillo in ('MZ01','MZ02','MZ03','MZ04','MZ05','MZ06','MZ07','MZ08') and actualizado_por is null;
