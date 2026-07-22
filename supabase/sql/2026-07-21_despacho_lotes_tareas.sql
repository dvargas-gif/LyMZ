-- =====================================================================
-- Módulo de Despacho (sesión 2026-07-21, ver DECISIONES.md): reparto de
-- una oleada de migración entre trabajadores de piso NUMERADOS (no son
-- cuentas de la app, no tienen PIN ni login -- el "cabecilla de equipo",
-- que sí usa la app, genera una hoja de trabajo impresa por trabajador y
-- va confirmando tarea por tarea a medida que reportan avance).
--
-- Este archivo NO toca ninguna tabla `migracion_*` existente -- solo las
-- referencia por FK y las actualiza con los MISMOS valores que ya
-- escribiría un operador humano usando el flujo guiado del mapa (ver
-- flujoMigracionSlot.js/migracionSlots.service.js/migracionBuffer.service.js
-- -- Despacho llama la misma máquina de estados, no otra paralela).
--
-- Corrección post-revisión (misma sesión): la primera versión de este
-- archivo NO tocaba migracion_slots/migracion_buffer para nada -- confirmar
-- una tarea "vaciar" no movía nada real. Esta versión lo corrige: "vaciar"
-- ahora es por ARTÍCULO (igual de granular que "recolectar"), y confirmar
-- una tarea hace exactamente lo mismo que el botón equivalente del mapa
-- haría a mano.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lote de despacho -- una fila por oleada generada. Solo puede haber
-- UN lote activo a la vez en todo el sistema (índice único parcial más
-- abajo) -- esto reemplaza cualquier candado fino por artículo: mientras
-- el lote 1 no se cierre, no se puede generar el lote 2, así que nunca
-- hay dos oleadas compitiendo por el mismo artículo.
-- ---------------------------------------------------------------------
create table if not exists despacho_lotes (
  id                    bigserial primary key,
  generado_por          uuid references profiles(id),
  generado_en           timestamptz not null default now(),
  cantidad_operadores   int not null check (cantidad_operadores between 1 and 20),
  estado                text not null default 'activo' check (estado in ('activo', 'cerrado')),
  cerrado_por           uuid references profiles(id),
  cerrado_en            timestamptz
);
-- Singleton por predicado: un índice único parcial sobre una expresión
-- constante ('activo') hace que, entre las filas que matchean el WHERE,
-- Postgres nunca permita una segunda -- mismo valor de clave, choca la
-- unicidad. No hace falta una tabla de "estado global" aparte.
create unique index if not exists idx_despacho_lotes_un_activo
  on despacho_lotes ((estado)) where estado = 'activo';

-- ---------------------------------------------------------------------
-- 2. Tarea de despacho -- una fila por tarea asignada a UN número de
-- trabajador dentro de un lote. Ambos tipos son por ARTÍCULO:
--   'vaciar'     -- sacar ESTE artículo (bajo su identidad RCL vieja) del
--                   rack destino y dejarlo en el buffer.
--   'recolectar' -- traer ESTE artículo (migracion_movimientos) desde su
--                   origen hacia el rack destino.
-- ---------------------------------------------------------------------
create table if not exists despacho_tareas (
  id                  bigserial primary key,
  lote_id             bigint not null references despacho_lotes(id),
  trabajador_numero   int not null check (trabajador_numero >= 0),
  orden               int not null,
  tipo                text not null check (tipo in ('vaciar', 'recolectar')),
  mz_pasillo          text not null,
  mz_columna          int not null,
  movimiento_id       bigint references migracion_movimientos(id),  -- solo 'recolectar'
  -- Identidad del artículo -- para 'recolectar' es el ORIGEN (de dónde se
  -- trae); para 'vaciar' es la identidad RCL vieja del propio rack que se
  -- está vaciando (de ahí se resuelve migracion_buffer.origen_rcl_codigo).
  -- Snapshot, mismo criterio que migracion_buffer.origen_rcl_codigo
  -- (congelado como un hecho del pasado, evita depender de un join a
  -- migracion_movimientos/inventario_rcl_actual -- mismo problema de
  -- relación de PostgREST que ya documenta migracionBuffer.service.js).
  articulo            text not null,
  rcl_codigo          text,
  rcl_nivel           text,
  cantidad            numeric,  -- solo 'vaciar' (lo que depositará en migracion_buffer)
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'cancelada')),
  resuelto_por        uuid references profiles(id),
  resuelto_en         timestamptz,
  check (
    (tipo = 'vaciar' and movimiento_id is null)
    or
    (tipo = 'recolectar' and movimiento_id is not null)
  )
);
create index if not exists idx_despacho_tareas_lote
  on despacho_tareas(lote_id, trabajador_numero, orden);
