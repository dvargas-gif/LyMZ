# DECISIONES.md — Registro de decisiones de arquitectura (ADR corto)

> Formato: Contexto → Decisión → Consecuencias. Toda desviación de las Leyes de la Arquitectura (ver prompt de gobierno) se registra ACÁ antes de implementarse, no después.

---

## ADR-000 — Adopción del protocolo de gobierno para la evolución a Digital Twin

**Fecha:** 2026-07-06

**Contexto:** El proyecto tiene aprobado evolucionar de WMS a Digital Twin (ver documento de arquitectura "De WMS a Digital Twin del Almacén"). El riesgo de una evolución multi-fase sin estructura es perder contexto entre sesiones, reescribir por impulso, o duplicar lógica de negocio sin darse cuenta — exactamente el problema que ya existe hoy entre el mapa legacy y `reporteService` (ver más abajo).

**Decisión:** Se adopta el protocolo de 4 archivos (`PROGRESO.md`, `DECISIONES.md`, `DOMAIN.md`, `BACKLOG-MIGRACION.md`) + compuertas de aprobación G0-G6 + las 10 leyes no negociables (cero reescrituras oportunistas, Modelo≠Vista, derivados nunca persistidos, un solo suscriptor de Realtime, modelo como proyección reconstruible, RLS/schema intocables sin aprobación, motores puros, restricciones como datos, IA nunca decide, animaciones como consecuencia).

**Consecuencias:** Cada sesión empieza leyendo `PROGRESO.md`, propone el siguiente paso y espera confirmación antes de escribir código. Cada fase tiene un gate de aprobación explícito. El costo es velocidad por sesión; el beneficio es que el sistema en producción nunca se degrada por un cambio no revisado.

---

## ADR-001 — El merge "base + overrides" está duplicado hoy entre el mapa legacy y React (hallazgo, no aún resuelto)

**Fecha:** 2026-07-06

**Contexto:** Durante la exploración de G0 se encontró que la lógica de "¿dónde está realmente el artículo X, dado el plan base y los movimientos guardados?" existe en DOS lugares independientes:

1. **Legacy** (`public/legacy/js/10-servicios.js`, función `aplicarPosicionGuardada`): recorre el objeto `CUERPOS` (definido en `public/legacy/js/01-datos.js`, ~270 KB, la "foto de fábrica" de 3016 artículos embebida como literal JS) buscando el artículo, lo saca de su rack de origen, y lo inserta en el destino guardado. Es una mutación in-place sobre el estado del mapa.
2. **React** (`src/features/reportes/reporte.service.js`, función `reporteService.obtener()`): reconstruye el mismo resultado consultando `inventario_slotting` (tabla Postgres, presumiblemente la misma foto de fábrica que `CUERPOS`, pero en la base) + `posiciones_actuales` (overrides), usando un `Map` en JS. El comentario del propio archivo ya lo admite: *"Es la misma lógica que ya usa el mapa legacy (base + overrides), pero calculada acá..."*

Riesgo concreto: si un artículo queda en un estado borde (ej. "SIN UBICACIÓN ACTUAL", visto en los datos reales de `CUERPOS`), nada garantiza que ambas implementaciones lo resuelvan igual. Son ~20 líneas de lógica de negocio escritas dos veces, en dos lenguajes/paradigmas distintos, sin un test compartido.

Además: no está confirmado si `inventario_slotting` (tabla) y `CUERPOS` (JS estático) están sincronizados o si ya divergieron con el tiempo — es una pregunta abierta, no un hecho confirmado.

**Decisión:** Pendiente — este ADR documenta el hallazgo. La decisión de cómo resolverlo (extraer una función pura `resolverPosicionesActuales()` en el dominio, migrar `reporteService` a usarla, dejar el mapa legacy con su propia mutación de `CUERPOS` intacta para renderizado) se propone como primer paso de G1 y requiere aprobación explícita antes de tocar código.

**Consecuencias (si se aprueba la propuesta de G1):** Ninguna al mapa legacy (Ley 1: cero reescrituras oportunistas — su mutación de `CUERPOS` es interna, sirve solo para su propio render, no se toca). `reporteService.obtener()` pasa a llamar a la función del dominio en vez de reimplementar el merge. Queda una sola fuente de verdad para "base + overrides", testeada, que cualquier consumidor futuro (Dashboard-KPIs, 3D, simulación) puede reusar sin reimplementarla una tercera vez.

---

## ADR-002 — Creación formal de `MASTER-PROMPT.md` y subdivisión de la Fase 1 en 5 sub-etapas (G1a-G1e)

**Fecha:** 2026-07-06

**Contexto:** El mandato completo del proyecto (rol, leyes no negociables, protocolo de trabajo, fases G0-G6, criterios de aceptación, estándar de animaciones) existía únicamente en el historial de la conversación, no como archivo versionado — pese a que `PROGRESO.md` y otros ya lo referenciaban como si existiera (`MASTER-PROMPT.md`). Esto es un riesgo real: si se pierde el contexto de la sesión de chat, el gobierno del proyecto se pierde con él. Además, la evidencia recogida en G0 (ADR-001: lógica duplicada real entre el mapa legacy y `reporteService`; y una pregunta sin resolver sobre si `CUERPOS` e `inventario_slotting` siguen sincronizados) hizo evidente que construir `WarehouseModel` completo de una sola vez en la Fase 1, sin resolver antes esos dos puntos, sería diseñar sobre un supuesto no verificado.

**Decisión:** (a) Se crea `MASTER-PROMPT.md` en la raíz del repo, reconstruyendo fielmente el mandato acordado, como fuente de verdad versionada. (b) Se subdivide la Fase 1 en 5 sub-etapas secuenciales con mini-compuertas: **G1a** (resolver la sincronización `CUERPOS`/`inventario_slotting`), **G1b** (extraer `resolverPosicionesActuales()` y migrar `reporteService`, resolviendo ADR-001), **G1c** (inventario completo de lógica de negocio dentro del mapa legacy), **G1d** (`WarehouseModel` + `WarehouseSnapshot v1` con Zod), **G1e** (Dashboard migrado + `src/ui/motion/`). Los criterios de aceptación de la Fase 1 (sección 6.1 de `MASTER-PROMPT.md`) se verifican al cierre de G1e, no antes.

**Nota de numeración:** el usuario pidió documentar el hallazgo del diagnóstico G1a (`CUERPOS` vs `inventario_slotting`) específicamente como "ADR-002". Como esta entrada (creación de `MASTER-PROMPT.md` + subdivisión de Fase 1) también correspondía lógicamente a ese número por ser la siguiente decisión cronológica después de ADR-001, se le asignó ADR-002 a esta y **ADR-003** al hallazgo del diagnóstico — para no romper la secuencia ni sobrescribir un ADR ya escrito. Señalado explícitamente al usuario en el resumen de esta sesión (Ley/Protocolo 4.4: toda desviación se documenta y se informa).

**Consecuencias:** `MASTER-PROMPT.md` gobierna desde el repo, no desde la memoria de una sesión de chat. La Fase 1 avanza con checkpoints más chicos y reversibles en vez de un salto grande a `WarehouseModel` completo sin haber resuelto las dudas que la propia exploración encontró.

---

## ADR-003 — G1a: ¿`CUERPOS` e `inventario_slotting` siguen sincronizados? — **INCONCLUSO, bloqueado por RLS, con hallazgo colateral relevante**

**Fecha:** 2026-07-06

