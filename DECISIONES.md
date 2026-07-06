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