-- Refuerzo de integridad a nivel de base (defensa en profundidad -- el
-- generador en generarLoteDespacho.js ya garantiza esto por construcción):
-- un movimiento de recolección no puede tener dos tareas PENDIENTES a la vez.
create unique index if not exists idx_despacho_tareas_movimiento_pendiente_unico
  on despacho_tareas(movimiento_id) where movimiento_id is not null and estado = 'pendiente';
-- Mismo refuerzo para 'vaciar' -- no hay un FK natural (no hay fila propia
-- para "este artículo en este rack" en ninguna tabla existente), así que la
-- identidad se arma con la misma tupla que identifica al artículo dentro
-- del rack.
create unique index if not exists idx_despacho_tareas_vaciar_pendiente_unico
  on despacho_tareas(mz_pasillo, mz_columna, rcl_codigo, rcl_nivel, articulo)
  where tipo = 'vaciar' and estado = 'pendiente';

-- ---------------------------------------------------------------------
-- 3. RLS -- mismo criterio que migracion_slots/migracion_buffer: lectura
-- abierta a cualquier autenticado, alta para cualquier rol operativo. El
-- UPDATE de fila completa se deja SOLO para Supervisor/Administrador
-- (cerrar lote, cancelar una tarea/lote puntual) -- la confirmación normal
-- de una tarea NUNCA pasa por un UPDATE directo del cliente, sino por el
-- RPC de abajo (security definer), que además sincroniza
-- migracion_slots/migracion_buffer/migracion_movimientos en la misma
-- transacción.
-- ---------------------------------------------------------------------
alter table despacho_lotes enable row level security;
create policy despacho_lotes_select on despacho_lotes for select
  using (auth.uid() is not null);
create policy despacho_lotes_insert on despacho_lotes for insert
  with check (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));
create policy despacho_lotes_update on despacho_lotes for update
  using (rol_actual() in ('Supervisor', 'Administrador'));

alter table despacho_tareas enable row level security;
create policy despacho_tareas_select on despacho_tareas for select
  using (auth.uid() is not null);
create policy despacho_tareas_insert on despacho_tareas for insert
  with check (rol_actual() in ('Operador', 'Supervisor', 'Administrador'));
create policy despacho_tareas_update on despacho_tareas for update
  using (rol_actual() in ('Supervisor', 'Administrador'));