**Contexto:** Pregunta abierta de G0 (`BACKLOG-MIGRACION.md` #3): la geometría base del almacén vive en dos lugares — el literal `CUERPOS` (`public/legacy/js/01-datos.js`, estático, ~270 KB) y la tabla `inventario_slotting` (Supabase). `resolverPosicionesActuales()` (G1b) se construye sobre la que resulte autoritativa.

**Método:** Script puntual (ejecutado y luego borrado, no quedó como archivo permanente — solo este ADR es el registro): parseo de `CUERPOS` por conteo de llaves respetando strings (sin `eval`, sin tocar el archivo), aplanado a filas por artículo, y consulta de solo lectura a `inventario_slotting` vía el mismo cliente `@supabase/supabase-js` y el mismo anon key que ya usa la app (`.env` del propio proyecto — no se fabricó ninguna credencial nueva).

**Resultado de la mitad que SÍ se pudo verificar (lado `CUERPOS`, 100% local, sin red):**
- 3016 filas aplanadas, **3016 artículos únicos, 0 duplicados** — coincide exactamente con "la foto de fábrica de 3016 artículos" documentada en `db/schema.sql`. `CUERPOS` es internamente consistente.

**Resultado de la mitad que NO se pudo verificar (lado `inventario_slotting`):**
- La consulta a `inventario_slotting` devolvió **0 filas, sin error**. Antes de concluir "la tabla está vacía", se corrió un control: la misma consulta anónima contra `pasillos_config`, `articulos_info` y `posiciones_actuales` **también devolvió 0 filas y 0 en `count: 'exact'`, sin error, en las 4 tablas por igual**. `pasillos_config` en particular es una tabla que sabemos tiene datos reales en producción (`mensajesMapa.js` la usa para calcular `maxColumnas`, que resuelve el ancho real de cada pasillo — si estuviera vacía, "Añadir rack" y el renderizado de columnas estarían rotos hoy, y no lo están). Esto apunta con bastante confianza a que **el bloqueo es RLS sobre una sesión sin autenticar (anon), no que las tablas estén vacías** — consistente con que `db/schema.sql` marca la RLS de estas tablas como `[NO VERSIONADO]` (no confirmada desde el repo, no "no existe").
- **No se fabricó ninguna sesión autenticada para saltar esto** (regla explícita de esta tarea). El resultado es, honestamente, que **(a) cuántos artículos divergen y (b) el patrón de divergencia NO se pudieron medir** — no porque no se haya intentado, sino porque la única vía disponible (anon key, sin login) está bloqueada por el mismo mecanismo de seguridad que protege todo lo demás en la app (Ley 6: RLS intocable, y tampoco es el objetivo tocarla).

**(c) Recomendación fundamentada, con la evidencia disponible (parcial pero razonada):**

1. **`inventario_slotting` (la tabla) debería ser la fuente autoritativa de `posicionBase`** para el dominio, no `CUERPOS`. Motivo: es consultable, versionable con SQL, no requiere parsear un literal de 270 KB en cada consumidor nuevo (3D, simulación, optimización todos necesitarían repetir el parseo de `CUERPOS` si esa fuera la fuente). `CUERPOS` sigue siendo necesario para el mapa legacy (Ley 1: no se toca su render), pero como **copia de trabajo interna del mapa**, no como fuente de verdad del dominio.
2. **El dominio debe modelar `posicionBase` y `posicionActual` como conceptos distintos**, tal como el usuario planteó como hipótesis — y la evidencia estructural (no la de sincronización, que sigue pendiente) ya lo confirma: tanto el mapa legacy (`aplicarPosicionGuardada` sobre `CUERPOS`) como `reporteService.obtener()` (merge sobre `inventario_slotting`) YA tratan "base" y "overrides" como dos cosas separadas que se combinan en tiempo de lectura, nunca se mezclan de forma permanente. Es el mismo patrón implementado dos veces (ADR-001) — confirma la forma del modelo, independientemente del resultado de la comparación de valores.
3. **Hallazgo colateral que hay que escalar, no solo anotar:** si `inventario_slotting` estuviera realmente vacía en producción (no descartado del todo, solo hecho improbable por el control), `reporteService.obtener()` hoy mostraría reportes con solo los artículos que tengan alguna fila en `posiciones_actuales`, **perdiendo silenciosamente toda la base** — un bug de producción independiente de este roadmap, más urgente si resultara cierto. Ver "Próximo paso" abajo.

**Decisión:** Se pospone la decisión final de fuente autoritativa hasta confirmar los conteos reales. `resolverPosicionesActuales()` (G1b) NO arranca todavía sobre datos no verificados.

**Próximo paso concreto para desbloquear (elegí uno):**
- **Opción rápida (recomendada):** corré esto en el SQL Editor de Supabase (dashboard, no requiere terminal) y pegame el resultado — es de solo lectura, cero riesgo: `select count(*) as total, count(distinct articulo) as unicos from inventario_slotting;`
- **Opción completa:** si además querés la comparación campo a campo automática (no solo el conteo), puedo dejarte una consulta de solo lectura para correr vos mismo en el SQL Editor, o me das temporalmente una forma de autenticar (nunca credenciales fabricadas por mí).

**Consecuencias:** G1a queda **abierta, no completada** — se documenta así en `PROGRESO.md` en vez de marcarla completada, porque forzar un "completada" sin el dato real violaría el estándar de honestidad de este mismo protocolo. G1b espera a G1a.

---

## ADR-004 — Constante de capacidad de rack (4.5) pasa a configuración del modelo

**Fecha:** 2026-07-06

**Contexto:** `llenura(cu)` (`public/legacy/js/05-ayudantes.js:14-17`) usa `4.5` hardcodeado, con el comentario *"capacidad útil = 5 niveles × 0.90 = 4.5"*. Es un solo lugar, pero sin ningún punto de configuración — cambiar la capacidad real de un rack requeriría editar el mapa legacy directamente (prohibido sin aprobación, Ley 1).

**Decisión:** Se crea `src/domain/configuracionOcupacion.js` con `capacidadUtilRack: 4.5` como valor por defecto — **idéntico al actual, cero cambio de comportamiento**. Se simplifica a UN solo número configurable, no a los dos factores separados (`5 niveles` × `0.90`): en el código original nunca se usan por separado, solo el producto, así que separarlos habría sido estructura sin uso real, no fidelidad al original.

**Consecuencias:** `formulasOcupacion.llenura()` recibe la configuración como parámetro en vez de tener el número enterrado. El mapa legacy conserva su propia constante intacta (Ley 1) — las dos coexisten hasta que la Fase 2 decida si el mapa también pasa a leer esto del dominio.

---

## ADR-005 — Las tres escalas de umbral (rack/nivel/artículo) se preservan separadas, pero centralizadas

**Fecha:** 2026-07-06

**Contexto:** `INVENTARIO-LOGICA-MAPA.md` sección 1 documentó tres escalas de "cuánto es demasiado" en el mapa legacy: rack (`>1.0`/`>0.85`/`>0.4`, sobre la proporción de llenura), nivel (`>0.90` fijo, sobre el consumo agregado de un nivel) y artículo (`>0.90`/`>0.60`, sobre el consumo de un artículo individual). Había que decidir si colapsarlas en una sola escala configurable por contexto, o preservar las tres.

**Decisión:** Se preservan las **tres, separadas**, en `configuracionOcupacion.js` (`umbralRack`, `umbralNivelExcede`, `umbralArticulo`). Motivo: no miden lo mismo a distinta escala — rack mide sobrecarga AGREGADA del rack completo, nivel mide sobrecarga AGREGADA de un nivel solo, artículo mide CONCENTRACIÓN (cuánto de un nivel consume un solo artículo). Son tres señales de negocio distintas que comparten la misma unidad de base (fracciones de la capacidad de un nivel), pero colapsarlas en una escala única habría sido inventar una simplificación que el código original nunca tuvo — y el mandato de G1d es portar el comportamiento actual, no mejorarlo. Se prohíbe expresamente crear una cuarta escala nueva.

**Consecuencias:** Los tres umbrales viven en un solo archivo (antes estaban repartidos entre `05-ayudantes.js` y `07-render.js`, como números sueltos). Cualquier futura vista (3D, dashboard de KPIs) que necesite pintar alertas de ocupación consulta esta única fuente, no reinventa sus propios cortes.

---

## ADR-006 — `niveles_a_armar`: un nombre, un significado — el otro se renombra

**Fecha:** 2026-07-06

**Contexto:** El nombre `niveles_a_armar`/`nivelesArmar()` se usa hoy para DOS cosas distintas: (1) la columna de `inventario_slotting` — un valor congelado del plan de fábrica (cuántos niveles había que armar según el diseño original), y (2) `nivelesArmar(cu)` en `05-ayudantes.js:9-12` — un cálculo EN VIVO sobre `CUERPOS` (cuántos niveles tienen al menos un artículo AHORA, o 1 si es tipo CUERPO). Pueden divergir apenas un artículo se mueve, y usar el mismo nombre para ambos invita a asumir que son intercambiables.

**Decisión:** El nombre `niveles_a_armar` queda reservado exclusivamente para el valor de **`posicionBase`** (el dato crudo de `inventario_slotting`, sin tocar — es una columna real, no se renombra en la base). El cálculo en vivo se expone en el dominio bajo un nombre **distinto**: `nivelesOcupados()` (`src/domain/formulasOcupacion.js`) — nombre que además describe mejor lo que realmente calcula ("niveles con al menos un artículo ahora"), no lo que el nombre viejo sugería.

**Consecuencias:** Ningún consumidor futuro puede confundir "cuántos niveles había que armar según el plan original" con "cuántos niveles están ocupados ahora" — son dos campos con nombres distintos en el dominio, aunque en el mapa legacy compartían nombre. No se toca la columna real de Supabase ni el mapa legacy (Ley 1/6).

---

## ADR-007 — `exportar()` (mapa legacy): al backlog, no se toca en G1d

**Fecha:** 2026-07-06

**Contexto:** `INVENTARIO-LOGICA-MAPA.md` sección 4 encontró que `exportar()` (`public/legacy/js/11-buscar-exportar.js:15-33`) es una TERCERA implementación independiente de "aplanar el estado actual a filas" (además de `reporteService`/`resolverPosicionesActuales` y del propio render del mapa), con su propio formato de ubicación y una hoja "Cambios" que sale de un log en memoria de sesión, no de la auditoría real persistida.

**Decisión:** No se toca. Se agrega como ítem de `BACKLOG-MIGRACION.md` con prioridad, para cuando se diseñe la unificación de reportes/exportación (post Fase 2) — no es responsabilidad de G1d (que es solo dominio + Dashboard, no exportación) ni justifica tocar el mapa legacy sin ese diseño previo.

**Consecuencias:** Ninguna inmediata. Queda documentado para no perderlo de vista cuando llegue el momento.

---

## ADR-008 — La suscripción Realtime de `reporte.service.js` se mueve a una instancia compartida de `WarehouseModel`

**Fecha:** 2026-07-06

**Contexto:** Ley 4 (`MASTER-PROMPT.md`): "un solo suscriptor de Realtime: el modelo." Antes de G1d, `reporte.service.js` abría su propio canal de Supabase (`reporte-posiciones` / `reporte-escenario-{id}`) directamente. Si en el futuro Dashboard (G1e) o el bridge del mapa (Fase 2) necesitaran también reaccionar a los mismos cambios, cada uno habría abierto su propio canal — reapareciendo el problema que la Ley 4 existe para evitar.

**Decisión:** `src/domain/crearWarehouseModel.js` expone `obtenerWarehouseModel(escenarioId)`, una fábrica con memoria (una instancia por `escenarioId`, nunca dos) que abre el canal UNA sola vez y lo expone vía `modelo.suscribir(callback)`. `reporte.service.js.suscribirCambios()` ahora delega ahí (`modelo.asegurarSuscripcion(); return modelo.suscribir(callback);`) en vez de llamar a `supabase.channel(...)` directamente — mismos canales, mismos filtros, mismo comportamiento observable para `ReportePanel.jsx` (que no cambió una línea).

**Hallazgo colateral durante la implementación (documentado porque cambió el diseño):** la primera versión importaba `WarehouseSnapshot.js` (que usa Zod) de forma estática desde `crearWarehouseModel.js`. Un build de verificación mostró que esto inflaba un chunk COMPARTIDO con Carga Masiva y Salas (`formatearPosicion-*.js`, de 2 kB a 80 kB) — features que nunca llaman a `snapshot()` habrían descargado Zod igual, solo por compartir un chunk con `reporte.service.js`. Se corrigió con un `import()` dinámico dentro de `snapshot()` (que pasó a ser async) — Zod quedó en su propio chunk (`WarehouseSnapshot-*.js`, ~74 kB), descargado solo cuando algo llama a `.snapshot()` de verdad. Bundle principal sin cambios (388.30 kB).

**Consecuencias:** `reporte.service.js` ya no tiene acceso directo a `supabase` (import removido). `WarehouseModel.snapshot()` es async desde el día 1 — documentado en `DOMAIN.md`, ningún consumidor existente lo usaba todavía, así que no hay migración pendiente por este cambio.

---

## ADR-009 — "Sala = instancia alternativa del modelo, no jerarquía anidada": desviación explícita del diseño original, con consecuencias para Fase 2/3/4

**Fecha:** 2026-07-06

**Contexto:** El documento de arquitectura original (y el `MASTER-PROMPT.md`, sección 2, "Contexto") plantea la jerarquía `Warehouse → Sala → Rack → Nivel → Ubicación`. Al construir `WarehouseModel` en G1d, se encontró que el schema real (`db/schema.sql`) no tiene ninguna tabla que subdivida el almacén en salas físicas — hay un solo mezanine. Lo que la app llama "Sala" (`escenarios`, `escenario_posiciones`, `escenario_eliminados`, `escenario_bloqueos`, `escenario_picks`) es un **espacio de simulación aislado**: una copia paralela completa del mismo mezanine, nunca un subconjunto contenido dentro de un Warehouse mayor. Esto se señaló al pasar durante G1d; el usuario pidió que quedara como ADR formal antes de que tres fases (2, 3, 4) dependan de la decisión sin que sus consecuencias estén escritas.

### Por qué el código real determina este diseño (no es una preferencia de diseño)

Todo el código que ya existía ANTES de esta iniciativa — `SlottingFrame.jsx` (prop `escenario`), `mensajesMapa.js` (`escenarioId` en cada payload), `reporte.service.js` (parámetro `escenarioId` en `obtener()`), cada `escenario*.service.js` — ya trata "sala" como un **parámetro que redirige el MISMO conjunto de operaciones** (leer posiciones, mover, bloquear) a un juego de tablas paralelo (`escenario_posiciones` en vez de `posiciones_actuales`, etc.), nunca como "un elemento dentro de una colección `Warehouse.salas[]`". No existe, en ningún lado del sistema real, una relación "un almacén contiene muchas salas" — existe "un almacén, y N copias experimentales aisladas de ese mismo almacén". Modelar `WarehouseModel` con una jerarquía anidada habría sido inventar una estructura que el dato real no sostiene (exactamente lo que la Ley 1 prohíbe, aplicada al modelado de dominio y no solo al código).

`WarehouseModel` refleja esto con `crearWarehouseModel({escenarioId})`: la MISMA forma, instanciada dos veces (o N veces) según el `escenarioId`, nunca un padre con hijos.

### Consecuencia 1 — Cómo haría la simulación (Fase 3) un análisis que cruce salas

Cada sala es una instancia **completa y aislada** de `WarehouseModel` (y de su snapshot). Esto significa:

- Un análisis que compare N salas (ej. "¿cuál de estas 3 propuestas de reordenamiento es mejor?") NO puede resolverse consultando un solo modelo — el motor de simulación (Ley 7: puro, opera sobre snapshots) tiene que **recibir N snapshots como entrada** (uno por `obtenerWarehouseModel(escenarioId).snapshot()` de cada sala a comparar) y devolver resultados **comparables por estructura** (mismo `WarehouseSnapshotSchema`), nunca combinados en un solo cálculo de dominio.
- La comparación en sí (qué sala "ganó", qué diferencia hay entre dos) es responsabilidad de quien **orquesta** la simulación (Fase 3), no de `WarehouseModel`. El dominio no expone (ni debería exponer) un método `compararSalas()` — cada snapshot es autocontenido, la lógica de cruce vive un nivel arriba.
- **Límite real a anotar:** si Fase 3 alguna vez necesitara combinar datos de varias salas en UN SOLO cálculo (no solo comparar resultados calculados por separado — ej. "ocupación promedio ponderada entre 3 salas simuladas"), el diseño actual no lo da gratis. Habría que construirlo en el motor de simulación mismo, consumiendo N snapshots como entrada — no es una limitación bloqueante, pero sí un trabajo adicional no resuelto por este ADR.

### Consecuencia 2 — Qué representa exactamente `WarehouseSnapshot` v1: ¿una sala o el almacén?

**Siempre una sola instancia — nunca "el almacén con sus salas adentro".** El campo `escenarioId` dentro del propio snapshot (`null` = mapa real, número = una sala específica) es la ÚNICA marca de a cuál de las dos cosas corresponde ESE snapshot en particular. No existe, ni está previsto, un snapshot que contenga "el mapa real y también sus 5 salas" en un solo objeto. Cualquier consumidor (el bridge del mapa en Fase 2, un motor en Fase 3/5) tiene que mirar `escenarioId` para saber si está mirando la realidad o un experimento, y **nunca puede asumir que un snapshot contiene información de más de un escenario a la vez**. Esto ya queda anotado en `DOMAIN.md`, pero se refuerza acá porque es la pieza que más fácil se presta a un malentendido futuro.

### Consecuencia 3 — Qué implica para la vista 3D (Fase 4)

La vista 3D consume "el mismo `WarehouseModel` en memoria" (según el documento de arquitectura) — con esta decisión, eso significa consume **una instancia a la vez**: la del mapa real, o la de una sala específica que el usuario esté explorando (`obtenerWarehouseModel(escenarioIdDeEsaSala)`). No hace falta (ni tiene sentido) una jerarquía 3D que muestre "el almacén con sus salas anidadas dentro", porque esa relación no existe conceptualmente en el dominio.

- **Caso simple (ya cubierto):** el usuario elige ver en 3D el mapa real o una sala puntual — un solo modelo, una sola escena.
- **Caso NO cubierto por este diseño:** si algún día se quisiera una vista 3D que muestre VARIAS salas simultáneamente lado a lado (comparar visualmente dos propuestas de reordenamiento en 3D) — eso exigiría montar múltiples instancias de la escena 3D (una por modelo/snapshot), orquestadas por la propia vista 3D, no algo que el dominio resuelva por sí solo. Se anota como límite conocido, no como tarea pendiente de esta fase.

### Riesgo de nombres a futuro (anotado, no resuelto ahora)

Si el almacén físico alguna vez se subdivide de verdad (una segunda nave, zonas físicas reales), ese concepto necesitaría un nombre e implementación DISTINTOS de "escenario/sala de simulación" — porque en español ambos se llamarían naturalmente "sala", pero significarían cosas distintas en el dominio (una subdivisión física real vs. un sandbox de simulación). No es un problema hoy (no existe tal subdivisión), pero vale la pena que quien lo enfrente en el futuro lea este ADR antes de reusar el nombre "Sala" para algo nuevo.

**Decisión:** Se mantiene el diseño de G1d (Sala = instancia alternativa, no jerarquía anidada) — este ADR no lo cambia, documenta sus consecuencias por escrito, como pidió el usuario, antes de que las Fases 2-4 dependan de él.

**Consecuencias:** Ninguna de código — es un ADR de documentación pura. Referencia obligatoria para quien diseñe el motor de simulación (Fase 3) o la vista 3D (Fase 4) si necesitan razonar sobre más de una sala a la vez.

---

## ADR-010 — Geometría física real del mezanine, extraída de un plano DXF

**Fecha:** 2026-07-07

**Contexto:** La Fase 2 (bridge del mapa) sigue en pausa explícita. En paralelo, el usuario confirmó que el plano del mezanine existe en CAD (diseñado por él) y que la posición física (x,y) de cada cuerpo es la fuente de verdad para decidir el layout — algo que hasta ahora no existía en ningún lado del sistema (ver diagnóstico de geometría de la sesión anterior: no había ninguna coordenada real, solo la dirección lógica pasillo+columna+nivel).

**Proceso (con varios intentos fallidos documentados, no solo el resultado final):**
1. El DXF (`docs/geometria/Claude plano.dxf`, ASCII, ~3.6 MB) se parseó con un script propio (sin librería nueva de producción) — el bloque `A$C7a458910`, repetido 304 veces en la capa `0`, es el cuerpo (rack individual).
2. El usuario agregó 24 etiquetas de texto (`MZ0X-C001-N01-1` / `MZ0X-C0NN-N01-1`, mismo formato que ya usa el sistema) marcando el inicio y fin de cada uno de los 12 pasillos reales — `MZ01` a `MZ12` (4 más que los `MZ01-MZ08` que maneja hoy el sistema; los 4 extra son pasillos planeados sin mercadería asignada aún, confirmado por el usuario).
3. Varios métodos de asignación automática (vecino más cercano por punto, por línea con margen fijo, interpolación) dieron resultados inconsistentes (algunos pasillos con el doble de racks, otros en cero) — la causa real: `MZ11`/`MZ12` corren **verticales** (perpendiculares a los otros 10), y mezclarlos con el clustering horizontal rompía todo. Separarlos primero, y luego usar el orden relativo (ambos ascendentes por posición) entre los 10 pasillos horizontales y las filas reales agrupadas por continuidad en Y, dio una coincidencia casi exacta en cantidad de columnas (8 de 10 exactos o ±1).
4. Los 2 que no calzaron en cantidad (`MZ08`: 34 reales vs 41 declarados; `MZ10`: 10 reales vs 6 declarados) se explican por estado de construcción real (uno con menos racks puestos de los planeados, el otro con más) — confirmado por el usuario, no una falla de extracción.
5. 4 racks reales (de 304) quedaron sin asignar — todos a la misma X, rotados 270°, aislados — probablemente racks-tope de esquina, no columnas de un pasillo. Documentados como excluidos, no descartados en silencio.

**Decisión:** Se guarda el resultado validado en `src/domain/GeometriaMezanine.js` (schema Zod) + `src/domain/geometriaMezanine.data.json` (300 de 304 cuerpos reales, con posición x,y en metros). `MZ11` queda con `ubicaciones: []` (posición reservada, sin racks construidos todavía) en vez de omitirse — así un consumidor futuro sabe que el pasillo existe pero está vacío, no que no existe.

**Consecuencias:** Es un archivo de datos real de la instalación (no configuración de la app) — si el layout físico cambia (se construyen más cuerpos, se ajusta un pasillo), hay que repetir el proceso de extracción con un DXF actualizado, no editar el JSON a mano. No toca el mapa legacy ni Supabase — es una capa de datos nueva, de solo lectura, sin conexión todavía a `WarehouseModel` (eso es un paso futuro, no hecho en esta sesión).

## ADR-011 — El DXF es la fuente autoritativa de geometría; las declaraciones del sistema son derivadas

**Fecha:** 2026-07-07

**Contexto:** Tras ADR-010, el usuario confirmó que la construcción física y el CAD del mezanine ya están terminados y actualizados ("obra terminada"), y que el plano (`docs/geometria/Claude plano.dxf`) lo diseñó él mismo reflejando esa obra verificada físicamente. Esto plantea una pregunta de fondo: cuando el plano y lo que el sistema declara (el hardcodeo de 8 pasillos en `03-configuracion.js`, o los valores en `pasillos_config`) no coinciden, ¿cuál manda?

**Decisión:** El DXF manda. El plano es la fuente de verdad de la geometría física del mezanine. Las declaraciones del sistema (`PAS`/`PAS_LR`/`MAXCOL_POR_PASILLO` en `public/legacy/js/03-configuracion.js`, y la tabla `pasillos_config` en Supabase) son **derivadas** — reflejan lo que alguien configuró en el sistema en algún momento, no necesariamente lo que existe hoy en la planta. Donde difieran, es el sistema el que está desactualizado, no el plano.

Esto invierte el propósito de la comparación hecha en ADR-010: ahí se usó el conteo declarado para *validar* la extracción del DXF (¿cuadra con lo esperado?). De acá en adelante, la comparación declarado-vs-plano no es una validación de la geometría — es un **diagnóstico de qué le falta corregir al sistema** (ver tabla de cobertura abajo). La geometría extraída del DXF no se descarta ni se ajusta para calzar con lo declarado.

**Tabla de cobertura (sistema declara vs. plano real), estado al cierre de esta sesión:**

| Pasillo | Sistema declara | Plano (DXF) real | Diagnóstico |
|---|---|---|---|
| MZ01 | 27 (hardcodeado, `MAXCOL_MZ01`) | 27 | Coincide |
| MZ02 | 36 (default) | 37 | Sistema desactualizado — falta 1 columna |
| MZ03 | 36 (default) | 36 | Coincide |
| MZ04 | 36 (default) | 36 | Coincide |
| MZ05 | 36 (default) | 36 | Coincide |
| MZ06 | 36 (default) | 36 | Coincide |
| MZ07 | 36 (default) | 37 | Sistema desactualizado — falta 1 columna |
| MZ08 | 36 (default) | 34 | Sistema desactualizado — declara 2 de más (obra con menos racks de los planeados originalmente, confirmado por el usuario) |
| MZ09 | No existe en `PAS`/`PAS_LR` — el sistema no conoce este pasillo | 4 | Pasillo entero ausente del sistema |
| MZ10 | No existe en `PAS`/`PAS_LR` | 10 | Pasillo entero ausente del sistema |
| MZ11 | No existe en `PAS`/`PAS_LR` | 0 (vertical, reservado, sin racks construidos) | Pasillo entero ausente del sistema (y sin racks todavía, así que no es urgente) |
| MZ12 | No existe en `PAS`/`PAS_LR` | 7 (vertical) | Pasillo entero ausente del sistema |

`pasillos_config` (Supabase) es la tabla donde un usuario puede haber extendido un pasillo manualmente vía "Añadir rack" — el resultado de `select pasillo, max_columna from pasillos_config order by pasillo;` todavía no fue confirmado con datos reales pegados como texto (se compartió una captura de pantalla del editor SQL, sin filas legibles). Independientemente de lo que devuelva, no cambia esta tabla de diagnóstico para MZ09-MZ12: si esos pasillos no aparecen en `pasillos_config`, es porque nunca se configuraron ahí — el plano sigue siendo la única referencia real para esos 4. Si aparecen con valores distintos a los del plano, se agrega una fila de diagnóstico adicional en la próxima sesión.

**Hallazgo pendiente, no resuelto en esta sesión:** re-verificando la extracción, los racks rotados 270° no son 4 sino **12**, agrupados en dos columnas paralelas cerca de la esquina donde se cruzan `MZ11`/`MZ12` (verticales) con `MZ02` (horizontal), en `x≈301.08` y `x≈303.157`. El algoritmo de asignación por distancia absorbió 8 de esos 12 dentro de `MZ12` (6), `MZ02` (1) y `MZ07` (1) por pura cercanía geométrica — no porque haya una etiqueta que los confirme como parte de esos pasillos. Los 4 restantes (todos en `x≈303.157`) quedaron sin asignar, igual que en ADR-010. No hay ninguna etiqueta de texto ni capa DXF distinta que identifique qué es esta estructura — se le preguntó al usuario qué representa (no se descarta en silencio); la respuesta queda pendiente para la próxima sesión. Mientras no se resuelva, `geometriaMezanine.data.json` no cambia: como el DXF es el mismo archivo ya procesado en ADR-010, el resultado de re-correr el mismo pipeline (`extraer-final.mjs`) es idéntico — no hubo obra nueva que capturar en este plano.

**Consecuencias:** La corrección de `03-configuracion.js` (agregar `MZ09`-`MZ12` a `PAS`/`PAS_LR`, ajustar `MZ02`/`MZ07`/`MZ08`) y de `pasillos_config` (si aplica) queda anotada como trabajo futuro derivado de este diagnóstico — no se toca el mapa legacy en esta sesión (Fase 2 sigue en pausa). Este ADR no reemplaza ni edita ADR-010; lo confirma como base y agrega la política de qué hacer cuando el plano y el sistema no coinciden.

## ADR-012 — Cierre del hallazgo de los racks rotados 270°: los 304 cuerpos del plano quedan asignados, ninguno descartado

**Fecha:** 2026-07-07

**Contexto:** ADR-011 dejó abierto el hallazgo de 12 racks rotados 270° sin explicación (8 absorbidos por el algoritmo dentro de `MZ12`/`MZ02`/`MZ07` por cercanía, sin etiqueta que los confirme; 4 sin asignar). El usuario subió una versión del DXF con 13 etiquetas de columna intermedia nuevas (`MZ09`, `MZ10`, `MZ11`, `MZ12`) y aclaró en dos rondas la identidad real de esos racks.

**Verificación antes de aceptar la aclaración:** se revisó directamente qué bloques DXF existen en la franja de `MZ11` (x 297-299.5) — resultado: **cero** instancias de `A$C7a458910` ahí. Las 7 celdas dibujadas para `MZ11-C001` a `C007` que se ven en el plano son geometría de referencia (`LWPOLYLINE`), no racks reales insertados — consistente con "posición reservada, sin construir" (ADR-010). La franja de `MZ12` (x 300-302) sí tiene exactamente 7 instancias reales, confirmando que el conteo de `MZ12` ya era correcto.

**Aclaración del usuario:**
1. El rack aislado en `x=401.134` (el que el algoritmo había metido, sin corresponder, dentro del renglón de `MZ07`) es un cuerpo real de `MZ08` — su "cuerpo 37" en la numeración física de la instalación. Está pegado a la etiqueta `MZ08-C001` (a 0.09 m), no a la fila real de `MZ08` (que está ~2.45 m más lejos, el mismo patrón de desplazamiento etiqueta↔fila ya documentado) — es un cuerpo de cabecera, no un miembro más del renglón.
2. Los 5 racks de la columna `x=303.157` (4 que habían quedado sin asignar + 1 que el algoritmo había metido, sin corresponder, dentro de `MZ02`) son todos cuerpos de `MZ11` — sus "cuerpos fin".

**Verificación de conservación (evidencia de que la aclaración es consistente, no solo aceptada de palabra):** al aplicar la corrección, **los 304 cuerpos reales del plano quedan asignados a algún pasillo — cero descartados.** Antes de esta sesión, 4 quedaban fuera sin explicación; ahora la suma exacta (27+36+36+36+36+36+36+35+4+10+5+7 = 304) cierra perfecta.

**Decisión:** Se corrige `geometriaMezanine.data.json`:
- `MZ02`: 37 → 36 (se retira el cuerpo que en realidad es de `MZ11`, se renumeran columnas 1-36).
- `MZ07`: 37 → 36 (se retira el cuerpo que en realidad es de `MZ08`, se renumeran columnas 1-36).
- `MZ08`: 34 → 35 (se agrega el cuerpo de cabecera, columna 35).
- `MZ11`: 0 → 5 (los 5 "cuerpos fin", columnas 1-5, ordenados por Y ascendente).
- El resto de los pasillos no cambia.

Nota de transparencia: la numeración `columna` en el schema es un **orden relativo** (posición 1..N dentro del pasillo), no el número físico que el usuario usa en la instalación — por eso el "cuerpo 37" de `MZ08` se guarda como `columna: 35` (el trigésimo quinto en orden, no literalmente "37"). Si en el futuro se necesita el número físico real de cada rack, hay que agregar un campo nuevo al schema (no reemplazar `columna`), porque hoy no hay una fuente que lo declare para el resto de los cuerpos tampoco.

**Consecuencias:** La tabla de diagnóstico de ADR-011 queda desactualizada en 2 filas y se corrige acá, no se reedita ADR-011: `MZ07` pasa de "sistema desactualizado, falta 1" a **coincide exacto** (36=36); `MZ08` pasa de "declara 2 de más" a **declara 1 de más** (36 declarado vs 35 real). `MZ02` sigue con el mismo diagnóstico (36 declarado vs 36... espera, no: con la corrección `MZ02` real pasa a 36, que coincide con lo declarado — también se resuelve). `MZ11` sigue sin declaración en el sistema, pero ahora con 5 cuerpos reales en vez de 0 — más urgente de incorporar a `PAS`/`PAS_LR` que antes. Ningún archivo del mapa legacy ni de Supabase se tocó — esto es solo el archivo de datos de geometría.

## ADR-013 — `movido` mide reasignación en el sistema nuevo, no traslado físico ejecutado — pregunta abierta de negocio, no de código

**Fecha:** 2026-07-08 (rama `feat/mapa-canvas`)

**Contexto:** al rediseñar la fila de artículo del panel de detalle del Canvas para mostrar el viaje físico real de cada artículo (`RCLxxx-Cxxx-Nxx-x`, su rack en el mezanine VIEJO, hacia `MZ0X-C0YY-N0Z`, su posición planificada en el layout NUEVO), el usuario corrigió una asunción previa: `rack_actual` (RCL) no es un código legado sin uso -- es el ORIGEN real de un traslado físico pendiente. El propósito del sistema es justamente reacomodar el mezanine viejo (organizado por códigos RCL) al layout nuevo (MZ01-MZ12); un rack MZ nuevo se arma con artículos que hoy están dispersos por todo el mezanine viejo.

Esto llevó a preguntar: ¿el dominio ya sabe si ese traslado físico (RCL → MZ) **ya se ejecutó** para un artículo dado?

**Hallazgo:** `resolverPosicionesActuales()` (`src/domain/resolverPosicionesActuales.js`) expone un campo `movido: boolean`, pero mide algo distinto de "¿ya se trasladó físicamente?":

- `movido = true` cuando existe un registro en `posiciones_actuales` (o `escenario_posiciones`) que reasigna al artículo a una posición MZ **distinta** de la que traía `inventario_slotting` (el plan de fábrica) -- es decir, "¿alguien corrigió/reasignó la posición planificada usando la app?".
- `movido = false` significa "nadie reasignó este artículo desde el plan original" -- **no** significa "ya está físicamente en su lugar". Un artículo con `movido: false` puede perfectamente seguir físicamente en su rack RCL viejo, esperando el traslado: el sistema no tiene ningún campo que registre si el traslado físico ya ocurrió.

Se buscó explícitamente (grep sobre `db/schema.sql`, `supabase/sql/*.sql`, `src/domain/*.js`, `src/shared/services/*.js`) cualquier campo de estado de ejecución (`completado`, `ejecutado`, `confirmado`, `pendiente`, etc.) -- no existe ninguno. `niveles_a_armar` es lo más cercano, pero mide completitud de un RACK (cuántos niveles le faltan por armar), no el estado de traslado de un artículo individual.

**Decisión tomada en esta sesión (alcance de UI, no de dominio):** el panel de detalle del Canvas muestra siempre el viaje `RCL → MZ` con el mismo peso visual para ambos extremos, **sin ningún indicador de "ya reacomodado"** -- mostrar un estado que el sistema no puede respaldar con datos reales sería peor que no mostrar ninguno.

**Pregunta abierta, explícitamente de negocio, no de código:** ¿cómo se confirma en la operación real que un traslado físico RCL→MZ ya ocurrió? Ejemplos de rutas posibles (ninguna elegida todavía):
1. Un checkbox/acción explícita del operador ("confirmar traslado") que agregue un campo de estado nuevo (a `posiciones_actuales` o una tabla dedicada).
2. Asumir que **todo** artículo con una fila en `posiciones_actuales` (aunque no haya cambiado de posición respecto al plan) ya fue confirmado físicamente, si el flujo real es "cargar la posición en la app ES la confirmación del traslado" -- a validar con quien opera el mezanine hoy, no asumido acá.
3. No trackear esto en el sistema todavía -- dejar el viaje RCL→MZ como información de referencia, y el seguimiento del traslado físico en un proceso aparte (papel, otra herramienta), hasta que se decida integrarlo.

No se implementa ninguna de las tres sin decisión explícita del usuario/negocio.

## ADR-014 — Corrección de conteo real: MZ10 (10→6) y MZ08 (35→41) — 4 cuerpos mal asignados por proximidad al hueco de la banda

**Fecha:** 2026-07-09 (rama `feat/mapa-canvas`)

**Contexto:** al ajustar la posición de la banda transportadora decorativa del Canvas, el usuario reportó (con captura del DXF real) que MZ10 declarado (10 columnas) no coincidía con el plano, que muestra solo 6 columnas etiquetadas (`MZ10-C001` a `C006`) antes de que la banda ocupe el espacio físico siguiente. El usuario sospechó explícitamente un vínculo con MZ08 (41 cuerpos reales según el plano, no los 35 que declaraba el sistema).

**Nota de proceso:** el script de extracción (`extraer-final.mjs`, ADR-010/011/012) ya no existe -- es un script puntual, ejecutado y borrado, como es convención en este proyecto. La verificación de este ADR se hizo releyendo el DXF crudo directamente (`Docs/Geometria/Claude plano.dxf`, grep de texto) y cruzando contra `geometriaMezanine.data.json`, no revisando el código de extracción (ausente).

**Verificación (evidencia, no suposición):**
- `grep` de todas las etiquetas `MZ10-C0XX` en el DXF: solo existen `C001` a `C006`. Ninguna `C007` en adelante, con cualquier variante de sufijo.
- `grep` de `MZ08-C0XX`: solo existen `C001` (primero) y `C041` (último) -- la convención real del plano es etiquetar primer y último cuerpo, no cada uno (mismo criterio ya usado para MZ01/MZ02-07/etc., confirmado también en este ADR: sus etiquetas de inicio/fin coinciden exactamente con los conteos ya declarados, cero discrepancia ahí).
- Las coordenadas crudas de `MZ10` muestran columnas 1-6 contiguas (~2.45 unidades entre sí, patrón normal), después un salto de **76.6 unidades** hasta 4 cuerpos más (columnas "7-10" en el dato viejo), que vuelven a ser contiguos entre sí. Ese salto coincide con el espacio físico real de la banda transportadora (ver la captura del DXF que compartió el usuario, donde la espiral y el tramo largo ocupan justo esa zona).
- Esos 4 cuerpos **no tienen ninguna etiqueta real que los confirme como MZ10** -- el algoritmo de extracción los asignó por proximidad/alineación de Y (comparten la misma Y que MZ10, `239.276`), el mismo tipo de error ya documentado en ADR-012 para los racks rotados 270°.

**Decisión:** se corrige `COLUMNAS_POR_PASILLO` (`posicionesEsquematicas.js`): `MZ10: 10 → 6`, `MZ08: 35 → 41`. En `geometriaMezanine.data.json`, los 4 cuerpos sin etiqueta se retiran de `MZ10` y se agregan a `MZ08` (columnas 35-38, renumerando la "cabecera" ya documentada en ADR-012 de columna 35 a 39) -- **el total general se mantiene en 304, ningún cuerpo descartado**, mismo criterio que ADR-012.

**Honestidad sobre el límite de esta corrección:** la evidencia de que esos 4 cuerpos pertenecen a MZ08 es circunstancial (proximidad en X con la cola de MZ08, columnas 25-34), **no una etiqueta real que lo confirme** -- de hecho, comparten Y con MZ10, no con MZ08 (cuya fila real está ~2.5 unidades más abajo). Con esos 4 sumados, `MZ08` llega a 39 cuerpos con coordenadas reales confirmadas -- **quedan 2 cuerpos del total declarado (`C041`) sin ubicación conocida**, pendientes de una futura sesión con el mismo nivel de verificación que cerró ADR-012 (o una nueva revisión del DXF con el usuario). `COLUMNAS_POR_PASILLO.MZ08 = 41` refleja el conteo real correcto para el Canvas esquemático (que solo necesita el NÚMERO, no coordenadas), aunque el JSON de geometría real todavía no tiene los 41 confirmados con posición.

**Verificación de que el bug es aislado:** se revisaron las etiquetas reales de inicio/fin de MZ01, MZ02-07 contra los conteos declarados -- los 7 coinciden exactamente. El problema no se repite fuera de la zona MZ08/MZ09/MZ10, donde vive la banda.

**Hallazgo aparte, NO resuelto en este ADR:** al verificar, se encontró que el DXF tiene etiquetas reales `MZ11-C001` a `C007` (7) y `MZ12-C001` a `C005` (5) -- valores que **contradicen** lo declarado hoy (`MZ11:5, MZ12:7`, posiblemente invertidos). Dado que MZ11/MZ12 ya tienen una historia de asignación mucho más compleja e irregular (ADR-012: cuerpos de MZ11 que físicamente no viven en su propia franja), este hallazgo se registra pero **no se investiga ni se corrige acá** -- requiere el mismo nivel de rigor dedicado que cerró ADR-012, no una corrección de paso.

**Consecuencias:** `posicionesEsquematicas.test.js` actualizado (comentario de test, sin cambiar aserciones -- ya eran dinámicas). `geometriaMezanine.test.js` sigue en verde sin cambios (el total de 304 y el conteo de MZ11 no se tocan). El ancla de la banda (ADR previo de esta misma sesión, MZ08-C004) no se ve afectada -- la columna 4 de MZ08 no cambia de posición con este ajuste.

**Enmienda (2026-08-11) -- los dos hallazgos abiertos de este ADR, cerrados:**
- **MZ11/MZ12 invertidos:** confirmado y corregido. `geometriaMezanine.data.json` tenía las coordenadas de las dos franjas verticales adyacentes con el nombre cruzado (MZ11 con las 5 de X≈303, MZ12 con las 7 de X≈301) -- las etiquetas reales del DXF (`MZ11-C001..C007`, `MZ12-C001..C005`) confirman que es al revés. Se verificó sentido físico antes de tocar el archivo (dos franjas paralelas, mismo rango de Y) y se intercambiaron los nombres (no las coordenadas -- ninguna geometría nueva, solo la etiqueta). `COLUMNAS_POR_PASILLO`: `MZ11: 5→7, MZ12: 7→5`. Test de `geometriaMezanine.test.js` actualizado.
- **2 cuerpos de MZ08 (C040-C041) sin ubicación:** confirmado con el usuario que **no es un pendiente de investigación** -- esas 2 columnas existen a nivel de conteo/sistema pero nunca tuvieron cuerpo físico dibujado en el plano real. `geometriaMezanine.data.json` con 39 ubicaciones para MZ08 es correcto y definitivo; `COLUMNAS_POR_PASILLO.MZ08 = 41` sigue siendo el conteo correcto para el Canvas esquemático. Cerrado, sin código pendiente.

## ADR-015 — Migración de nomenclatura RCL → MZ: cierre de F1 (modelo de datos + RLS + import de `identidad_legacy`)

**Fecha:** 2026-07-13 (rama `feat/mapa-canvas`)

**Contexto:** nueva iniciativa de negocio, independiente del roadmap G0-G6/Digital Twin y del Canvas del mapa (aunque vive en la misma rama): el mezanine viejo nombraba las posiciones como `RCL##`, y se está migrando a la nomenclatura nueva `MZ0X-C0YY`. Los racks ya están físicamente ubicados según el plano nuevo -- lo que falta migrar es el NOMBRE de cada posición y el CONTENIDO (artículos correctos según el nuevo plan de slotting). El usuario entregó un spec completo (`spec_migracion_rcl_mz.md`) describiendo identidad dual RCL/MZ, buffer temporal, flujo guiado de 4 pasos (operador vacía → recolecta → bloquea; supervisor confirma), reglas de purga/bloqueo por acumulación, y visualización anti-confusión (nada dibujado en reposo, rutas solo durante un traslado activo). Se acordó ejecutar en 5 sub-fases (F1-F5); este ADR cierra F1.

**Decisión — modelo de datos (6 tablas nuevas, ninguna existente se modifica):**
- `identidad_legacy` -- tabla maestra RCL↔MZ por POSICIÓN (no por artículo -- explícitamente independiente de `inventario_slotting.rack_actual`, que es la ubicación RCL actual de un ARTÍCULO, decisión del usuario para no asumir que ambas fuentes son cruzables sin verificar). `rcl_codigo` con `UNIQUE` además de la PK `(mz_pasillo, mz_columna)`: relación 1 a 1 estricta.
- `migracion_movimientos` -- salida del cruce manual (tabla de acomodo objetivo × inventario actual, ambas armadas a mano fuera del sistema); NO se implementa el algoritmo de cruce, solo la estructura que recibe su resultado.
- `migracion_slots` -- máquina de estados por posición MZ (`pendiente→vaciando→recolectando→bloqueado→confirmado`), independiente de `bloqueos`/`escenario_bloqueos` (significan cosas distintas: lock operativo genérico vs. progreso del proyecto de migración).
- `migracion_auditoria` -- eventos dedicados por slot, append-only, tabla propia (no reutiliza `auditoria`, que tiene otra forma).
- `migracion_buffer` -- 1 fila por artículo dejado en buffer; `slot_origen_id` como FK real a `migracion_slots` (no pasillo/columna sueltos); `origen_rcl_codigo`/`origen_nivel`/`origen_sub_nivel` como snapshot congelado al momento de depositarlo (necesario porque el paso 4 retira formalmente la identidad RCL del slot -- sin el snapshot, la trazabilidad histórica se perdería en cuanto el slot se confirme). Confirmación de llegada al buffer es en LOTE (todas las filas de un mismo `slot_origen_id` se marcan `confirmado_en` juntas cuando el slot transiciona `vaciando→recolectando`, nunca artículo por artículo en tiempo real) -- **el schema soporta esto (`migracion_slots.vaciado_en`, `migracion_buffer.confirmado_en`/`lote_confirmacion_id`), pero la orquestación real (qué código dispara ese UPDATE en lote) es trabajo de F2, no de F1**.
- `migracion_purgas` -- cola de tareas, no interrumpe al operador con un traslado en curso.
- Antigüedad del buffer como segunda señal de purga (además del umbral de >10 por destino): un artículo puede quedar invisible varios días sin cruzar ese umbral de cantidad -- se agregó un índice sobre `dejado_en` para que la purga también se dispare por tiempo, no solo por volumen (pedido explícito del usuario: el buffer no debe convertirse en una "bodega transitoria" silenciosa).

**Decisión — reglas de negocio confirmadas explícitamente (sin asumir ninguna):** umbral de 100 códigos sin resolver es POR OPERADOR individual, no global; el bloqueo que dispara solo afecta "iniciar traslado" (no toda la app, no traslados ya en curso); "Confirmar finalizado" (retira la identidad RCL, habilita auditoría) es de Supervisor **o** Administrador, no solo Supervisor.

**Decisión — RLS:** lectura abierta a cualquier autenticado en las 6 tablas. Import de `identidad_legacy`/`migracion_movimientos` restringido a Supervisor/Administrador. `migracion_buffer` y las transiciones de `migracion_slots` hasta "bloqueado" abiertas a Operador/Supervisor/Administrador. La transición a "confirmado" se refuerza con un **trigger** (`migracion_slots_forzar_confirmacion_rol`) además de la policy genérica -- una policy de RLS no puede restringir por COLUMNA (solo por fila), así que el trigger es el mecanismo real que impide que alguien sin rol de Supervisor/Administrador toque `confirmado_por`/`confirmado_en`, a nivel de base y no solo de UI.

**Decisión -- import de `identidad_legacy`:** archivo con headers EXACTOS "MZ"/"RCL" (sin sinónimos, a propósito: es un archivo que arma una sola persona a mano). Parseo con regex `^MZ(\d{2})-C(\d{3})$`; el código RCL se guarda tal cual, sin normalizar sufijos (varían: `-001`, `-C001`, `-C002`). Idempotente por MZ (upsert on conflict `mz_pasillo,mz_columna`) -- reimportar el mismo MZ actualiza en vez de fallar, para que el usuario pueda corregir y resubir mientras termina de armar la tabla. Nunca aborta todo el archivo por una fila mala: carga las válidas, lista las rechazadas con motivo exacto (celda vacía, formato inválido de MZ o de RCL, MZ duplicado dentro del archivo, RCL duplicado dentro del archivo, RCL ya asignado a otro MZ en la base).

**Verificación:** 170/170 tests (21 nuevos: 15 de parseo/validación pura + 6 de integración contra un fixture real de 29 filas con las 8 categorías de error del spec, generado con un script Node puntual ya borrado -- `tests/fixtures/identidad_legacy_test.xlsx`/`.csv`). Build limpio, chunk propio de 8.19 kB para la pantalla de import, sin inflar el bundle principal. `git diff public/legacy/` vacío.

**Honestidad sobre el límite de este cierre:** ninguno de los 2 archivos SQL (`2026-07-09_migracion_rcl_mz_borrador.sql`, `2026-07-13_migracion_rcl_mz_rls.sql`) fue ejecutado por mí contra la base real -- no tengo acceso a Supabase desde este entorno. La verificación de ambos es de revisión de sintaxis/lógica, no de ejecución confirmada. La corrida real contra la base productiva quedó a cargo del usuario, fuera de este ADR.

## ADR-016 — Motor de distribución (Fase 5 de MASTER-PROMPT.md): primera construcción real de `src/engines/optimization/`

**Fecha:** 2026-08-06/07

**Contexto:** David pidió un replanteamiento completo del motor que decide dónde vive cada artículo en el mezanine, antes de arrancar la migración física real. Investigación previa (3 agentes Explore en paralelo) confirmó que **no existía ningún algoritmo de asignación automática** -- `inventario_slotting` es una foto de fábrica importada una sola vez, y las herramientas de volumen existentes (`reglasAsignacionCuerpo.js`, `detectarSobrecargaRacks.js`) son de auditoría de solo lectura, nunca asignan nada. Se encontró que `MASTER-PROMPT.md` ya reservaba exactamente esta pieza como "FASE 5 -- Motor de Optimización v1" (`src/engines/optimization/`, nunca construida) -- se decidió alinear el trabajo con esa arquitectura ya pensada en vez de diseñar una paralela.

**Decisión -- destino del resultado:** el motor escribe una PROPUESTA (`inventario_slotting_propuesto`, tabla nueva) -- nunca toca `inventario_slotting` directo (sigue solo lectura). Aprobar una propuesta escribe en `posiciones_actuales` vía `posicionesService.guardarLote()` (servicio YA existente, reusado sin cambios) -- se descartó inventar una segunda tabla "real" paralela, porque `posiciones_actuales` ya es la fuente de "ubicación actual" que consume el resto de la app.

**Decisión -- algoritmo:** dos pasadas First-Fit-Decreasing (artículos que necesitan un cuerpo completo primero, el resto por nivel sobre los cuerpos no consumidos), con las reglas duras como datos evaluables (`reglasDistribucion.js`, Ley 8): capacidad útil al 97.5% (2.5% de tolerancia, pedido explícito), máximo 4 artículos distintos por nivel (regla de negocio confirmada por David desde el inicio del proyecto, no encontrada en ningún código existente hasta este ADR). 2 variantes deterministas (`volumen_desc`, `clase_a_primero`) compiten por menor costo agregado -- sin fuerza bruta/ILP exacto, sin `Math.random` en ningún punto (determinístico y auditable, Ley 9).

**Corrección en vivo -- el término de distancia se sacó por completo:** la primera versión de la función de costo usaba distancia euclídea real (coordenadas del DXF) al ascensor más cercano, como proxy de "accesibilidad". David la rechazó dos veces -- un ajuste de peso no alcanzó ("no estás cambiando la lógica"), porque el problema no era el peso sino el concepto: una fórmula geométrica abstracta no captura lo que él necesita. Se reemplazó por completo por **zonas de negocio explícitas y nombradas** (`calcularAfinidadZonas.js`): evitar MZ01-C001/MZ10/MZ11/MZ12 (~200m de caminata real, confirmado explícitamente), preferir columnas 9-19 de MZ01-08 para CUALQUIER artículo (no solo clase A), zona óptima MZ02 19-27 solo para clase A (regla anterior, ya confirmada, se mantuvo). Verificado contra los 3016 artículos reales: 0 quedaron en las zonas a evitar, 1394 en la zona accesible general. `calcularDistanciaAscensor.js` se borró (dead code) -- no quedó ningún rastro de la fórmula de distancia en el motor.

**Decisión -- sin restricción de clase:** cualquier mezcla de clases (A/B/C/D) en el mismo hueco es válida -- lo único que importa es el volumen. Confirmado explícitamente ("no tiene nada que ver con que se mezclen los artículos").

**Decisión -- auditoría:** tabla nueva `distribucion_auditoria` (append-only), no se reusa `migracion_auditoria` (acoplada al flujo de slots RCL→MZ, un contexto de negocio distinto -- reusarla forzaría texto libre donde ya hay datos estructurados). Los campos `ocupacion_*` son una excepción DELIBERADA a la Ley 3 ("derivados nunca persistidos") -- son un hecho histórico congelado en el instante de la aprobación, nunca se vuelven a leer como estado vivo (mismo criterio que `inventario_slotting.rack_actual`, ya congelado).

**Verificación con datos reales (F5c):** corrida completa contra los 3016 artículos reales de `inventario_slotting` (exportados a mano por David vía SQL Editor, sin acceso directo a la base desde este entorno) en ~4-6 segundos. 2989 asignados, 1 sin asignar (excede hasta la capacidad de un cuerpo completo, caso real a revisar aparte). 51+ tests nuevos en `src/engines/optimization/*.test.js`, suite completa en 428/428, build limpio en cada checkpoint.

**Honestidad sobre el límite de esta entrega:**
- Los 3 SQL nuevos (`2026-08-07_distribucion_motor.sql`) NO fueron ejecutados contra la base real -- sin acceso a Supabase desde este entorno, igual que ADR-015. Corrida real pendiente, a cargo de David, con su aprobación explícita antes de correrlo (Ley 6) -- **pendiente al cierre de esta sesión**.
- No hay pathfinding real (BFS sobre pasillos transitables) -- no existen datos de ancho de rack/pasillo ni coordenadas reales de ascensor con ese nivel de detalle en `geometriaMezanine.data.json`. Documentado como ruta futura, junto con la ruta de escalado a Edge Function (mandato `MASTER-PROMPT.md:128`) -- ninguna de las dos se implementó.
- F5e (la pantalla en la app con el diff y el botón de aprobar) NO se construyó -- como alternativa de verificación visual inmediata, se generó SQL puntual (`2026-08-07_sala_propuesta_distribucion.sql`, script generador ya borrado por convención) para cargar la propuesta en una Sala de simulación real (infraestructura ya existente, `escenarios`/`escenario_posiciones`), y un artifact HTML de solo lectura (croquis con densidad por color, no versionado en el repo) para revisión rápida sin depender de Supabase.
- La sesión se cierra a pedido explícito de David ("lo vamos a dejar aquí") con F5d completo pero sin correr, y F5e sin empezar.

**Consecuencias:** F2 (ficha de destino ampliada + flujo guiado de 3 pasos operador, sin buffer automático todavía) puede arrancar apenas se confirme que los 2 SQL corrieron sin error. F2 hereda como trabajo central la orquestación de la confirmación en lote del buffer (señalada arriba como pendiente, no como bloqueo).

## ADR-017 — Cierre de 2 hallazgos heredados (ADR-001/003, ADR-014) + corrección de fondo del motor de distribución + Vista RCL resuelta en vivo

**Fecha:** 2026-08-11

**Contexto:** sesión de "limpieza de deuda" -- el usuario pidió repasar todos los hallazgos abiertos de sesiones anteriores y resolver los que se pudieran con evidencia real, en vez de seguir acumulándolos. Cubre 4 frentes independientes.

**1) ADR-001/003 cerrado -- `CUERPOS` (legacy) vs `inventario_slotting` (real) SÍ están sincronizados.** Comparación programática de los 3016 artículos de `CUERPOS` (JS estático) contra un export real de `inventario_slotting` (mismo CSV usado en el motor de distribución): coinciden exactamente los 3016, en pasillo, columna y nivel -- 0 diferencias, 0 exclusivos de un lado. La pregunta que quedó "INCONCLUSA, bloqueada por RLS" desde 2026-07-06 (ADR-003) tiene respuesta real: sí están sincronizados. No hacía falta acceso a Supabase para confirmarlo -- `CUERPOS` es un archivo estático local, comparable directo contra cualquier export real.

