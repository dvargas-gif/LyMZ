# BACKLOG-MIGRACION.md — Medidor honesto del Strangler Fig

> Lista de lógica de negocio que hoy vive fuera del dominio (duplicada, o en una vista, o en el mapa legacy) y las queries directas a Supabase que existen. Se achica fase a fase. No es una lista de "todo lo que consulta Supabase" — la capa de servicios (`*.service.js`) ya es limpia (ver abajo); lo que importa acá es dónde vive el CÁLCULO, no el acceso a datos.

## Herencia para Fase 2 (priorizada) — actualizada en Fase 2 paso 1

1. **(Alta) Ítem #1 — el mapa legacy sigue con su propia mutación de `CUERPOS`.** 🔶 **En progreso:** el bridge (`construirEstadoInicial()`) ya sabe traducir un `WarehouseSnapshot` al payload de `slotting:estadoInicial`, aislado, sin conectar. Falta: conectarlo al postMessage real y cambiar el punto de entrada en `12-arranque.js:18-21` (el único cambio permitido al mapa legacy, ver `PROTOCOLO-MAPA.md`).
2. **(Alta, nuevo — Fase 2 paso 1) Campo `grupo` ausente en `posiciones`** — `resolverPosicionesActuales()` (desde G1b) nunca trackeó `grupo`, y el mapa legacy sí lo usa (`aplicarPosicionGuardada`, con fallback `grupo||"-"`). Detectado por la comparación byte a byte del paso 1 (ver `PROGRESO.md`). **Decisión pendiente de aprobación** antes de conectar el bridge: agregar `grupo` al contrato de G1b, o aceptar el gap (el mapa ya tiene fallback, no rompe, solo pierde un dato de agrupación en movimientos individuales).
3. **(Media) ADR-003 sin resolver** — `CUERPOS` vs `inventario_slotting` sigue sin el conteo real (bloqueado por RLS). La Fase 2 va a exponer esto con más urgencia: el bridge necesita construir el snapshot desde la fuente que el dominio ya eligió (`inventario_slotting`), así que cualquier divergencia real con `CUERPOS` se va a notar en cuanto el mapa deje de usar su propia copia.
4. **(Media) Hallazgo #4 de G1c** — movimientos de un solo artículo (no de cuerpo completo) probablemente no llevan `clase`/`tipo`. La comparación byte a byte del paso 1 no lo pudo confirmar con datos reales (mismo bloqueo de RLS) — sigue abierto.
5. **(Baja) Ítem #3 — `exportar()` en el mapa.** Tercera implementación de "aplanar a filas". No bloquea la Fase 2, pero cuando el mapa empiece a recibir snapshots en vez de calcular, es un buen momento para reconsiderar si `exportar()` debería consumir el snapshot en vez de `CUERPOS` directamente.
6. **(Informativa) Preguntas de RLS sin versionar** (`profiles`, `posiciones_actuales`, `bloqueos`, `auditoria`, etc.) — no bloquea la Fase 2 mientras no se toque el schema, pero conviene tenerlo resuelto antes de la Fase 5 (optimización, que sí escribe al almacén).

## 1. Lógica de negocio duplicada (prioridad alta — ver DECISIONES.md ADR-001)

| # | Lógica | Ubicación A | Ubicación B | Estado |
|---|---|---|---|---|
| 1 | Merge base + overrides (posición real de un artículo) | `public/legacy/js/10-servicios.js:29` (`aplicarPosicionGuardada`, muta `CUERPOS`) | ~~`src/features/reportes/reporte.service.js:20`~~ | 🟢 **Resuelto del lado B (G1b, 2026-07-06):** `reporteService.obtener()` ya no reimplementa el merge — consume `src/domain/resolverPosicionesActuales.js` (10 tests, comparación byte-a-byte contra el algoritmo anterior documentada en `PROGRESO.md`). 🔴 **Sigue duplicado del lado A:** el mapa legacy sigue teniendo su propia mutación de `CUERPOS` vía `aplicarPosicionGuardada` — a propósito, no se toca hasta la Fase 2 (Strangler Fig, ver `MASTER-PROMPT.md` sección 5, Fase 2 y `PROTOCOLO-MAPA.md`). Hasta entonces, las DOS implementaciones coexisten: la del dominio (autoritativa para Reportes/futuro Dashboard/3D/simulación) y la del mapa (autoritativa solo para su propio render, aislada). |

