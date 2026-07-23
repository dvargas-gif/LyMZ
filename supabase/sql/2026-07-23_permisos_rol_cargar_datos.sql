-- =====================================================================
-- Agrega la acción 'cargar_datos' a la matriz editable de permisos_rol
-- (ver 2026-07-23_permisos_rol.sql) -- nace de fusionar "Importar datos de
-- migración" + "Carga masiva de posiciones" en una sola página ("Cargas e
-- importaciones", pedido explícito 2026-07-23), ambas ya restringidas a
-- Admin/Supervisor. `on conflict do nothing`: seguro de aplicar tanto si
-- 2026-07-23_permisos_rol.sql ya corrió como si no.
-- =====================================================================
insert into permisos_rol (rol, accion, permitido) values
  ('Administrador', 'cargar_datos', true),
  ('Supervisor', 'cargar_datos', true),
  ('Operador', 'cargar_datos', false),
  ('Solo lectura', 'cargar_datos', false)
on conflict (rol, accion) do nothing;