**2) Vista RCL corregida -- el destino ya no sale de `identidad_legacy` (foto congelada), sale en vivo de `inventario_slotting` (el plan vigente).** Auditoría real con `detectarDestinosDesactualizados.js` (ya existía, solo nunca se había corrido contra datos reales): de 3678 artículos cubiertos por `identidad_legacy`, **3240 (88%) tenían el destino desactualizado** -- 1170 sin ningún lugar real, 2070 con destino real distinto al importado. Verificado además que 596 de 1182 sub-posiciones RCL tienen sus artículos reales repartidos en MÁS DE UN destino MZ distinto -- el modelo de "1 sub-posición RCL = 1 destino MZ" de `identidad_legacy` ya no puede representar la realidad, no es cosa de "reimportar". Se corrigió `construirVistaRcl()` (`src/features/migracion/vistaRcl.js`) para resolver el destino de cada artículo en vivo contra `inventario_slotting` -- `identidad_legacy` sigue usándose solo para saber QUÉ hay en cada posición física RCL, nunca para decidir a dónde va. Un artículo sin destino real en el plan vigente queda excluido de la vista (nunca se inventa un destino) -- ese caso sigue disponible vía la auditoría. Verificado 1 a 1 contra datos reales: 2073 artículos mostrados, 2073 coinciden con `inventario_slotting`, 0 no coinciden. Contexto operativo confirmado por el usuario: la migración física RCL→MZ **no ha empezado** -- RCL es dónde está todo hoy físicamente, MZ es el plan vigente (recalculado varias veces desde el import original de `identidad_legacy`).

