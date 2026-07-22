-- =====================================================================
-- Deshacer un lote de Despacho POR COMPLETO (sesión 2026-07-22) -- pedido
-- explícito: antes de la presentación/pruebas de piso del jueves, el
-- usuario va a generar 10-12 lotes de prueba y necesita poder volver el
-- sistema a un estado limpio ("impoluto") después de cada uno.
--
-- `cancelar_lote_despacho` (2026-07-21) NO alcanza para esto: solo cancela
-- tareas todavía PENDIENTES -- lo que ya se confirmó (artículos realmente
-- depositados en migracion_buffer, movimientos realmente marcados
-- recolectado, slots realmente creados en migracion_slots) se queda tal
-- cual. Esto sí lo deshace todo, incluso lo confirmado.
--
-- Requiere saber QUÉ fila de migracion_buffer nació de QUÉ tarea de
-- despacho -- de ahí la columna nueva `despacho_tarea_id` (nullable, no
-- rompe nada existente, mismo criterio que la ya existente
-- `lote_confirmacion_id` de esa misma tabla).
-- =====================================================================

alter table migracion_buffer add column if not exists despacho_tarea_id bigint references despacho_tareas(id);
create index if not exists idx_migracion_buffer_despacho_tarea on migracion_buffer(despacho_tarea_id) where despacho_tarea_id is not null;

-- La inserción de migracion_buffer para tareas 'vaciar' ahora sí guarda de
-- qué tarea vino -- se reemplaza la función completa (mismo cuerpo que
-- 2026-07-21_despacho_lotes_tareas.sql, solo se agrega despacho_tarea_id
-- al insert).
create or replace function confirmar_tarea_despacho(p_tarea_id bigint)
returns void as $$
declare
  v_tipo text;
  v_movimiento_id bigint;
  v_mz_pasillo text;
  v_mz_columna int;
  v_rcl_codigo text;
  v_rcl_nivel text;
  v_articulo text;
  v_cantidad numeric;
  v_lote_id bigint;
  v_uid uuid := auth.uid();
  v_slot_id bigint;
  v_pendientes_restantes int;
  v_evento_id bigint;
