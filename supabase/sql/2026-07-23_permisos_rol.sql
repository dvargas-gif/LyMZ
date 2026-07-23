-- =====================================================================
-- Permisos editables por rol (pedido explícito 2026-07-23: "poder dar
-- todos los permisos y acciones por separado" desde la pantalla de
-- usuarios, sin abrir un modal). El modelo SIGUE siendo por rol (4 roles
-- fijos, cada usuario tiene UNO) -- lo que cambia es que la matriz de qué
-- puede hacer cada rol deja de ser SOLO un archivo (roles.js) y pasa a
-- poder editarse en vivo desde la UI, guardada acá.
--
-- roles.js sigue siendo la fuente de verdad de QUÉ ACCIONES EXISTEN (y el
-- valor por defecto/fallback si esta tabla no existe todavía o la carga
-- falla) -- esta tabla solo guarda el sí/no editable de cada combinación
-- rol+acción. Seedeada abajo con EXACTAMENTE los valores que ya tenía
-- roles.js al momento de este archivo, así que aplicar este script no
-- cambia ningún comportamiento hasta que alguien toque un checkbox.
--
-- IMPORTANTE -- alcance real de esto: estas filas controlan qué ve y qué
-- botones puede intentar cada rol en la INTERFAZ (lo mismo que ya hacía
-- roles.js). La mayoría de las acciones operativas (migrar_slot,
-- confirmar_migracion, generar_despacho, confirmar_tarea_despacho,
-- cerrar_lote_despacho, eliminar_articulos, administrar_usuarios, etc.)
-- ADEMÁS están reforzadas de forma fija en triggers/RPCs de esta base
-- (`rol_actual() in (...)` hardcodeado en cada función, ver los SQL de
-- cada módulo) -- desmarcar una acción acá oculta el botón/pantalla, pero
-- NO cambia ese refuerzo del lado de la base. Volver ESO dinámico también
-- es un trabajo aparte (tocar cada función una por una).
-- =====================================================================

create table if not exists permisos_rol (
  rol       text not null,
  accion    text not null,
  permitido boolean not null default false,
  primary key (rol, accion)
);

alter table permisos_rol enable row level security;

create policy permisos_rol_select on permisos_rol for select
  using (auth.uid() is not null);
create policy permisos_rol_write on permisos_rol for all
  using (rol_actual() = 'Administrador')
  with check (rol_actual() = 'Administrador');

-- Seed: mismos valores que la matriz PERMISOS de roles.js al 2026-07-23.
-- `on conflict do nothing` -- si este script se reaplica sobre una tabla
-- que ya tiene ediciones reales de un Administrador, no las pisa.
insert into permisos_rol (rol, accion, permitido) values
  ('Administrador', 'ver_mapa', true),
  ('Administrador', 'mover', true),
  ('Administrador', 'usar_salas', true),
  ('Administrador', 'ver_dashboard', true),
  ('Administrador', 'ver_historial', true),
  ('Administrador', 'ver_auditoria', true),
  ('Administrador', 'administrar_usuarios', true),
  ('Administrador', 'exportar', true),
  ('Administrador', 'eliminar_articulos', true),
  ('Administrador', 'migrar_slot', true),
  ('Administrador', 'confirmar_migracion', true),
  ('Administrador', 'generar_despacho', true),
  ('Administrador', 'confirmar_tarea_despacho', true),
  ('Administrador', 'cerrar_lote_despacho', true),
  ('Administrador', 'usar_mensajes', true),

  ('Supervisor', 'ver_mapa', true),
  ('Supervisor', 'mover', true),
  ('Supervisor', 'usar_salas', true),
  ('Supervisor', 'ver_dashboard', true),
  ('Supervisor', 'ver_historial', true),
  ('Supervisor', 'ver_auditoria', true),
  ('Supervisor', 'administrar_usuarios', false),
  ('Supervisor', 'exportar', true),
  ('Supervisor', 'eliminar_articulos', false),
  ('Supervisor', 'migrar_slot', true),
  ('Supervisor', 'confirmar_migracion', true),
  ('Supervisor', 'generar_despacho', true),
  ('Supervisor', 'confirmar_tarea_despacho', true),
  ('Supervisor', 'cerrar_lote_despacho', true),
  ('Supervisor', 'usar_mensajes', true),

  ('Operador', 'ver_mapa', true),
  ('Operador', 'mover', false),
  ('Operador', 'usar_salas', false),
  ('Operador', 'ver_dashboard', false),
  ('Operador', 'ver_historial', false),
  ('Operador', 'ver_auditoria', false),
  ('Operador', 'administrar_usuarios', false),
  ('Operador', 'exportar', false),
  ('Operador', 'eliminar_articulos', false),
  ('Operador', 'migrar_slot', true),
  ('Operador', 'confirmar_migracion', false),
  ('Operador', 'generar_despacho', true),
  ('Operador', 'confirmar_tarea_despacho', true),
  ('Operador', 'cerrar_lote_despacho', false),
  ('Operador', 'usar_mensajes', true),

  ('Solo lectura', 'ver_mapa', true),
  ('Solo lectura', 'mover', false),
  ('Solo lectura', 'usar_salas', false),
  ('Solo lectura', 'ver_dashboard', true),
  ('Solo lectura', 'ver_historial', true),
  ('Solo lectura', 'ver_auditoria', false),
  ('Solo lectura', 'administrar_usuarios', false),
  ('Solo lectura', 'exportar', false),
  ('Solo lectura', 'eliminar_articulos', false),
  ('Solo lectura', 'migrar_slot', false),
  ('Solo lectura', 'confirmar_migracion', false),
  ('Solo lectura', 'generar_despacho', false),
  ('Solo lectura', 'confirmar_tarea_despacho', false),
  ('Solo lectura', 'cerrar_lote_despacho', false),
  ('Solo lectura', 'usar_mensajes', true)
on conflict (rol, accion) do nothing;