-- ---------------------------------------------------------------------
-- 4. Confirmar UNA tarea (lo que el cabecilla de equipo hace, una por una,
-- a medida que el trabajador de piso reporta que terminó). Todo en una
-- transacción, replicando EXACTAMENTE lo que el flujo guiado del mapa hace
-- a mano:
--   'recolectar' -- migracion_movimientos.estado -> recolectado; si era el
--                   último pendiente del rack, migracion_slots
--                   recolectando -> bloqueado (paso 3, ver
--                   flujoMigracionSlot.todoRecolectado()).
--   'vaciar'     -- INSERT en migracion_buffer (como
--                   migracionBufferService.depositar()); si era el último
--                   artículo por vaciar del rack EN ESTE LOTE,
--                   migracion_slots vaciando -> recolectando + confirmación
--                   en lote del buffer (como marcarVaciadoCompleto() +
--                   confirmarLotePorSlot(), incluyendo el evento de
--                   auditoría que referencia lote_confirmacion_id).
--
-- El resto de la app (mapa, flujo guiado, Panel de Migración) no necesita
-- saber que Despacho existe -- ve avanzar la migración real exactamente
-- igual que si el operador lo hubiera hecho a mano.
--
-- `for update` sobre la fila de despacho_tareas serializa dos clicks en
-- carrera sobre la MISMA tarea (mismo idioma que
-- migracion_slots_forzar_cupo_equipos) -- el segundo la encuentra
-- 'estado <> pendiente' y falla con un mensaje claro, en vez de doble
-- confirmar.
--
-- Nota deliberada: la resolución de `migracion_buffer.movimiento_id` (a
-- qué movimiento pendiente corresponde este artículo depositado) NO se
-- reimplementa acá -- queda NULL y se resuelve después, del lado de
-- despacho.service.js, llamando a migracionBufferService.revincularConPlan()
-- (la misma función que ya usa el resto de la app), para no duplicar esa
-- lógica de desambiguación en SQL.
-- ---------------------------------------------------------------------
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

    insert into migracion_buffer (articulo, cantidad, slot_origen_id, origen_nivel, origen_sub_nivel, origen_rcl_codigo, operador_id)
      values (v_articulo, coalesce(v_cantidad, 0), v_slot_id, v_rcl_nivel, 1, v_rcl_codigo, v_uid);

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
-- 5. Cancelar UNA tarea -- solo Supervisor/Administrador (mismo corte de
-- rol que confirmar_migracion). No toca ninguna tabla migracion_* -- si
-- era 'recolectar', ese artículo simplemente queda pendiente para una
-- oleada futura; si era 'vaciar', ese artículo sigue en el rack de origen
-- (nunca se llegó a depositar en el buffer).
-- ---------------------------------------------------------------------
create or replace function cancelar_tarea_despacho(p_tarea_id bigint)
returns void as $$
begin
  if rol_actual() not in ('Supervisor', 'Administrador') then
    raise exception 'Solo Supervisor o Administrador puede cancelar una tarea de despacho.';
  end if;

  update despacho_tareas
    set estado = 'cancelada', resuelto_por = auth.uid(), resuelto_en = now()
    where id = p_tarea_id and estado = 'pendiente';
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- 6. Cancelar el LOTE ENTERO -- pedido explícito (2026-07-21): descartar
-- un lote generado por error (cantidad de operadores equivocada, por
-- ejemplo) sin tener que cancelar tarea por tarea. Cancela todo lo
-- pendiente y cierra el lote en un solo paso -- lo que YA se confirmó
-- (artículos ya depositados/recolectados de verdad) no se toca ni se
-- deshace, solo se detiene lo que faltaba.
-- ---------------------------------------------------------------------
create or replace function cancelar_lote_despacho(p_lote_id bigint)
returns void as $$
begin
  if rol_actual() not in ('Supervisor', 'Administrador') then
    raise exception 'Solo Supervisor o Administrador puede cancelar un lote de despacho completo.';
  end if;

  update despacho_tareas
    set estado = 'cancelada', resuelto_por = auth.uid(), resuelto_en = now()
    where lote_id = p_lote_id and estado = 'pendiente';

  update despacho_lotes
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_lote_id and estado = 'activo';
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- 7. Cerrar el lote activo -- el paso de "auditoría" que el cabecilla de
-- equipo hace al terminar toda la oleada (todas las tareas confirmadas, o
-- canceladas una por una vía la función 5). Distinto de
-- cancelar_lote_despacho: acá se exige que NO quede nada pendiente.
-- ---------------------------------------------------------------------
create or replace function cerrar_lote_despacho(p_lote_id bigint)
returns void as $$
declare
  v_pendientes int;
begin
  if rol_actual() not in ('Supervisor', 'Administrador') then
    raise exception 'Solo Supervisor o Administrador puede cerrar un lote de despacho.';
  end if;

  select count(*) into v_pendientes from despacho_tareas where lote_id = p_lote_id and estado = 'pendiente';
  if v_pendientes > 0 then
    raise exception 'Quedan % tarea(s) sin confirmar o cancelar.', v_pendientes;
  end if;

  update despacho_lotes
    set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now()
    where id = p_lote_id and estado = 'activo';
end;
$$ language plpgsql security definer;