## 2. Cálculo de negocio dentro de un componente de vista (prioridad baja — sin dependencia de Supabase, bajo riesgo)

| # | Lógica | Archivo:línea | Nota |
|---|---|---|---|
| 2 | ~~`calcularMetricasPorUsuario`, `agruparPor`~~ | ~~`src/features/dashboard/Productividad.jsx:4-36`~~ | 🟢 **Resuelto en G1e (2026-07-06):** movidas a `src/domain/metricasProductividad.js` con 8 tests. `Productividad.jsx` ya no llama a `auditService` directo — usa `WarehouseModel.cargarMovimientos()`/`.movimientos()`. |
| 3 | `exportar()` — tercera implementación de "aplanar el estado a filas" | `public/legacy/js/11-buscar-exportar.js:15-33` | Ver ADR-007 (G1d) e `INVENTARIO-LOGICA-MAPA.md` sección 4. Formato de ubicación propio, hoja "Cambios" que sale de un log en memoria de sesión (no de la auditoría real). No se toca hasta que se diseñe la unificación de reportes/exportación (post Fase 2) — se registra para no perderlo de vista. |

## 3. Preguntas abiertas (no son tareas de migración todavía — hay que confirmar antes)

| # | Pregunta | Por qué importa |
|---|---|---|
| 3 | ¿`inventario_slotting` (tabla Postgres) y `CUERPOS` (literal en `01-datos.js`, ~270 KB) están sincronizados, o uno es una copia congelada del otro en algún momento del pasado? | Si ya divergieron, construir `WarehouseModel` sobre uno u otro da resultados distintos — hay que confirmarlo con el usuario antes de decidir cuál es la fuente de verdad de la geometría base. |
| 4 | ¿Existen políticas RLS reales sobre `profiles`, `posiciones_actuales`, `bloqueos`, `auditoria`, `articulos_info`, `inventario_slotting`, `config_mapa`? | `db/schema.sql` las marca `[NO VERSIONADO]` — no confirmadas desde el repo. Bloquea documentar RLS con certeza (ya señalado antes de esta fase). |

## 4. Suscripciones Realtime — inventario completo (verificado por grep, no supuesto)

| # | Canal | Archivo:línea | Se activa cuando | Tablas escuchadas |
|---|---|---|---|---|
| — | `reporte-posiciones` | `src/features/reportes/reporte.service.js:56` | `ReportePanel.jsx` está montado y sin `escenarioId` | `posiciones_actuales` |
| — | `reporte-escenario-{id}` | `src/features/reportes/reporte.service.js:51` | `ReportePanel.jsx` está montado con una sala abierta | `escenario_posiciones`, `escenario_eliminados` |

**Es la ÚNICA suscripción Realtime en todo el código fuente** (confirmado por grep de `.channel(`/`postgres_changes` sobre `src/`). 🟢 **Resuelto en G1d (ADR-008):** la suscripción vive ahora dentro de `WarehouseModel` (instancia compartida vía `obtenerWarehouseModel()`), y `reporte.service.js.suscribirCambios()` delega ahí en vez de abrir su propio canal — mismos canales, mismos filtros, `ReportePanel.jsx` sin cambios.

## 5. Línea base medida (Fase 0 — para comparar después de cada fase)

