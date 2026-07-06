# PROGRESO — Evolución a Digital Twin

> Estado vivo. Se actualiza al final de cada sesión de trabajo, sin excepción.
> Ver también: `DECISIONES.md` (ADRs), `DOMAIN.md` (contrato del modelo), `BACKLOG-MIGRACION.md` (deuda de migración).

## Fase actual: **FASE 1 COMPLETA — compuerta G1→G2, esperando aprobación** (ver `MASTER-PROMPT.md` sección 5)

- ✅ **G0 — Exploración**: completa y aprobada por el usuario.
- ✅ **G1 — Capa de dominio + Dashboard + animaciones**: completa, subdividida en G1a-G1e (ver ADR-002).
  - 🟡 **G1a — ¿`CUERPOS` vs `inventario_slotting` sincronizados?**: quedó **inconclusa por RLS** (ADR-003), pero el usuario aprobó avanzar con la recomendación (c) del ADR sin el conteo numérico confirmado — decisión explícita, riesgo asumido. Sigue abierta como pregunta de fondo, no bloquea el resto.
  - ✅ **G1b — `resolverPosicionesActuales()` + migrar `reporteService.obtener()`**: completa.
  - ✅ **G1c — inventario de lógica de negocio dentro del mapa legacy**: completo. Ver `INVENTARIO-LOGICA-MAPA.md`.
  - ✅ **G1d — `WarehouseModel` + `WarehouseSnapshot v1` (Zod)**: completa. Ver ADR-004 a 008.
  - ✅ **G1e — Dashboard (Productividad) migrado + `src/ui/motion/`**: completa. Ver detalle abajo.
  - 📄 **ADR-009** — consecuencias de "Sala = instancia alternativa" escritas por pedido del usuario, antes de que Fases 2-4 dependan de la decisión.

**Próxima fase (bloqueada hasta aprobación explícita del usuario): FASE 2 — Mapa legacy, Strangler Fig.**

## Checklist de G0 (histórico, ya cerrado)

1. Schema real de Supabase — ✅ (`db/schema.sql`).
2. Inventario de queries directas y Realtime — ✅ (14 servicios limpios; 1 sola suscripción Realtime en todo el código, `reporte.service.js`) — `BACKLOG-MIGRACION.md` #4.
3. Protocolo postMessage del mapa legacy — ✅ `PROTOCOLO-MAPA.md` (8 tipos mapa→React, 3 React→mapa).
4. Línea base — ✅ bundle (388.35 kB + 424.23 kB `xlsx` lazy); ⬜ tiempos de carga con datos reales (no medible sin credenciales de prueba, pendiente de decisión del usuario).
5. Archivos de gobierno — ✅ `PROGRESO.md`, `DECISIONES.md`, `DOMAIN.md`, `BACKLOG-MIGRACION.md`, `PROTOCOLO-MAPA.md`, y ahora `MASTER-PROMPT.md` (creado en sesión 3, ver ADR-002).

**Hallazgo central de G0:** lógica de negocio duplicada real (merge base+overrides) entre `10-servicios.js` (`aplicarPosicionGuardada`) y `reporte.service.js` (`reporteService.obtener`) — ADR-001.

## G1a — qué se hizo y por qué quedó abierta (ver ADR-003 para el detalle completo)

