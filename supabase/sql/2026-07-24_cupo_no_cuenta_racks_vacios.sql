-- =====================================================================
-- Corrección real del cupo de equipos concurrentes (sesión 2026-07-23/24)
-- -- reemplaza la función creada en 2026-07-22_cupo_ignora_racks_vacios.sql,
-- que tenía un bug real encontrado en uso real durante las pruebas de piso.
--
-- El bug: esa primera versión dejaba pasar un rack "sin contenido real"
-- (vacío) SIN pedirle cupo a él mismo -- pero la fila que ese insert
-- dejaba en migracion_slots (estado 'vaciando') igual quedaba ahí, y el
-- conteo de cupo para los PRÓXIMOS inserts contaba CUALQUIER fila en
-- vaciando/recolectando, sin distinguir cuáles habían entrado gratis. Con
-- una oleada que mete primero todos los racks vacíos (sin límite) y recién
-- después los que sí necesitan cupo real, para cuando le tocaba el turno a
-- un rack con contenido real, el conteo ya estaba inflado por los racks
-- vacíos anteriores -- "Cupo lleno" salía SIEMPRE, sin importar cuántas
-- veces se reintentara generar la orden (mismo cálculo, mismo resultado).
--
-- El fix: en vez de contar cualquier fila en vaciando/recolectando, el
-- conteo vuelve a evaluar EN VIVO si cada una de esas filas todavía tiene
-- contenido real -- así un rack que entró gratis nunca cuenta para el
-- cupo, ni para sí mismo ni para los que se insertan después. Confirmado
-- en uso real: con este cambio aplicado, Orden #9 se generó bien (8
-- racks, incluido uno que antes quedaba afuera).
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

    if not tiene_contenido_real then
      return new;
    end if;

    perform pg_advisory_xact_lock(hashtext('migracion_cupo_equipos'));

    -- Antes esto contaba CUALQUIER fila en vaciando/recolectando, incluidos
    -- los racks "libres" que entraron gratis -- por eso se inflaba el cupo
    -- con cada rack vacío insertado antes que este. Ahora solo cuenta las
    -- filas que TODAVÍA tienen contenido real de verdad en este momento.
    select count(*) into activos
      from migracion_slots ms
      where ms.estado in ('vaciando', 'recolectando')
        and ms.id is distinct from coalesce(new.id, -1)
        and exists (
          select 1
          from identidad_legacy il2
          join inventario_rcl_actual ir2
            on ir2.rcl_codigo = il2.rcl_codigo
            and ir2.rcl_nivel = il2.rcl_nivel
            and ir2.rcl_subnivel = il2.rcl_subnivel
          where il2.mz_pasillo = ms.mz_pasillo
            and il2.mz_columna = ms.mz_columna
            and il2.estado_rcl = 'asignado'
            and il2.rcl_subnivel = 1
            and ir2.cantidad > 0
        );

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
