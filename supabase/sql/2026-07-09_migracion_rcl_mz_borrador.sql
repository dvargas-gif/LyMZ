-- =====================================================================
-- Schema F1 -- primer paso de la migración de nomenclatura RCL -> MZ (ver
-- DECISIONES.md/PROGRESO.md de la sesión 2026-07-09/2026-07-13). Forma
-- confirmada por el usuario -- sin RLS en este archivo a propósito (ver
-- 2026-07-13_migracion_rcl_mz_rls.sql), siguiendo el mismo patrón que
-- pasillos_config/escenarios/posiciones_eliminadas (comentario explícito
-- de qué rol puede hacer qué, antes de escribir la política).
--
-- Contexto de negocio: los racks del mezanine ya están físicamente donde
-- dice el plano nuevo (MZ01-MZ12) -- lo que falta migrar es el NOMBRE de
-- cada posición (venía de RCL##) y el CONTENIDO (artículos correctos
-- según el nuevo plan de slotting, no los heredados del sistema viejo).
-- Ninguna tabla existente se modifica -- todo lo de abajo es nuevo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identidad legacy por POSICIÓN -- la "tabla maestra" que el usuario
-- está armando a mano (RCL<->MZ a nivel de sub-posición). Independiente
-- de inventario_slotting.rack_actual (que es la ubicación RCL actual de
-- un ARTÍCULO, no de una posición) -- decisión explícita, no se cruzan
-- automáticamente entre sí.
-- ---------------------------------------------------------------------
create table if not exists identidad_legacy (
  mz_pasillo    text not null,
  mz_columna    int  not null,
  rcl_codigo    text not null unique,    -- tal cual, ej. "RCL121-C001" -- 1 a 1 estricto: un RCL
                                          -- repetido en dos MZ es un error de captura que el
                                          -- import debe LISTAR, nunca resolver en silencio.
  importado_por uuid references profiles(id),
  importado_en  timestamptz not null default now(),
  primary key (mz_pasillo, mz_columna)
);

-- ---------------------------------------------------------------------
-- 2. Plan de movimientos -- salida del cruce manual (tabla de acomodo
-- objetivo x tabla de inventario actual, ambas hechas a mano por ahora).
-- Un destino MZ puede recibir de N orígenes RCL -- "orden" es la
-- secuencia (1,2,3...) en que el operador debe recolectarlos (paso 2 del
-- flujo guiado).
-- ---------------------------------------------------------------------
create table if not exists migracion_movimientos (
  id               bigserial primary key,
  mz_pasillo       text not null,
  mz_columna       int  not null,
  mz_nivel         text,
  rcl_codigo       text not null,
  rcl_nivel        text,
  articulo         text not null,
  cantidad         numeric not null default 0,
  orden            int not null,
  estado           text not null default 'pendiente', -- pendiente | recolectado
  recolectado_por  uuid references profiles(id),
  recolectado_en   timestamptz,
  importado_por    uuid references profiles(id),
  importado_en     timestamptz not null default now()
);
create index if not exists idx_migracion_movimientos_destino
  on migracion_movimientos(mz_pasillo, mz_columna);
-- Índice para la auto-resolución del buffer por código de artículo (ver
-- migracion_buffer.movimiento_id abajo) -- el caso normal busca acá por
-- `articulo`, no por ubicación de origen.
create index if not exists idx_migracion_movimientos_articulo
  on migracion_movimientos(articulo);

