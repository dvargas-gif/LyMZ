-- =====================================================================
-- Fix de PK en inventario_rcl_actual (F1.5-B) -- la PK original
-- (rcl_codigo, rcl_nivel, rcl_subnivel) asumía UN artículo por
-- sub-posición. El archivo real del cliente muestra que un mismo nivel
-- puede compartirse entre varios artículos (normal en la operación real),
-- así que la PK necesita incluir `articulo` para no perder filas al
-- importar ni pisarlas en el upsert.
--
-- Seguro de correr aunque ya haya datos cargados: toda fila existente ya
-- cumple unicidad sobre las 3 columnas viejas, así que agregar una 4ta
-- columna a una PK compuesta nunca puede violar unicidad (un conjunto más
-- chico ya único sigue siendo único al agregarle una columna).
-- =====================================================================
alter table inventario_rcl_actual drop constraint inventario_rcl_actual_pkey;
alter table inventario_rcl_actual add primary key (rcl_codigo, rcl_nivel, rcl_subnivel, articulo);
