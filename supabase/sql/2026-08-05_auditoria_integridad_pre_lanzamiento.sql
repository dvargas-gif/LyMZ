-- =====================================================================
-- Auditoría de integridad de datos, previa al lanzamiento real de la
-- migración RCL -> MZ (pedido explícito 2026-08-05: "ya estamos a nada
-- de iniciar... necesito que analices entre tablas, a ver si tengo datos
-- referenciados en dos ubicaciones diferentes o si tenemos algunos
-- repetidos").
--
-- SOLO LECTURA -- cada bloque es un SELECT que devuelve ÚNICAMENTE las
-- filas problemáticas. Si un bloque no devuelve filas, ese chequeo pasó
-- limpio. Correr uno por uno en el SQL Editor de Supabase (no hace falta
-- todo de una vez) y pegar acá cualquier resultado no vacío para
-- interpretarlo junto con el negocio detrás.
--
-- Hallazgo de contexto (no es un chequeo, es la razón de fondo de varios
-- de los de abajo): `inventario_slotting` -- la tabla que TODO el resto de
-- la app trata como "la fuente real" -- no tiene ningún PK ni índice único
-- (ver db/schema.sql). Nada en la base impide un artículo duplicado o
-- repartido en dos posiciones a la vez; por eso los chequeos A1-A3 importan
-- tanto como los que cruzan contra otras tablas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- A1) Mismo artículo en 2+ posiciones distintas de inventario_slotting.
-- Un artículo no puede estar físicamente en dos racks a la vez -- si esto
-- devuelve filas, cualquier pantalla que muestre "dónde vive X" puede estar
-- mostrando el lugar equivocado sin que nadie lo note.
-- ---------------------------------------------------------------------
select articulo, count(*) as filas, array_agg(distinct pasillo || '-C' || columna::text || '-' || coalesce(nivel,'?')) as posiciones
from inventario_slotting
where pasillo is not null and columna is not null
group by articulo
having count(distinct pasillo || '|' || columna::text || '|' || coalesce(nivel,'')) > 1;


-- ---------------------------------------------------------------------
-- A2) Filas EXACTAMENTE duplicadas en inventario_slotting (mismo artículo,
-- misma posición, mismo tipo, repetido) -- típico de un re-import corrido
-- dos veces. Duplica de más el volumen/consumo que calcula cualquier
-- reporte de capacidad, sin que exista ninguna unidad física extra real.
-- ---------------------------------------------------------------------
select articulo, pasillo, columna, nivel, tipo, count(*) as veces_repetida
from inventario_slotting
group by articulo, pasillo, columna, nivel, tipo
having count(*) > 1;


-- ---------------------------------------------------------------------
-- A3) inventario_slotting con pasillo o columna sin dato -- filas "plan"
-- sin ubicación real. El operador ve un card vacío en el Mapa y puede
-- creer que el sistema no cargó el dato, cuando en realidad nunca tuvo
-- ubicación asignada.
-- ---------------------------------------------------------------------
select articulo, pasillo, columna, nivel, tipo
from inventario_slotting
where pasillo is null or columna is null;


-- ---------------------------------------------------------------------
-- B1) inventario_slotting con una columna que no existe en el croquis real
-- (pasillos_config.max_columna) -- el plan le asigna un lugar a un artículo
-- que no está dibujado en el Mapa.
-- ---------------------------------------------------------------------
select s.articulo, s.pasillo, s.columna, pc.max_columna
from inventario_slotting s
left join pasillos_config pc on pc.pasillo = s.pasillo
where s.pasillo is not null and (pc.pasillo is null or s.columna > pc.max_columna);


-- ---------------------------------------------------------------------
-- B2) Mismo chequeo, sobre identidad_legacy (mz_pasillo/mz_columna fuera
-- del croquis real).
-- ---------------------------------------------------------------------
select il.mz_pasillo, il.mz_columna, il.mz_nivel, il.mz_subnivel, pc.max_columna
from identidad_legacy il
left join pasillos_config pc on pc.pasillo = il.mz_pasillo
where pc.pasillo is null or il.mz_columna > pc.max_columna;


-- ---------------------------------------------------------------------
-- C1) Stock real HOY (inventario_rcl_actual, cantidad > 0) en una
-- sub-posición RCL que identidad_legacy NUNCA vio -- peor que
-- "pendiente_asignar" (que al menos fue reconocida): acá no hay ninguna
-- fila que diga a qué MZ debería ir. Es la lista fina de "sin ubicación"
-- (la que se viene armando a mano) directo desde la base.
-- ---------------------------------------------------------------------
select r.rcl_codigo, r.rcl_nivel, r.rcl_subnivel, r.articulo, r.cantidad
from inventario_rcl_actual r
where r.cantidad > 0
  and not exists (
    select 1 from identidad_legacy il
    where il.rcl_codigo = r.rcl_codigo and il.rcl_nivel = r.rcl_nivel and il.rcl_subnivel = r.rcl_subnivel
  );