- ✅ `CUERPOS` parseado localmente (sin red, sin tocar el mapa): 3016 artículos únicos, 0 duplicados internos — consistente con lo documentado en `db/schema.sql`.
- 🔴 Consulta de solo lectura a `inventario_slotting` (mismo anon key que ya usa la app): **0 filas, sin error**. Control cruzado contra `pasillos_config`/`articulos_info`/`posiciones_actuales` con el mismo resultado (0 filas en las 4) — indica con bastante confianza que es **RLS bloqueando lectura sin sesión autenticada**, no que las tablas estén vacías (`pasillos_config` se sabe que tiene datos reales en producción).
- Como resultado: **(a) cantidad de artículos que divergen** y **(b) patrón de divergencia** no se pudieron medir — no se fabricó una sesión para saltar el bloqueo (regla explícita de la tarea). **(c)** recomendación entregada igual, razonada con la evidencia estructural disponible (ver ADR-003): `inventario_slotting` como fuente autoritativa de `posicionBase`, y modelar `posicionBase`/`posicionActual` como conceptos separados en el dominio — esto último ya está confirmado por cómo el código actual trata el problema, independientemente del resultado numérico pendiente.
- Efecto colateral detectado, a validar: si `inventario_slotting` estuviera realmente vacía en producción, `reporteService.obtener()` ya estaría perdiendo la base silenciosamente hoy — más urgente que este roadmap si se confirma.

## G1b — qué se hizo

- ✅ Creado `src/domain/` con `resolverPosicionesActuales.js` — función pura (cero imports de React/DOM/Supabase), recibe `base`, `movimientos`, `eliminados` ya cargados (no los busca). Expone `posicionBase` y `posicionActual` como campos SEPARADOS por objeto (decisión de ADR-003), nunca fusionados.
- ✅ `src/domain/resolverPosicionesActuales.test.js` — **10 tests**, Vitest, siguiendo el patrón de `cargaMasiva.service.test.js`: caso normal, sin movimientos, movimientos múltiples (gana el último válido, los inválidos se ignoran), artículo sin base (`sinBase: true` explícito, no `undefined` silencioso), base/movimientos vacíos, artículo eliminado (`posicionActual: null` explícito), y **2 tests con datos reales** del artículo `6104570` extraído del parseo de `CUERPOS` en el diagnóstico de ADR-003 (nota honesta: no hubo un artículo *divergente* real disponible porque esa comparación nunca se completó — se usó el dato real disponible, el de `CUERPOS`, en vez de inventar un caso de divergencia).
- ✅ Migrado `reporte.service.js:20` (`reporteService.obtener`) para consumir `resolverPosicionesActuales()` en vez de reimplementar el merge.
- ✅ **Comparación vieja-vs-nueva documentada** (no solo "los tests pasan"): script puntual (ejecutado y borrado) que corrió el algoritmo viejo (copiado verbatim antes de tocarlo) y el nuevo sobre un dataset sintético que ejercita las 6 ramas del algoritmo (no movido, movido con clase heredada, movido con clase explícita, movimientos duplicados con uno inválido en medio, artículo sin base, eliminado, sin descripción) — **`JSON.stringify` idéntico entre ambos, byte a byte**. No se pudo repetir esto contra un snapshot real de producción (mismo bloqueo de RLS que ADR-003/G1a), así que se maximizó la cobertura de casos sintéticos en su lugar — se documenta esta limitación en vez de callarla.
- ✅ Verificado con `git diff`: `public/legacy/` sin cambios, `package.json` sin dependencias nuevas de esta sesión (el único diff que tiene es de una sesión previa no relacionada, Playwright).
- ✅ Suite completa: **47/47 tests en verde** (37 previos + 10 nuevos). Build limpio, bundle principal sin cambio (388.35 kB).
- ✅ `BACKLOG-MIGRACION.md` #1 actualizado: resuelto del lado React, explícitamente pendiente del lado mapa legacy (a propósito, es trabajo de la Fase 2).

## G1c — qué se hizo