-- ---------------------------------------------------------------------
-- 3. Estado de migración por SLOT MZ -- máquina de estados del flujo
-- guiado. Independiente de `bloqueos`/`escenario_bloqueos` (que son un
-- lock operativo genérico ya existente, no se toca ni se reutiliza para
-- esto -- significan cosas distintas).
-- ---------------------------------------------------------------------
create table if not exists migracion_slots (
  id              bigserial unique,  -- surrogate solo para que migracion_buffer.slot_origen_id
                                       -- pueda referenciar una fila puntual con un solo FK -- la
                                       -- clave natural sigue siendo (mz_pasillo, mz_columna), acá
                                       -- abajo, sin cambiar ningún otro lugar que ya la use así.
  mz_pasillo      text not null,
  mz_columna      int  not null,
  estado          text not null default 'pendiente',
    -- pendiente | vaciando | recolectando | bloqueado | confirmado
  iniciado_por    uuid references profiles(id),
  iniciado_en     timestamptz,       -- pendiente -> vaciando ("Iniciar traslado")
  vaciado_en      timestamptz,       -- vaciando -> recolectando: el rack quedó en 0 artículos.
                                      -- ESTE es el instante que dispara la confirmación en LOTE
                                      -- de todo lo que esa vaciada dejó en migracion_buffer (ver
                                      -- migracion_buffer.confirmado_en/lote_confirmacion_id abajo)
                                      -- -- no hay confirmación por artículo en tiempo real.
  bloqueado_por   uuid references profiles(id),   -- operador cierra su parte (paso 3)
  bloqueado_en    timestamptz,
  confirmado_por  uuid references profiles(id),   -- supervisor/administrador confirma (paso 4)
  confirmado_en   timestamptz,
  primary key (mz_pasillo, mz_columna)
);

-- ---------------------------------------------------------------------
-- 4. Auditoría dedicada por slot -- eventos del flujo guiado (vaciado,
-- recolección, bloqueo, confirmación). Tabla propia, NO se reutiliza
-- `auditoria` (esta necesita referenciar el slot MZ y su progreso, no
-- solo un movimiento origen/destino puntual). Vista agregada (por turno,
-- por supervisor) queda para una fase posterior -- esta forma ya la
-- soporta sin cambio de schema cuando haga falta.
--
-- Definida ANTES que el buffer (sección 5) a propósito: migracion_buffer
-- referencia un evento de acá (lote_confirmacion_id) -- Postgres necesita
-- que la tabla referenciada ya exista.
-- ---------------------------------------------------------------------
create table if not exists migracion_auditoria (
  id           bigserial primary key,
  mz_pasillo   text not null,
  mz_columna   int  not null,
  evento       text not null,
    -- vaciado_articulo | vaciado_completo | recoleccion | bloqueo | confirmacion
  detalle      text,
  usuario_id   uuid references profiles(id),
  fecha_hora   timestamptz not null default now()
);
create index if not exists idx_migracion_auditoria_slot
  on migracion_auditoria(mz_pasillo, mz_columna);