**3) Motor de distribución -- corrección de fondo tras segunda opinión externa verificada.** El ADR-016 reportaba que la zona óptima de clase A tenía "un techo físico real de ~17-18 artículos". Una segunda opinión (IA externa, Kimi) cuestionó esa conclusión; se verificó con datos reales y **la segunda opinión tenía razón, con un mecanismo distinto al que proponía**: no era mezcla de escalas en la función de costo (esa hipótesis se probó y se descartó), sino que el algoritmo de una sola pasada dejaba que artículos "grandes" (que necesitan un cuerpo entero) se comieran los 9 cuerpos completos de la zona antes de que le tocara el turno a los cientos de artículos chicos de clase A que sí entrarían. Verificado con reserva 100% + orden correcto: entran hasta 180 artículos donde antes entraban 17-18.
   - **Motor de dos fases** (`empaquetarDosFases.js` + `reservarZonaPrioritaria.js`, nuevos): Fase 1 reserva la zona óptima/accesible EXCLUSIVAMENTE para clase A / alta frecuencia real (`picks`), ordenado por picks descendente, SOLO por nivel (nunca cuerpo completo -- un cuerpo entero es demasiado recurso para reservarlo automáticamente). Fase 2 empaqueta el resto con FFD normal sobre lo que quedó libre, respetando el estado que dejó la Fase 1 (`estadoInicial`/`cuerposExcluidos`, nuevos en `empaquetarArticulos.js`).
   - **Swaps + reubicación** (`mejorarPorSwaps.js`, nuevo): post-proceso que mueve un artículo prioritario mal ubicado a un hueco libre de su zona (más barato) o, si no hay hueco libre, lo intercambia con un ocupante no-prioritario -- solo si mejora alguna métrica sin empeorar ninguna, con auditoría completa (antes/después) por movimiento.
   - **Métricas estandarizadas** (`calcularMetricasGlobales.js`, nuevo): densidad ponderada, % clase A en zona óptima, % alta frecuencia en zona accesible, fragmentación -- antes solo se reportaba densidad promedio simple.
   - **Zona óptima ampliada** (pedido explícito, verificado antes de implementar): de MZ02 solamente a los 8 pasillos principales (MZ01-MZ08), mismas columnas 19-27. Cobertura de clase A: 22.5% → 94.2% (696 de 739). Verificado con simulación real antes de tocar código.
   - **Excepción de capacidad para el 7501137** (`EXCEPCIONES_CAPACIDAD_CUERPO`, dato en `reglasDistribucion.js`, Ley 8): su volumen real (2.16 m3, lote de 3000 unidades de 15x12x4cm, dimensiones verificadas, no es error de carga) es EXACTO al volumen de referencia de un cuerpo completo, pero 0.054 m3 arriba de la capacidad útil por el margen de tolerancia del 2.5%. Pedido explícito: se le exime de la tolerancia solo a él.
   - Suite final: 87 tests del motor (antes 51), 465 tests totales del proyecto, build limpio en cada checkpoint.

