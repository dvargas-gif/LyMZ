-- Artículos "eliminados" del MAPA REAL (equivalente a escenario_eliminados,
-- pero para escenario_id = null -- no existía ningún mecanismo real de
-- eliminación hasta ahora, ver crearWarehouseModel.js/crearServiciosReales:
-- listarEliminados() devolvía siempre [] para el mapa real).
-- Ejecutar una sola vez en el SQL Editor del dashboard de Supabase.
-- No modifica ninguna tabla existente (inventario_slotting sigue siendo
-- solo lectura, posiciones_actuales solo pierde la fila de override si el
-- artículo ya había sido movido).

create table if not exists posiciones_eliminadas (
  articulo      text primary key,
  eliminado_por uuid references profiles(id),
  eliminado_en  timestamptz not null default now(),
  motivo        text
);
alter table posiciones_eliminadas enable row level security;

-- A diferencia de escenario_bloqueos/escenario_picks (Administrador Y
-- Supervisor), esto queda SOLO para Administrador -- saca artículos del
-- mapa real de forma difícil de revertir a mano, no es una acción de uso
-- diario de una sala de simulación.
create policy posiciones_eliminadas_select on posiciones_eliminadas for select
  using (rol_actual() = 'Administrador');
create policy posiciones_eliminadas_insert on posiciones_eliminadas for insert
  with check (rol_actual() = 'Administrador');
create policy posiciones_eliminadas_delete on posiciones_eliminadas for delete
  using (rol_actual() = 'Administrador');