-- ---------------------------------------------------------------------
-- C2) identidad_legacy con estado_rcl='asignado' (promete una posición RCL
-- real) cuya sub-posición NO existe en absoluto en inventario_rcl_actual --
-- distinto de "cantidad=0" (que al menos tiene fila). Candidata a mapeo
-- obsoleto: la identidad dice que ahí hay un RCL real, pero no hay ningún
-- dato de stock para cruzarla.
-- ---------------------------------------------------------------------
select il.mz_pasillo, il.mz_columna, il.mz_nivel, il.mz_subnivel, il.rcl_codigo, il.rcl_nivel, il.rcl_subnivel
from identidad_legacy il
where il.estado_rcl = 'asignado'
  and not exists (
    select 1 from inventario_rcl_actual r
    where r.rcl_codigo = il.rcl_codigo and r.rcl_nivel = il.rcl_nivel and r.rcl_subnivel = il.rcl_subnivel
  );


-- ---------------------------------------------------------------------
-- D1) Mismo artículo con descripción DISTINTA en articulos_info vs
-- articulo_dimensiones -- dos importaciones independientes, sin ninguna
-- sincronización entre sí. El operador ve dos nombres distintos para el
-- mismo código según qué pantalla mira.
-- ---------------------------------------------------------------------
select ai.articulo, ai.descripcion as descripcion_articulos_info, ad.descripcion as descripcion_dimensiones
from articulos_info ai
join articulo_dimensiones ad on ad.articulo = ai.articulo
where ai.descripcion is distinct from ad.descripcion;


-- ---------------------------------------------------------------------
-- D2) Artículos en inventario_slotting SIN fila en articulo_dimensiones --
-- detectarSobrecargaRacks.js los salta en silencio (sin volumen no puede
-- calcular nada), así que un rack real sobrecargado con ese artículo NUNCA
-- se va a detectar, y nada le avisa a nadie que quedó afuera del chequeo.
-- ---------------------------------------------------------------------
select distinct s.articulo
from inventario_slotting s
where not exists (select 1 from articulo_dimensiones ad where ad.articulo = s.articulo);


-- ---------------------------------------------------------------------
-- E1) profiles.rol con un valor que no es uno de los 4 documentados -- no
-- hay ningún CHECK a nivel de base que lo obligue. Como TODAS las políticas
-- RLS del proyecto filtran por rol_actual() in (...), un rol mal escrito
-- bloquea silenciosamente todas las escrituras de ese usuario, sin ningún
-- error claro para nadie.
-- ---------------------------------------------------------------------
select id, nombre, email, rol
from profiles
where rol not in ('Administrador', 'Supervisor', 'Operador', 'Solo lectura');


-- ---------------------------------------------------------------------
-- E2) inventario_rcl_actual con cantidad negativa -- no hay CHECK que lo
-- impida. Una suma agregada real del stock restante quedaría mal, aunque
-- cada consumidor puntual trate "cantidad <= 0" igual que "sin stock".
-- ---------------------------------------------------------------------
select rcl_codigo, rcl_nivel, rcl_subnivel, articulo, cantidad
from inventario_rcl_actual
where cantidad < 0;


-- ---------------------------------------------------------------------
-- E3) despacho_tareas tipo='vaciar', activa (no cancelada), con cantidad
-- sin dato o cero -- no hay CHECK que lo exija. confirmar_tarea_despacho()
-- hace coalesce(cantidad, 0), así que en vez de fallar, deposita una fila
-- "fantasma" de cantidad cero en migracion_buffer.
-- ---------------------------------------------------------------------
select id, lote_id, mz_pasillo, mz_columna, articulo, cantidad, estado
from despacho_tareas
where tipo = 'vaciar' and estado <> 'cancelada' and (cantidad is null or cantidad <= 0);


-- ---------------------------------------------------------------------
-- F1) despacho_tareas tipo='recolectar', ya 'confirmada', cuyo
-- migracion_movimientos NO quedó en 'recolectado' -- confirmar_tarea_despacho()
-- debe sincronizar ambas en la misma transacción; un desajuste significa
-- que Despacho dice "listo" pero el motor real de migración todavía lo ve
-- pendiente.
-- ---------------------------------------------------------------------
select dt.id as tarea_id, dt.mz_pasillo, dt.mz_columna, dt.articulo, mm.id as movimiento_id, mm.estado as estado_movimiento
from despacho_tareas dt
join migracion_movimientos mm on mm.id = dt.movimiento_id
where dt.tipo = 'recolectar' and dt.estado = 'confirmada' and mm.estado <> 'recolectado';


-- ---------------------------------------------------------------------
-- F2) migracion_buffer sin purgar cuyo movimiento_id ya está 'recolectado'
-- por otro camino -- ese destino del plan ya se llenó, pero este ítem del
-- buffer sigue apuntando a un pedido ya cerrado (puede pasar tras
-- regenerar el plan sin volver a correr revincularConPlan()). Queda
-- invisible en los conteos de "pendiente".
-- ---------------------------------------------------------------------
select mb.id as buffer_id, mb.articulo, mb.cantidad, mb.movimiento_id, mm.estado as estado_movimiento
from migracion_buffer mb
join migracion_movimientos mm on mm.id = mb.movimiento_id
where not mb.purgado and mm.estado = 'recolectado';