**4) MZ11/MZ12 corregidos (hallazgo de ADR-014, abierto desde 2026-07-09).** Ver enmienda agregada al ADR-014 arriba -- nombres invertidos, corregidos con evidencia de sentido físico antes de tocar `geometriaMezanine.data.json`. Los 2 cuerpos de MZ08 (C040-C041) sin ubicación, también del ADR-014, se cierran como "no pendiente" -- confirmado con el usuario que existen a nivel de sistema pero nunca tuvieron cuerpo físico en el plano.

**Honestidad sobre el límite de esta sesión:** el resultado del motor corregido no se volvió a cargar en una Sala de simulación para inspección visual (las 10 Salas comparativas de la sesión anterior quedaron con el motor VIEJO) -- pendiente si se quiere ver el resultado nuevo en el Mapa. El campo `grupo` (`BACKLOG-MIGRACION.md`) sigue sin decisión. `migracionMovimientos.service.js` (5 consultas sin paginar, una sin filtro alguno, alimenta `despacho.service.js`) quedó identificado como riesgo real de producción pero sin corregir todavía.

**Enmienda 2026-08-12 (revisión de código muerto + primera corrida real post-fix):** antes de commitear lo de arriba se encontró que `generarPropuestaDistribucion.js` (la función expuesta del motor) nunca se había conectado al motor de dos fases -- seguía llamando al camino viejo de una sola pasada. Corregido, y de paso se borró `generarCandidatosLayout.js` (ya sin consumidores) y los scripts puntuales ya usados. Commiteado y pusheado a `main` (`f76674a..d8af2c4`).