- ✅ Lectura completa de los 9 archivos JS del mapa legacy (907 líneas, todo el código -- no una muestra) y catalogación en `INVENTARIO-LOGICA-MAPA.md` (nuevo).
- Hallazgos principales:
  1. **Fórmulas de ocupación reales** (`nArts`, `nivelesArmar`, `consumoTotal`, `llenura` en `05-ayudantes.js`) — candidatos directos a métodos de `WarehouseModel` en G1d, con la constante de capacidad (4.5 = 5 niveles × 0.90) hoy hardcodeada sin ningún lugar donde configurarla.
  2. **Tres escalas de umbral de "cuánto es demasiado" sin centralizar** (rack: 1.0/0.85/0.4, nivel: 0.90, artículo: 0.90/0.60) — G1d tiene que elegir, no inventar una cuarta.
  3. **`niveles_a_armar` tiene dos significados posibles** (columna congelada en la tabla vs. cálculo en vivo del mapa) — a resolver en G1d, no asumir que son lo mismo.
  4. **Hallazgo de mayor impacto:** `confirmar()` (mover un solo artículo) llama `notificarPosicion()` SIN `clase/grupo/tipo` (`08-interacciones.js:144`), a diferencia de `soltarCuerpoEn()` (mover un rack completo) que sí los envía. Esto es, con bastante probabilidad, la razón real por la que el fallback `clase ?? actual.clase` de `resolverPosicionesActuales()` es necesario en producción — no es código defensivo "por si las moscas". Pendiente de confirmar con datos reales cuando se resuelva el bloqueo de RLS (mismo de ADR-003).
  5. Geometría real no capturada en ninguna tabla: agrupación de pasillos en pares (`GRUPO_GAP_DESPUES`) y orden de niveles (`NIVORDER`) — relevante si simulación (Fase 3) necesita adyacencia de pasillos.
  6. `exportar()` (`11-buscar-exportar.js`) es una TERCERA implementación independiente de "aplanar el estado a filas" (además de `reporteService` y del propio render del mapa) — no se toca ahora, se registra como antecedente para cuando se diseñe la unificación de reportes.
- ✅ Verificado con `git diff`: `public/legacy/` sin cambios (solo lectura, como en G1a/G1b).

## G1d — qué se hizo

Instalado `zod` (única dependencia nueva permitida en esta etapa, aprobada explícitamente).

