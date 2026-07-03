-- SOLO LECTURA — no modifica nada. Correr en el SQL Editor de Supabase y
-- pegarme el resultado tal cual (todas las filas) para poder versionar acá
-- las políticas RLS reales de las tablas que hoy están "[NO VERSIONADO]"
-- en db/schema.sql: profiles, posiciones_actuales, bloqueos, auditoria,
-- articulos_info, inventario_slotting, config_mapa, escenario_posiciones,
-- escenario_eliminados.

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,           -- select | insert | update | delete | all
  qual,          -- condición USING
  with_check     -- condición WITH CHECK
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- De paso, esto confirma en qué tablas está prendido RLS (independiente de
-- si tienen políticas o no — una tabla con RLS prendido y CERO políticas
-- rechaza todo, lo cual también es información importante de versionar):
select relname as tabla, relrowsecurity as rls_activo
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