## ADR-018 — Primera corrida real del motor conectado: bug de NaN silencioso + Sala de prueba + rediseño de la burbuja de ocupación

**Fecha:** 2026-08-12

**Contexto:** con el motor ya conectado (ADR-017, enmienda de arriba), se pidió generar por primera vez una Sala real con el resultado del motor corregido sobre los 3016 artículos reales, y mejorar la presentación visual de la burbuja "Cómo se calculó" del panel de detalle (pedido explícito: "se siente como de una clase de sistema más económico" comparado con el resto de la app).

**1) Bug real encontrado corriendo contra datos reales (no en un test sintético): 26 artículos desaparecían en silencio.** `resumen.totalAsignados` (2990) + `resumen.totalSinAsignar` (0) no sumaba `totalArticulos` (3016) -- 26 artículos no estaban ni asignados ni reportados como sin asignar. Causa: 26 artículos tienen `volumen_m3 = NULL` en la base; el CSV los exporta como el string literal `"null"`, que `Number("null")` convierte a `NaN`. El guardia de "sin dimensiones" en `empaquetarArticulos.js` solo comparaba `a.volumenM3 == null` -- `NaN == null` es `false`, así que un artículo con `NaN` pasaba ese guardia, pero después `NaN > capacidad` y `NaN <= capacidad` son AMBAS `false` (comparación con `NaN` siempre es `false`), así que no caía ni en "grandes" ni en "chicos": nunca se procesaba, nunca se reportaba. Exactamente lo que el propio comentario del archivo promete que no pasa nunca ("nunca se saltea en silencio"). **Corregido** con `Number.isNaN(a.volumenM3)` explícito en el guardia + test de regresión (`empaquetarArticulos.test.js`). Con la corrección: 2990 asignados + 26 sin asignar (motivo `sin_dimensiones_importadas`, real) = 3016, cuadra exacto.