| Métrica | Valor | Cómo se midió |
|---|---|---|
| Bundle principal (`index-*.js`) | **388.35 kB** (gzip 112.46 kB) | `npm run build`, 2026-07-06 |
| Chunk `xlsx` (separado, lazy) | **424.23 kB** (gzip 141.75 kB) | idem — nunca se descarga si el usuario no usa carga masiva/export |
| Total de chunks lazy (`React.lazy`) | 18 archivos | conteo de `dist/assets/*.js` tras el build, sin contar `index` ni `xlsx` |
| Suscripciones Realtime activas por sesión de uso normal | 1 (solo si se abre "Reportes") | inventario estático (sección 4) — no hay suscripciones que corran "siempre", son on-demand por componente montado |
| CSS total | 10.40 kB (gzip 2.89 kB) | idem build |
| Tiempo de carga del dashboard con datos reales | **No medido** | Requiere una sesión autenticada real contra Supabase; no se fabrican credenciales de prueba (mismo criterio ya aplicado al scope de los tests e2e). Pendiente: o el usuario lo mide con DevTools, o se define un usuario de prueba dedicado. |

**Comparación al cierre de Fase 1 (2026-07-06):** bundle principal **388.35 kB** (prácticamente sin cambio — la capa de dominio completa, Zod y Framer Motion NO tocaron el bundle principal). `xlsx` sin cambio (424.23 kB, lazy). Nuevo: `WarehouseSnapshot`/Zod aislado en su propio chunk (~74 kB, lazy, solo si algo llama a `.snapshot()`). El chunk de `DashboardAnalitico` creció de 4.54 kB a 138.19 kB por Framer Motion — aislado a la única feature que lo usa, no se filtró a ninguna otra (ver `PROGRESO.md` sesión G1e). Suscripciones Realtime activas siguen siendo 1 (ahora dentro del modelo, no en `reporte.service.js`).

## 6. Capa de servicios (`*.service.js`) — YA LIMPIA, no es backlog, es la base sobre la que se construye el dominio

Confirmado en la exploración de G0: **no hay queries directas a Supabase dentro de componentes `.jsx`**. Los 14 archivos de servicio ya son el punto de entrada único a Supabase por tabla:

`auth.service.js`, `storage.supabase.js`, `pasillosConfig.service.js`, `posiciones.service.js`, `usuarios.service.js`, `configMapa.service.js`, `articulos.service.js`, `inventario.service.js`, `bloqueos.service.js`, `escenarioBloqueos.service.js`, `escenarioEliminados.service.js`, `escenarioPicks.service.js`, `escenarios.service.js`, `escenarioPosiciones.service.js`.

Esto es una base mejor de lo esperada — el dominio se construye **encima** de estos servicios (los llama para obtener datos crudos), no reemplazándolos.

## 7. Precedentes ya alineados con las leyes de arquitectura (no requieren migración, sirven de modelo a seguir)

| Módulo | Por qué ya cumple |
|---|---|
| `src/features/cargaMasiva/cargaMasiva.service.js` (`validarCargaMasiva`) | Función pura, con test (`cargaMasiva.service.test.js`), sin Supabase ni DOM — Ley 7 aplicada de hecho. |
| `src/features/salas/analisisPicks.js` (`calcularAnalisis`) | Función pura, con test (`analisisPicks.test.js`), calcula recomendaciones sobre datos ya resueltos — es, en la práctica, el embrión del motor de optimización (Sección 7 del documento de arquitectura), sin que se lo hayamos construido a propósito. |

## Progreso (al cierre de Fase 1)

- Total ítems de prioridad alta: 1 → resueltos: 0.5 (lado React resuelto en G1b; lado mapa legacy es exactamente el trabajo de la Fase 2)
- Total ítems de prioridad baja: 2 → resueltos: 1 (`calcularMetricasPorUsuario`/`agruparPor`, G1e). Pendiente: `exportar()` (ítem #3).
- Preguntas abiertas: 2 → respondidas: 0 (ambas heredadas a Fase 2, ninguna la bloquea — ver "Herencia para Fase 2" arriba)
- Suscripción Realtime: 🟢 resuelta (G1d, ADR-008)
