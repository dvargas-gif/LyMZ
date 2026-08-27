-- =====================================================================
-- Reconciliación "ya migrado" (sesión 2026-08-25, pedido explícito de
-- David tras ver filas rechazadas del import de Inventario RCL cuya
-- ubicación ya venía en formato MZ en vez de RCL -- señal de que el
-- artículo se movió físicamente antes de que el sistema lo confirmara).
--
-- Tabla propia, append-only, PURAMENTE INFORMATIVA -- ni el motor de
-- migración ni Despacho la leen. No gatea ni condiciona "mover a
-- voluntad" (mapa) ni ninguna otra funcionalidad, a propósito (pedido
-- explícito de David).
--
-- `movimiento_id` referencia el movimiento de migracion_movimientos que
-- se pudo matchear (si lo hubo) -- puede ser null (veredicto
-- 'sin_registro' o 'requiere_revision_manual', ver
-- inventarioRcl.service.js/resolverEstadoYaMigrado).
--
-- `veredicto` y `accion_tomada` son dos cosas distintas: `veredicto` es
-- el diagnóstico (qué se encontró), `accion_tomada` es qué hizo la app
-- con eso (ej. veredicto='pendiente_para_confirmar' ->
-- accion_tomada='marcado_recolectado'; veredicto='sin_registro' ->
-- accion_tomada='registrado_como_hallazgo').
-- =====================================================================

create table if not exists migracion_ya_migrado (
  id                 bigserial primary key,
  mz_pasillo         text not null,
  mz_columna         int not null,
  mz_nivel           int,
  mz_subnivel        int,
  articulo           text not null,
  cantidad_detectada numeric not null default 0,
  movimiento_id      bigint references migracion_movimientos(id),
  veredicto          text not null check (veredicto = any (array[
                       'confirmado', 'pendiente_para_confirmar', 'requiere_revision_manual', 'sin_registro'
                     ])),
  accion_tomada      text not null,
  detectado_por      uuid references profiles(id),
  detectado_en       timestamptz not null default now()
);
create index if not exists idx_migracion_ya_migrado_destino
  on migracion_ya_migrado(mz_pasillo, mz_columna, articulo);

alter table migracion_ya_migrado enable row level security;
create policy migracion_ya_migrado_select on migracion_ya_migrado for select
  using (auth.uid() is not null);
-- Mismo corte que el import de Inventario RCL en sí: Supervisor/Administrador.
create policy migracion_ya_migrado_insert on migracion_ya_migrado for insert
  with check (rol_actual() in ('Supervisor', 'Administrador'));