**2) Sala de prueba real generada.** Con el fix aplicado, se corrió `generarPropuestaDistribucion()` (la función real, no una pieza suelta del motor) contra los 3016 artículos reales: 2990 asignados, 26 sin asignar (dato real, no bug), 0 swaps necesarios (Fase 1 + Fase 2 ya resolvieron todo), 99.7% de clase A en zona óptima, 100% de alta frecuencia en zona accesible, densidad ponderada 43.3%. Resultado exportado como SQL en `supabase/sql/2026-08-12_prueba_motor_dos_fases/` (10 partes de ~300 filas, mismo patrón de chunking que las Salas anteriores) -- pendiente que David las corra en el SQL Editor para inspección visual en el Mapa real.

**3) Rediseño de la burbuja de ocupación + segundo bug real encontrado verificando en navegador.** Rediseño visual completo de `ChipPorcentaje`/`BurbujaFormula` (`src/features/mapa/canvas/PanelDetalle.jsx`): anillo de progreso SVG animado (traza su arco al abrir), un "pico" que conecta visualmente la burbuja con el chip que la abrió, barra proporcional por artículo (mismo lenguaje visual que las barras de llenado ya existentes), y entrada/salida animada con `AnimatePresence` -- reusando `ui/motion/tokens.js` (`DURACION`/`EASING`) en vez de inventar timings nuevos (prohibido por `MASTER-PROMPT.md` sección 7). Verificado por primera vez en un navegador real (Playwright headless, vía una ruta de debug temporal en `App.jsx` + un componente mock, ambos revertidos después de verificar -- no quedan en el repo). Esa verificación encontró un **segundo bug real, preexistente** (no introducido en este rediseño, heredado de la implementación original del 2026-08-11): el fondo invisible de "clic afuera cierra la burbuja" usaba `position:fixed; inset:0`, asumiendo que eso siempre se ancla al viewport completo -- pero `.mapa-panel` (el contenedor) tiene `backdrop-filter`, y por spec de CSS eso crea un nuevo *containing block* para cualquier descendiente `position:fixed`. El resultado: el fondo "invisible de pantalla completa" en realidad quedaba recortado al tamaño del panel, así que un clic en el canvas de atrás (fuera del panel) nunca cerraba la burbuja -- solo un clic dentro del panel mismo, en otra parte, la cerraba. **Corregido** reemplazando el fondo `fixed` por un listener de `mousedown` en `document` que cierra si el clic cae fuera de un contenedor con `ref` -- patrón estándar que no depende de ningún contexto de posicionamiento CSS, más simple que lo que reemplaza.

