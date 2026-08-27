-- =====================================================================
-- Zonas de pick -- agrega la ubicación RCL asignada como cara de pick
-- (sesión 2026-08-24, pedido explícito de David: "esta será la base de lo
-- que vive o no ahora"). No necesariamente hay stock real ahí en este
-- momento -- es la posición designada, la reposición eventualmente lleva
-- el artículo ahí. Columna nullable a propósito: los artículos ya
-- importados (2026-08-22, sin esta columna) se completan solos la próxima
-- vez que se vuelva a subir el archivo, por el upsert por artículo.
-- =====================================================================
alter table zonas_pick add column if not exists ubicacion_rcl text;
