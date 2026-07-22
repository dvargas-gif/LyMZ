-- =====================================================================
-- El cupo de 3 equipos concurrentes protege el BUFFER FÍSICO -- un rack
-- que HOY ya está vacío (nada real bajo su vieja identidad RCL) nunca
-- ocupa un carro de buffer, así que no debería competir por ese mismo
-- cupo. Pedido explícito del usuario 2026-07-22: "sé que hay racks
-- vacíos, ¿por qué no los movés también?".
--
-- Sin este archivo, aunque planificarSecuencia.js (ver
-- opciones.racksSinContenido) ya sugiera ese rack de más, el trigger de
-- cupo de la base (2026-07-17_migracion_cupo_aprobacion.sql) lo iba a
-- desviar igual a 'esperando_aprobacion' apenas los 3 cupos reales
-- estuvieran ocupados -- el candado real vive acá, no en el cliente.
--
-- Mismo cruce que ya hace contenidoActualDeRacks() en JS
-- (generarLoteDespacho.js): identidad_legacy (asignado, subnivel 1) +
-- inventario_rcl_actual (cantidad > 0) para ESTE mz_pasillo/mz_columna.
-- =====================================================================

create or replace function migracion_slots_forzar_cupo_equipos()
returns trigger as $$
declare
  activos int;
  tiene_contenido_real boolean;
begin
  if new.estado = 'vaciando'
     and (tg_op = 'INSERT' or old.estado not in ('vaciando', 'recolectando')) then

    select exists (
      select 1
      from identidad_legacy il
      join inventario_rcl_actual ir
        on ir.rcl_codigo = il.rcl_codigo
        and ir.rcl_nivel = il.rcl_nivel
        and ir.rcl_subnivel = il.rcl_subnivel
      where il.mz_pasillo = new.mz_pasillo
        and il.mz_columna = new.mz_columna
        and il.estado_rcl = 'asignado'
        and il.rcl_subnivel = 1
        and ir.cantidad > 0
    ) into tiene_contenido_real;

    -- Rack ya vacío: no consume cupo, arranca directo (nunca queda
    -- 'esperando_aprobacion' por este motivo) -- se salta todo el resto
    -- del chequeo de cupo de abajo.
    if not tiene_contenido_real then
      return new;
    end if;

    perform pg_advisory_xact_lock(hashtext('migracion_cupo_equipos'));

    select count(*) into activos
      from migracion_slots
      where estado in ('vaciando', 'recolectando')
        and id is distinct from coalesce(new.id, -1);

    if activos >= 3 then
      raise exception 'Cupo lleno -- ya hay 3 equipos trabajando en simultáneo. Esperá a que se libere uno.';
    elsif activos >= 1 and (tg_op = 'INSERT' or old.estado is distinct from 'esperando_aprobacion') then
      new.estado := 'esperando_aprobacion';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- El trigger ya existe (2026-07-17_migracion_cupo_aprobacion.sql) -- `create
-- or replace function` alcanza, no hace falta recrear el trigger en sí.