**Verificación:** 462 tests (incluye el nuevo test de NaN), build limpio. Sin commitear -- pendiente de confirmación explícita de David (ver [[feedback_nunca_asumir_consentimiento_push]]).

## ADR-019 — Métricas de productividad extendidas a Despacho y Migración RCL→MZ

**Fecha:** 2026-08-19

**Contexto:** el día del lanzamiento real de la app, David pidió "medir métricas de trabajo". El Dashboard de Productividad ya existía, pero solo cubría movimientos del mapa legacy (tabla `auditoria`) -- no tenía ninguna visibilidad sobre Despacho (tareas por oleada) ni sobre la migración RCL→MZ (traslados por rack), aunque ambos módulos ya guardaban atribución real por persona/etapa.

**Decisión:** dos tablas nuevas en `Dashboard → Productividad` (`src/features/dashboard/Productividad.jsx`), cada una con su propia función pura en `src/domain/metricasProductividad.js` (con test):
- **Despacho por trabajador de piso** (`calcularMetricasDespachoPorTrabajador`): tareas completadas (`estado==='confirmada'`) por `trabajador_numero` -- un NÚMERO de piso, sin cuenta/login (aclarado explícitamente en la UI), no una persona identificada. Requirió una consulta nueva, `despachoService.listarTodasLasTareas()` (paginada), ya que no existía ninguna que trajera tareas de TODOS los lotes -- solo del lote activo.
- **Migración RCL→MZ por persona real** (`calcularMetricasMigracionPorPersona`): suma iniciados/bloqueados/confirmados/aprobados por persona a través de `migracion_slots.listar()` (ya traía todo sin filtrar). Los nombres se resuelven con `mensajesService.listarContactos()` (el RPC `perfiles_para_mensajeria`, ya existente) en vez de `usuariosService.listar()` -- ese sigue restringido a Administrador, y este dashboard lo ve también Supervisor/Lectura (`ver_dashboard` en `roles.js`).

**Verificación:** 472 tests, build limpio, y verificado en un navegador real (Playwright + una ruta de debug temporal con las 3 consultas mockeadas, revertida después) -- las 3 tablas renderizan sin errores de consola, con los números cuadrando exactamente contra los datos simulados.

## ADR-020 — Conflicto entre cambio manual en el mapa y migración pendiente (aviso obligatorio + revisión de Supervisor)

**Fecha:** 2026-08-20

**Contexto:** David describió un escenario real de riesgo: alguien puede mover un artículo a mano en el mapa real (botones "Mover"/"Mover cuerpo", fuera del flujo guiado de migración) mientras ese mismo artículo ya tenía un `migracion_movimiento` pendiente hacia otro rack. Investigación previa confirmó que el hueco era real y ya explotable: `aplicarLote()` (`MapaCanvas.jsx`) solo toca `posiciones_actuales` + auditoría genérica, nunca `migracion_movimientos`/`migracion_slots`/`migracion_buffer` -- y `despachoService.generarLote()` nunca lee `posiciones_actuales`. Un movimiento pendiente afectado por un cambio manual queda huérfano y Despacho lo sigue ofreciendo como tarea real a un trabajador de piso (reproceso garantizado, no hipotético).

**Decisión de negocio confirmada con David (2 preguntas, ambas por la opción recomendada):**
1. El aviso es un **paso obligatorio antes de mover** -- no un chequeo silencioso en segundo plano. Si hay conflicto, el movimiento se PARA con un modal explícito (`ConfirmarConflictoMigracion.jsx`) que exige confirmar o cancelar.
2. Un conflicto confirmado **no se descarta solo** -- queda `estado='a_revisar'` (nunca se borra la fila) hasta que un Supervisor/Administrador lo resuelva en una sección nueva de `PanelMigracion.jsx` ("Movimientos a revisar"): **Restaurar a pendiente** (era falsa alarma) o **Descartar** (definitivo, nunca vuelve a la planificación).

**Diseño:**
- `src/domain/detectarConflictoMigracion.js` (función pura, con test): dado el set de artículos que se están moviendo y los movimientos pendientes que coinciden, devuelve los conflictos. No decide qué hacer, solo los encuentra.
- `migracionMovimientosService.buscarPendientesPorArticulos()` (query nueva) alimenta la detección; `marcarARevisar()`/`listarARevisar()`/`resolverRevision()` (nuevas) manejan el ciclo de vida. `estado` en `migracion_movimientos` ya era texto libre sin CHECK -- agregar `'a_revisar'`/`'descartado'` no rompe nada, y `listarPendientesParaSecuencia()` (ya filtraba por `estado='pendiente'`) excluye automáticamente ambos sin tocarla.
- `MapaCanvas.jsx`: nueva función `prepararYAplicarLote()` se interpone ANTES de `aplicarLote()` en los dos call sites reales (mover individual, mover cuerpo) -- nunca en Sala (`escenarioId` no nulo ahí, las Salas no tienen migración real). **Fail-open en la consulta** (si falla -- ej. el SQL de columnas nuevas todavía no corrió -- se deja pasar el movimiento con un `console.error`, nunca se bloquea la operación real del mapa por un problema de infraestructura ajeno); fail-closed en la DECISIÓN del usuario (si hay conflicto, no se aplica nada hasta que decida).
- SQL nuevo: `supabase/sql/2026-08-20_migracion_movimientos_revision.sql` -- solo `ALTER TABLE ADD COLUMN` (marcado_a_revisar_por/en, motivo_revision, resuelto_por/en), sin tocar RLS (la de UPDATE ya cubre Operador/Supervisor/Administrador; "solo un Supervisor resuelve" se gatea en la UI, mismo criterio que ya usa el resto del panel).

**Verificación:** 478 tests, build limpio, y el modal + la sección nueva de revisión verificados en navegador real con datos simulados (Playwright, ruta de debug temporal revertida después) -- sin errores de consola. El flujo completo de arrastre en el Canvas real (con Supabase real) no se pudo probar end-to-end desde este entorno -- queda para cuando David lo use la primera vez con un conflicto real.

**De paso, corregido (hallazgo de una auditoría de código muerto pedida en la misma sesión):** las 4 lecturas sin paginar de `migracionMovimientos.service.js` (`listarTodos`, `listarTodosCualquierEstado`, `listarPendientesParaSecuencia`, la lectura de respaldo/deshacer) -- ya identificadas como riesgo real en ADR-017/PROGRESO.md, confirmadas sin corregir, ahora corregidas con un helper `seleccionarPaginado()` compartido.

## ADR-021 — `planificarSecuencia.js` prioriza simplicidad, no impacto teórico + clasificación de dificultad de antemano

**Fecha:** 2026-08-20

**Contexto:** durante el diagnóstico del rediseño del motor (ver prompt de diagnóstico de esa misma fecha), corriendo la consulta 4.7 contra datos reales se encontró que **569 orígenes RCL alimentan cada uno a más de un destino MZ distinto** (hasta 11 destinos desde un solo origen, promedio 3 -- causa real: un mismo nivel RCL puede tener varios artículos distintos guardados juntos, confirmado y ya corregido en el esquema desde `2026-07-14_inventario_rcl_actual_pk_fix.sql`, no es un bug de datos). David identificó, sin necesitar el diagnóstico completo, la consecuencia real: `ordenarListos()` en `planificarSecuencia.js` ordenaba los candidatos por **mayor `libera`** (cuántos destinos desbloquea) primero -- es decir, elegía a propósito los orígenes MÁS enredados para arrancar cada oleada, porque en el papel "acortan la cadena total" más rápido. En la práctica, esto hace que "Generar orden de ejecución" arranque con el caso más complicado (múltiples artículos, múltiples destinos) en vez de con movimientos simples y predecibles -- exactamente lo que David reportó como "inicia bien mierda".

**Decisión:** invertir la prioridad. `ordenarListos()` ahora ordena por **menor `libera` primero** (simplicidad real, no impacto teórico), con `nivelesPropios` ascendente como desempate (menos volumen propio primero) antes del desempate alfabético. **Costo aceptado explícitamente:** la cadena total puede tardar más oleadas en resolverse del todo -- se prioriza que el trabajo de cada oleada sea predecible para quien lo hace, por sobre minimizar el número teórico de oleadas.

**Además, pedido explícito de David** ("que se sepa de antemano, no un recálculo del motor cada vez que considere una nueva ruta"): nueva función pura `calcularDificultadPorRack(movimientosPendientes, identidadLegacy, slotsActuales?)`, que corre el grafo de dependencias UNA sola vez y devuelve `{mzPasillo, mzColumna, libera, nivelesPropios, dificultad}` para **todos** los racks del plan -- incluidos los bloqueados hoy por una dependencia, y los orígenes "puros" que nunca son destino de nada (hub que solo alimenta a otros). Esto último expuso un gap real en `construirGrafoDependencias()`: antes, `desbloquea`/`nivelesDeOrigen` solo se registraban para orígenes que TAMBIÉN eran destino de algo en el plan -- un hub puro quedaba sin registrar en absoluto. Corregido separando esa parte de la lógica de la que sí depende de ser destino (la de `dependenciasPendientes`, que debe seguir igual -- un origen que nunca es destino de nada correctamente nunca bloquea a nadie).

`clasificarDificultad(libera, nivelesPropios)` usa umbrales como datos (`UMBRAL_DIFICULTAD`, Ley 8): fácil ≤1/≤1, normal ≤3/≤3, el resto difícil.

**Pendiente, no decidido todavía:** si esta clasificación se muestra en alguna pantalla (ej. como advertencia al generar una orden en `PanelDespacho.jsx`) -- hoy solo existe como función exportada, sin UI que la consuma.

**Verificación:** 484 tests (11 nuevos: 4 de `clasificarDificultad`, 3 de `calcularDificultadPorRack`, 4 reescritos por el cambio de prioridad), build limpio. Sin commitear -- pendiente de confirmación explícita de David.