-- ---------------------------------------------------------------------
-- 5. Buffer -- 1 fila por artículo dejado temporalmente mientras se vacía
-- un slot destino (paso 1 del flujo guiado).
-- ---------------------------------------------------------------------
create table if not exists migracion_buffer (
  id                  bigserial primary key,
  articulo            text not null,
  cantidad            numeric not null default 0,
  slot_origen_id      bigint not null references migracion_slots(id),
    -- el slot MZ que se está vaciando -- reemplaza los campos sueltos
    -- origen_mz_pasillo/columna del borrador anterior: ahora es un FK real,
    -- la posición se obtiene por join a migracion_slots (mz_pasillo/mz_columna).
  origen_nivel        text,     -- nivel del rack de origen (N01-N05/CUERPO)
  origen_sub_nivel    text,     -- sub-posición dentro de ese nivel -- mismo concepto que el
                                 -- sufijo final de "RCLxxx-Cxxx-Nxx-x" (ver ADR-013), acá explícito
  origen_rcl_codigo   text,  -- snapshot de identidad_legacy AL MOMENTO de dejarlo en el buffer
                              -- (denormalizado a propósito: el paso 4 "retira formalmente la
                              -- identidad RCL" de ese slot -- si solo se guardara la referencia
                              -- al slot MZ y se resolviera el RCL por join en el momento de leer,
                              -- la trazabilidad histórica de ESTE artículo perdería su origen RCL
                              -- en cuanto el slot se confirme. Se congela acá, como un hecho del
                              -- pasado, igual que rack_actual ya es un dato congelado en
                              -- inventario_slotting -- mismo criterio, no se inventa uno nuevo)
  movimiento_id       bigint references migracion_movimientos(id),
    -- NULL = caso excepción: el artículo no está en la tabla de acomodo
    -- objetivo, "sin destino asignado -- requiere revisión manual"
    -- (visible en el panel de alertas, bloquea la purga de ESTE ítem
    -- puntual). Se resuelve automáticamente por `articulo` al insertar,
    -- no a mano y no por ubicación de origen (confirmado con el usuario).
  operador_id         uuid references profiles(id),   -- quién lo dejó en el buffer
  dejado_en           timestamptz not null default now(),
  confirmado_en        timestamptz,  -- NULL hasta que el slot de origen pase vaciando->recolectando
                                       -- (migracion_slots.vaciado_en) -- se completa en LOTE para
                                       -- TODAS las filas de ese slot_origen_id a la vez, nunca por
                                       -- artículo en tiempo real (spec sección 5).
  lote_confirmacion_id bigint references migracion_auditoria(id),
    -- referencia al evento puntual (evento='vaciado_completo') que hizo esa confirmación en
    -- lote -- todas las filas confirmadas juntas por el mismo vaciado apuntan al mismo id
  purgado             boolean not null default false,
  purgado_en          timestamptz
);
create index if not exists idx_migracion_buffer_operador
  on migracion_buffer(operador_id) where not purgado;
create index if not exists idx_migracion_buffer_destino
  on migracion_buffer(movimiento_id) where not purgado;
create index if not exists idx_migracion_buffer_origen
  on migracion_buffer(slot_origen_id) where confirmado_en is null;
-- Antigüedad (ver conversación de esta sesión sobre el riesgo de "bodega
-- transitoria" silenciosa): la purga automática se dispara por CUALQUIERA
-- de dos condiciones -- más de 10 artículos en el mismo destino (ya
-- modelado, ver migracion_purgas), O el artículo más viejo del destino
-- lleva más de un umbral configurable de horas. Ambas son cálculos
-- derivados sobre `dejado_en`/`confirmado_en` -- no se persiste ningún
-- flag de "viejo" ni se agrega columna nueva para esto.
create index if not exists idx_migracion_buffer_antiguedad
  on migracion_buffer(dejado_en) where not purgado;
-- NOTA: el umbral de >100 códigos sin resolver por operador y el umbral
-- de >10 por MZ destino (ver migracion_purgas) son DERIVADOS -- se
-- calculan con un count() sobre estos índices, nunca se persiste un flag
-- de "operador bloqueado" (Ley 3 del proyecto: derivados nunca persistidos).

-- ---------------------------------------------------------------------
-- 6. Cola de tareas de purga -- generada cuando un mismo MZ destino
-- acumula >10 artículos en el buffer. No interrumpe al operador con un
-- traslado en curso -- queda en cola aparte.
-- ---------------------------------------------------------------------
create table if not exists migracion_purgas (
  id                    bigserial primary key,
  mz_destino_pasillo    text not null,
  mz_destino_columna    int  not null,
  cantidad_en_buffer    int  not null,
  generada_en           timestamptz not null default now(),
  atendida_por          uuid references profiles(id),
  atendida_en           timestamptz,
  estado                text not null default 'pendiente' -- pendiente | resuelta
);
create index if not exists idx_migracion_purgas_pendientes
  on migracion_purgas(estado) where estado = 'pendiente';

-- =====================================================================
-- RLS de estas 6 tablas: ver 2026-07-13_migracion_rcl_mz_rls.sql
-- (archivo separado, decisiones de rol ya confirmadas por el usuario).
-- =====================================================================