begin
  if rol_actual() not in ('Operador', 'Supervisor', 'Administrador') then
    raise exception 'No tenés permiso para confirmar tareas de despacho.';
  end if;

  select tipo, movimiento_id, mz_pasillo, mz_columna, rcl_codigo, rcl_nivel, articulo, cantidad, lote_id
    into v_tipo, v_movimiento_id, v_mz_pasillo, v_mz_columna, v_rcl_codigo, v_rcl_nivel, v_articulo, v_cantidad, v_lote_id
    from despacho_tareas
    where id = p_tarea_id and estado = 'pendiente'
    for update;

  if not found then
    raise exception 'La tarea no existe o ya fue resuelta.';
  end if;

  update despacho_tareas
    set estado = 'confirmada', resuelto_por = v_uid, resuelto_en = now()
    where id = p_tarea_id;

  if v_tipo = 'recolectar' then
    update migracion_movimientos
      set estado = 'recolectado', recolectado_por = v_uid, recolectado_en = now()
      where id = v_movimiento_id and estado = 'pendiente';

    select count(*) into v_pendientes_restantes
      from migracion_movimientos
      where mz_pasillo = v_mz_pasillo and mz_columna = v_mz_columna and estado = 'pendiente';

    if v_pendientes_restantes = 0 then
      update migracion_slots
        set estado = 'bloqueado', bloqueado_por = v_uid, bloqueado_en = now()
        where mz_pasillo = v_mz_pasillo and mz_columna = v_mz_columna and estado = 'recolectando';
    end if;

  elsif v_tipo = 'vaciar' then
    select id into v_slot_id from migracion_slots where mz_pasillo = v_mz_pasillo and mz_columna = v_mz_columna;
    if v_slot_id is null then
      raise exception 'No existe el traslado (migracion_slots) para % - % -- el lote de despacho no lo inició correctamente.', v_mz_pasillo, v_mz_columna;
    end if;

    insert into migracion_buffer (articulo, cantidad, slot_origen_id, origen_nivel, origen_sub_nivel, origen_rcl_codigo, operador_id, despacho_tarea_id)
      values (v_articulo, coalesce(v_cantidad, 0), v_slot_id, v_rcl_nivel, 1, v_rcl_codigo, v_uid, p_tarea_id);

    select count(*) into v_pendientes_restantes
      from despacho_tareas
      where lote_id = v_lote_id and tipo = 'vaciar' and mz_pasillo = v_mz_pasillo and mz_columna = v_mz_columna and estado = 'pendiente';

    if v_pendientes_restantes = 0 then
      insert into migracion_auditoria (mz_pasillo, mz_columna, evento, detalle, usuario_id)
        values (v_mz_pasillo, v_mz_columna, 'vaciado_completo', 'Vaciado vía Módulo de Despacho', v_uid)
        returning id into v_evento_id;

      update migracion_slots
        set estado = 'recolectando', vaciado_en = now()
        where id = v_slot_id and estado = 'vaciando';

      update migracion_buffer
        set confirmado_en = now(), lote_confirmacion_id = v_evento_id
        where slot_origen_id = v_slot_id and confirmado_en is null;
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- Deshacer el lote ENTERO -- revierte todo lo que este lote haya hecho
-- de verdad en migracion_movimientos/migracion_buffer/migracion_slots, y
-- borra el lote y sus tareas (no queda ni el registro de que existió --
-- a propósito, es para limpiar pruebas antes del jueves, no para
-- auditoría de lo que sí fue real).
--
-- Nota deliberada: NO se tocan los eventos ya escritos en
-- migracion_auditoria ("vaciado_completo") -- esa tabla es append-only
-- por diseño (ver 2026-07-13_migracion_rcl_mz_rls.sql), no se le agrega
-- una excepción de borrado acá.
--
-- Si algo de lo que este lote tocó ya avanzó por fuera de Despacho (ej.
-- alguien confirmó el slot como 'confirmado' a mano desde el mapa antes de
-- deshacer), el `delete` de migracion_slots simplemente no encuentra la
-- fila en el estado esperado y esa parte queda como está -- no se fuerza.
-- ---------------------------------------------------------------------
create or replace function deshacer_lote_despacho(p_lote_id bigint)
returns void as $$
declare
  v_rack record;
begin
  if rol_actual() not in ('Supervisor', 'Administrador') then
    raise exception 'Solo Supervisor o Administrador puede deshacer un lote de despacho completo.';
  end if;

  -- 1) Revertir cada 'recolectar' confirmado -> el movimiento vuelve a pendiente.
  update migracion_movimientos m
    set estado = 'pendiente', recolectado_por = null, recolectado_en = null
    from despacho_tareas t
    where t.lote_id = p_lote_id and t.tipo = 'recolectar' and t.estado = 'confirmada'
      and m.id = t.movimiento_id;

  -- 2) Borrar cada depósito de buffer que este lote generó (por 'vaciar' confirmado).
  delete from migracion_buffer
    where despacho_tarea_id in (
      select id from despacho_tareas where lote_id = p_lote_id and tipo = 'vaciar' and estado = 'confirmada'
    );

  -- 3) Por cada rack (mz_pasillo, mz_columna) que este lote tocó, borrar el
  -- slot -- ya no debería quedar buffer de este lote ahí (paso 2), y si el
  -- rack no tenía ya un movimiento recolectado por fuera de esta prueba, el
  -- borrado es seguro. Si falla por alguna referencia real que no es de
  -- esta prueba, toda la transacción se revierte -- no queda un estado a medias.
  for v_rack in
    select distinct mz_pasillo, mz_columna from despacho_tareas where lote_id = p_lote_id
  loop
    delete from migracion_slots where mz_pasillo = v_rack.mz_pasillo and mz_columna = v_rack.mz_columna;
  end loop;

  delete from despacho_tareas where lote_id = p_lote_id;
  delete from despacho_lotes where id = p_lote_id;
end;
$$ language plpgsql security definer;