**Las 4 preguntas abiertas de G1c, resueltas y documentadas (nunca en silencio):**
- **ADR-004** — capacidad de rack (4.5) pasa a `configuracionOcupacion.capacidadUtilRack`, mismo valor por defecto, ya no enterrada.
- **ADR-005** — las tres escalas de umbral (rack/nivel/artículo) se preservan SEPARADAS (miden cosas distintas: agregado de rack, agregado de nivel, concentración por artículo) pero centralizadas en un solo archivo — cero escala nueva inventada.
- **ADR-006** — `niveles_a_armar` queda reservado para el valor congelado de `inventario_slotting` (campo de `posicionBase`, sin tocar la columna real); el cálculo en vivo del mapa se expone como `nivelesOcupados()` — nombre distinto, mismo resultado, sin ambigüedad.
- **ADR-007** — `exportar()` (tercera duplicación del aplanado) va solo al backlog (`BACKLOG-MIGRACION.md` #3), no se toca.

**Código nuevo en `src/domain/`:**
- `configuracionOcupacion.js` — constantes de ADR-004/005.
- `formulasOcupacion.js` + tests — `nArts`, `nivelesOcupados`, `consumoTotal`, `llenura`, `colorLlenura`, portadas COMO ESTÁN del mapa legacy (mismos resultados, tests fijan el comportamiento actual, no lo mejoran).
- `agruparPorRack.js` + tests — reconstruye la forma `{niveles: {nivel: [articulos]}}` desde la salida de `resolverPosicionesActuales()`, para que las fórmulas de ocupación tengan qué consumir.
- `WarehouseSnapshot.js` — esquemas Zod (`PosicionBaseSchema`, `ArticuloResueltoSchema`, `MovimientoSchema`, `WarehouseSnapshotSchema`) + `crearSnapshot()`. **WarehouseSnapshot v1**, documentado con versión en `DOMAIN.md`.
- `crearWarehouseModel.js` + tests — el agregado: `cargar()`/`recargarTodo()`, `posiciones()`/`bloqueos()`/`movimientos()`/`racks()`/`ocupacionDeRack()`/`snapshot()`, servicios inyectables (reutiliza `*.service.js` reales, nunca reimplementa acceso a Supabase), suscripción Realtime movida acá (**ADR-008**) con instancia compartida por `escenarioId` (`obtenerWarehouseModel`) para no duplicar el canal.
- `sinReactNiDom.test.js` — chequeo estático automático: falla la suite si algún archivo de `src/domain/` llega a importar React/react-dom o referenciar `document.`/`window.`.
- Migrado `reporte.service.js.suscribirCambios()` para delegar en la instancia compartida en vez de abrir su propio canal — `ReportePanel.jsx` no cambió una línea.

**Hallazgo durante la implementación (documentado en ADR-008, no oculto):** la primera versión hacía que Zod se colara en un chunk compartido con Carga Masiva/Salas (2 kB → 80 kB) por un import estático. Se corrigió con `import()` dinámico dentro de `snapshot()` (que pasó a ser async) — Zod quedó en su propio chunk (`WarehouseSnapshot-*.js`, ~74 kB), descargado solo cuando alguien llama a `.snapshot()` de verdad. Bundle principal sin cambio (388.30 kB).

**Verificación:**
- `git diff public/legacy/` → vacío, mapa legacy intacto.
- Suite completa: **80/80 tests en verde** (47 previos + 33 nuevos: 10 de fórmulas, 5 de agrupación, 9 del modelo, 9 del chequeo estático).
- Build limpio, bundle principal 388.30 kB (sin cambio), `xlsx` 424.23 kB (sin cambio), Zod aislado en su propio chunk lazy de ~74 kB.
- `package.json`: única dependencia nueva es `zod@^4.4.3`, aprobada.

**Nota de diseño, formalizada en ADR-009 por pedido del usuario:** "Sala" en el dominio = instancia alternativa completa del modelo (`escenarioId`), nunca un hijo anidado de Warehouse. El diagnóstico de G1d la señaló al pasar; el usuario pidió (antes de aprobar G1e) que quedaran escritas las consecuencias para Fase 2/3/4 — ver ADR-009: qué implica para un análisis de simulación que cruce salas, qué representa exactamente un `WarehouseSnapshot` (una sola instancia, nunca el almacén con todas sus salas adentro), y el límite conocido para una vista 3D que compare salas lado a lado.

## G1e — qué se hizo

Instalado `framer-motion` (única dependencia nueva de esta etapa, aprobada).

**Confirmado antes de migrar (no asumido):** `calcularMetricasPorUsuario`/`agruparPor` en `Productividad.jsx` ya eran funciones puras a nivel de módulo (sin closures sobre estado de React, sin DOM) — la única deuda real era la ubicación (sin test propio) y que el componente llamaba a `auditService.listar({})` directo en vez de pasar por el dominio.

**Dashboard migrado:**
- `src/domain/metricasProductividad.js` + tests (11) — las dos funciones, portadas tal cual, con test.
- `crearWarehouseModel.js` — nuevo método `cargarMovimientos()`: trae SOLO el histórico de auditoría, sin forzar una recarga completa de posiciones/bloqueos/descripciones. Se agregó a propósito para que migrar Productividad al modelo no fuera una regresión de red (antes solo pedía auditoría; forzar `cargar()` completo le habría agregado 5 fetches que nunca necesitó). Test que verifica explícitamente que `listarBase` NO se llama de nuevo.
- `Productividad.jsx` — ya no importa `auditService`; usa `obtenerWarehouseModel(null).cargarMovimientos()` + `.movimientos()`. Cero cambio de comportamiento observable (misma carga única al montar, sin suscripción Realtime — la tabla `auditoria` no está entre las que el modelo escucha hoy, ver `DOMAIN.md`).

**Sistema de animaciones `src/ui/motion/`:**
- `tokens.js` — duraciones/easings centralizados (150/300/500/600ms + 800ms/1.5s reservados para Fase 3/4, mismo estándar completo de `MASTER-PROMPT.md` sección 7 en un solo lugar).
- `prefersReducedMotion.js` — lectura puntual + hook reactivo, global.
- `variants.js` + tests (6) — entrada con stagger (~40ms), pulso de escala, transición de layout.
- `useCountUp.js` — count-up ~600ms vía `animate()` de Framer Motion, salta directo al valor final con `prefers-reduced-motion`.
- `useDestacarAlCambiar.js` — detecta cambios de valor para disparar highlight (no se dispara en el montaje inicial).
- `Skeleton.jsx` — shimmer implementado con `transform: translateX` (nunca `background-position`) + entrada fade/slide-up con stagger.
- `AnimatedCard.jsx` — FLIP vía `layout` de Framer Motion (que ya usa `transform` internamente).
- `KpiValor.jsx` — combina count-up + pulso de escala + transición de color 350ms (color permitido explícitamente junto al pulso, no es una propiedad de layout).
- Aplicado a `Productividad.jsx`: skeletons durante la carga, `AnimatedCard` en las dos cards de resumen, `KpiValor` en cada número (KPIs de resumen y la tabla de ranking).

**Higiene de bundle (misma vara que Zod en G1d):**
- Bundle principal: **388.35 kB — sin cambio real** (línea base 388.30 kB).
- `framer-motion` **no** se coló en ningún chunk compartido con features que no animan — se verificó con `grep -rl "framer-motion" src/`: solo 4 archivos de `src/ui/motion/` lo importan, y el único consumidor es `Productividad.jsx`, que solo lo usa `DashboardAnalitico.jsx` (ya lazy). Resultado: el chunk `DashboardAnalitico-*.js` pasó de 4.54 kB a **138.19 kB** (gzip ~45.75 kB) — pero ESE es exactamente el costo de la única feature que pidió animarse, no una fuga a Carga Masiva/Salas/Reportes/etc. No se aisló más allá de esto porque no hay a quién aislarle el costo: es el precio real y contenido de tener animaciones en el Dashboard.
- `xlsx` (424.23 kB) y `WarehouseSnapshot`/Zod (~74 kB) sin cambios, siguen aislados.

**Verificación:**
- `git diff public/legacy/` → vacío.
- Suite completa: **96/96 tests en verde** (80 previos + 16 nuevos, repartidos entre `metricasProductividad.test.js`, el test nuevo de `cargarMovimientos()` en `crearWarehouseModel.test.js`, y `variants.test.js`).
- `package.json`: única dependencia nueva `framer-motion`, aprobada.

## Propuesta pendiente de decisión del usuario (no bloquea el cierre de Fase 1, pero tampoco se construyó sin su aprobación)

KPIs candidatos a exponer YA como vista nueva (las fórmulas ya viven en `formulasOcupacion.js`/`WarehouseModel`, agregarían valor real: el mapa nunca tuvo una vista agregada, solo celda por celda) vs. los que deberían esperar a Fase 2+ — presentados en el mensaje de cierre de esta sesión, sin construir nada todavía.

## Cierre de Fase 1 — resumen

Fase 1 completa: capa de dominio (`src/domain/`) construida sobre los servicios existentes, `WarehouseSnapshot v1` versionado y validado con Zod, Realtime centralizado en una instancia compartida, fórmulas de ocupación portadas con test, Dashboard/Productividad migrado, sistema de animaciones transversal instalado y aplicado. Mapa legacy intacto en las 4 sub-etapas que lo tocaron solo de lectura (G1a/b/c/d/e). 9 ADRs registrados (001-009). Ver `BACKLOG-MIGRACION.md` para lo que hereda la Fase 2, priorizado.

## Bloqueos

- Ninguno técnico. Bloqueo de proceso: compuerta G1→G2 pendiente de aprobación explícita — es grande, se revisa a fondo antes de tocar el mapa legacy (pedido explícito del usuario).
- Preguntas de fondo sin resolver, heredadas a Fase 2 (ninguna bloquea el arranque): ADR-003 (`CUERPOS` vs `inventario_slotting`, sin conteo real) y el hallazgo #4 de G1c (clase/tipo ausente en movimientos individuales, sin confirmar con datos reales) — mismo origen (RLS sin sesión autenticada).

## Historial de sesiones

- **2026-07-06 (sesión 1)** — Arranque del protocolo de gobierno. Se crearon 4 archivos. Exploración real de código → hallazgo ADR-001. Informe de exploración entregado.
- **2026-07-06 (sesión 2)** — El usuario formalizó el plan completo de 7 fases (G0-G6) con criterios de aceptación y estándar de animaciones. Se completó lo que faltaba de G0 (Realtime, protocolo postMessage, línea base de bundle).
- **2026-07-06 (sesión 3)** — Usuario confirma G0 aprobado y redefine Fase 1 en 5 sub-etapas (G1a-G1e). Se creó `MASTER-PROMPT.md` (no existía como archivo) con la subdivisión ya incorporada — ADR-002. Se ejecutó el diagnóstico de G1a: `CUERPOS` verificado limpio (3016 únicos, 0 duplicados), pero la comparación contra `inventario_slotting` quedó bloqueada por RLS sin sesión autenticada (confirmado con control cruzado en 4 tablas) — ADR-003. G1a se registró como no completada.
- **2026-07-06 (sesión 4)** — Usuario aprueba ADR-003 y ordena arrancar G1b con alcance exacto. Se creó `src/domain/resolverPosicionesActuales.js` + 10 tests, se migró `reporteService.obtener()`, se verificó equivalencia byte-a-byte contra el algoritmo anterior con datos sintéticos (bloqueo de RLS impidió usar datos reales de producción), y se confirmó que el mapa legacy y `package.json` quedaron intactos. 47/47 tests, build limpio. G1b completa, esperando aprobación para G1c.
- **2026-07-06 (sesión 5)** — Usuario responde "G1 aprobado" — interpretado como aprobación de G1b y luz verde para continuar a G1c (no como saltar las mini-compuertas restantes de G1). Se ejecutó G1c: lectura completa del mapa legacy (907 líneas, los 9 archivos), catalogado en `INVENTARIO-LOGICA-MAPA.md` (nuevo) — fórmulas de ocupación reales, tres escalas de umbral sin centralizar, doble significado de `niveles_a_armar`, y el hallazgo de que `confirmar()` no envía clase/tipo al mover un solo artículo (probable explicación del fallback que ya tiene `resolverPosicionesActuales()`). Mapa legacy verificado intacto. G1c completa, esperando aprobación para G1d.
- **2026-07-06 (sesión 6)** — Usuario aprueba G1c y confirma la interpretación de "G1 aprobado" (era solo G1b). Aprueba instalar Zod. Ordena arrancar G1d con condiciones explícitas: resolver las 4 preguntas de G1c como ADRs (004-007), incorporar `resolverPosicionesActuales()` al modelo, mover la única suscripción Realtime al modelo (ADR-008), portar las fórmulas de ocupación tal cual, y pausar ante cualquier fork con consecuencias distintas. Se construyó `src/domain/` completo (configuración, fórmulas, agrupación por rack, `WarehouseSnapshot` v1 con Zod, `crearWarehouseModel`), se migró `reporte.service.js` para delegar Realtime en la instancia compartida, y se corrigió un problema de bundling real detectado durante la verificación (Zod colándose en un chunk compartido con Carga Masiva/Salas) con `import()` dinámico. 80/80 tests, build limpio, mapa legacy intacto. G1d completa, esperando aprobación para G1e.
