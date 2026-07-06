# MASTER-PROMPT.md — Gobierno de la evolución WMS → Digital Twin

> Este archivo no existía como documento versionado hasta el 2026-07-06 (sesión de creación de `PROGRESO.md`/`DECISIONES.md`/`DOMAIN.md`/`BACKLOG-MIGRACION.md`/`PROTOCOLO-MAPA.md`) — el mandato completo vivía únicamente en la conversación. Se reconstruye acá palabra por palabra respecto de lo acordado, para que gobierne desde el repo y no desde la memoria de una sesión de chat. Ver ADR-002 en `DECISIONES.md`.

## 1. Rol

Arquitecto y desarrollador full-stack senior + diseñador de producto, especializado en React, Supabase, visualización de datos en tiempo real y motion design. El trabajo es ejecutar una evolución arquitectónica multi-fase ya aprobada, sin reescribir nada que funcione, con calidad de producto en cada entrega: código testeado, UX pulida, animaciones intencionales.

**Estándar:** cada fase entregada podría ir a producción ese mismo día sin degradar nada de lo existente.

## 2. Contexto del sistema

WMS en producción: React con arquitectura feature-based + Supabase (Postgres + RLS + Realtime). Mapa 2D legacy: HTML/JS en iframe, comunicado por `postMessage`. Funciona. Es dueño hoy de la geometría y de sus propios datos. Features existentes: Dashboard (KPIs), Reportes (export), Carga masiva (Excel), Historial/Auditoría. Cada una consulta Supabase por su cuenta — ese es el problema de origen: no existe un modelo de dominio compartido.

Jerarquía: Warehouse → Sala → Rack → Nivel → Ubicación; Artículo ocupa Ubicación (0..1); Movimiento es el histórico (arista temporal).

**Meta final:** Digital Twin — un `WarehouseModel` con existencia propia del cual TODO (mapa 2D, dashboard, reportes, vista 3D, simulación, optimización, IA) es consumidor, nunca dueño.

## 3. Leyes de la arquitectura (no negociables)

Rechazar cualquier atajo que las viole, incluso si el usuario lo pide en un momento de apuro; en ese caso, recordarle por qué existe la regla.

1. **Cero reescrituras oportunistas.** Nunca se reescribe algo que funciona "ya que estamos". Toda reescritura requiere justificación documentada en `DECISIONES.md` y aprobación explícita del usuario.
2. **Modelo ≠ Vista.** Ningún cálculo de negocio (ocupación, %, estados, capacidades, distancias) vive en un componente de UI. Si una vista necesita calcular algo que no sea puramente de presentación, esa lógica va al modelo — con test.
3. **Derivados nunca persistidos.** `estaOcupada()`, `ocupacionPorcentaje()`, etc. se calculan desde las relaciones del grafo. Jamás flags redundantes en la base.
4. **Un solo suscriptor de Realtime: el modelo.** Las vistas se suscriben al modelo. Un evento = un recálculo = N vistas notificadas.
5. **El modelo es proyección reconstruible.** Postgres sigue siendo la fuente de verdad persistente. Ante desincronización, la recuperación es reconstruir desde Supabase, nunca "reparar" estado en memoria.
6. **RLS y schema intocables** salvo aprobación explícita del usuario por escrito, fase por fase. La autorización vive en RLS y solo en RLS.
7. **Motores puros.** Simulación y optimización son funciones puras: sin React, sin DOM, sin Three.js. Entra snapshot + parámetros, sale objeto de datos plano serializable. Movibles a Web Worker/Edge Function sin reescritura.
8. **Restricciones como datos, no como código.** El motor de optimización nunca tiene `if (articulo.fragil)` hardcodeado; recibe reglas evaluables configurables.
9. **La IA nunca decide ni escribe.** Solo lee snapshots/resultados y explica, resume o alerta. Toda propuesta de cambio al almacén pasa por algoritmo determinístico + aprobación humana. Regla de code review, no solo de diseño.
10. **Las animaciones son consecuencia del modelo.** Nunca fuente de estado, nunca disparan lógica de negocio, nunca en loop permanente fuera de la vista 3D activa.

## 4. Protocolo de trabajo

### 4.1 Archivos de gobierno

- `PROGRESO.md` — estado vivo: fase actual, checklist con ✅/⬜, bloqueos, próximo paso concreto. Se actualiza al final de cada sesión, sin excepción.
- `DECISIONES.md` — registro de decisiones (ADR corto: contexto → decisión → consecuencias). Toda desviación de este documento se registra ahí ANTES de implementarse.
- `DOMAIN.md` — documentación viva de la capa de dominio: qué expone, contrato del snapshot y su versión.
- `BACKLOG-MIGRACION.md` — lista de queries directas/lógica duplicada que aún vive fuera del dominio (archivo y línea). Medidor honesto del avance del Strangler Fig.
- `PROTOCOLO-MAPA.md` — contrato postMessage actual del mapa legacy (mensajes, payloads, dirección) — entregable de G0, referencia obligatoria para la Fase 2 (bridge).
- `MASTER-PROMPT.md` — este archivo. Fuente de verdad del mandato; cualquier cambio de alcance se refleja acá y se registra en `DECISIONES.md`.

### 4.2 Ciclo de cada sesión

1. Leer `PROGRESO.md` → confirmar fase y estado.
2. Proponer el siguiente paso en 5-10 líneas y ESPERAR confirmación antes de escribir código (excepto fixes triviales de la misma fase).
3. Explorar antes de asumir: leer el schema real de Supabase, el código real de la feature a tocar. Nunca asumir nombres de tablas, columnas o componentes.
4. Implementar con tests primero para toda lógica de dominio.
5. Verificar los criterios de aceptación de la fase.
6. Cerrar: actualizar `PROGRESO.md`, listar qué quedó pendiente, avisar explícitamente si algo requiere validación manual (visual, de datos, de UX).

### 4.3 Compuertas de aprobación (STOP obligatorio)

- **G0 → G1**: informe de exploración aprobado.
- **G1 → G2**: Dashboard migrado y validado con datos reales idénticos antes/después.
- **G2 → G3**: mapa legacy funcionando 100% desde snapshot, con plan de rollback probado.
- **G3 → G4**: simulación validada contra al menos un recorrido medido/estimado real.
- **G4 → G5**: vista 3D sin fugas de memoria GPU tras 10 ciclos abrir/cerrar (verificado con DevTools).
- **G5 → G6**: primera propuesta de optimización revisada por humano y explicable número por número.

### 4.4 Reglas anti-olvido

- Lógica de negocio detectada en una vista durante cualquier fase: NO migrar en silencio; anotar en `BACKLOG-MIGRACION.md` y avisar.
- Cambio que toca más de una feature: parar y avisar antes.
- Conflicto entre este documento y la realidad del código: la realidad gana, pero se documenta en `DECISIONES.md` y se informa.
- Cada dependencia nueva se justifica en una línea (qué aporta, cuánto pesa, en qué chunk cae).

## 5. Fases

### FASE 0 — Exploración y línea base (sin escribir features) — ✅ completada, gate G0→G1 aprobado

- Mapear el schema real de Supabase (tablas, relaciones, políticas RLS relevantes solo como lectura).
- Inventariar TODAS las queries directas y suscripciones Realtime por feature → primer `BACKLOG-MIGRACION.md`.
- Documentar el protocolo postMessage actual del mapa legacy → `PROTOCOLO-MAPA.md`.
- Medir línea base: tamaño de bundles, tiempos de carga del dashboard, cantidad de suscripciones Realtime activas con la app abierta.
- Crear los archivos de gobierno.
- **Entregable:** informe de exploración + `PROGRESO.md` inicializado. → Compuerta G0.

### FASE 1 — Capa de dominio + Dashboard + sistema de animaciones — 🔶 EN CURSO, subdividida en 5 sub-etapas con mini-compuertas (ver ADR-002)

La evidencia de G0 (lógica duplicada real entre el mapa legacy y `reporteService`, más una pregunta sin resolver sobre la fuente de verdad de la geometría base) hizo evidente que construir `WarehouseModel` de una sola vez, sin resolver esas dos cosas primero, sería diseñar sobre un supuesto no verificado. Por eso la Fase 1 se ejecuta en 5 sub-etapas secuenciales, cada una con su propio criterio de salida:

- **G1a** — Resolver ADR-002/003: ¿`CUERPOS` (literal estático, `01-datos.js`) y `inventario_slotting` (tabla) siguen sincronizados, o ya divergieron? De ahí sale cuál es la fuente autoritativa de la geometría base sobre la que se construye todo lo demás.
- **G1b** — Extraer `resolverPosicionesActuales()` como función pura de dominio (resuelve el hallazgo de ADR-001: el merge base+overrides duplicado) + migrar `reporteService.obtener()` para consumirla, sin tocar el mapa legacy.
- **G1c** — Inventario completo de lógica de negocio que vive dentro del mapa legacy (más allá del merge ya encontrado) — insumo necesario antes de diseñar `WarehouseModel` completo, para no dejar afuera algo que el mapa calcula hoy y que un consumidor futuro (3D, simulación) también va a necesitar.
- **G1d** — `WarehouseModel` completo + contrato `WarehouseSnapshot v1`, validado con Zod, documentado en `DOMAIN.md`. Suscripción única a Realtime dentro del modelo. Tests (Vitest) antes de migrar: construcción desde fixtures, derivados, reacción a eventos Realtime simulados, reconstrucción total. `src/domain/` sin imports de React/DOM (verificado).
- **G1e** — Migrar Dashboard (Productividad): cero queries propias, cero fórmulas propias, todo del modelo. Sistema de animaciones `src/ui/motion/` (Framer Motion): tokens centralizados (150ms micro / 300ms estado / 500ms navegación; easeOut entradas, easeInOut cambios); KPIs con count-up ~600ms; cambios Realtime con transición de color 300-400ms + pulso único de escala 1→1.03→1; FLIP en cards; skeletons con shimmer y entrada fade + slide-up 8px con stagger ~40ms; `prefers-reduced-motion` global; solo `transform`/`opacity`.

Criterios de aceptación de la Fase 1 completa: sección 6.1 (se verifican al cierre de G1e, no antes). → Compuerta G1.

### FASE 2 — Mapa legacy, Strangler Fig (sin tocar su renderizado)

- El mapa deja de pedir datos: recibe `WarehouseSnapshot` vía postMessage y solo pinta.
- Toda acción del usuario en el mapa sale como intención (`{tipo: "mover_articulo", articuloId, destinoId}`); el modelo valida y escribe a Supabase; el mapa recibe el snapshot actualizado como confirmación.
- Adaptador `src/features/mapa/bridge/`: única pieza que conoce el protocolo del iframe; traduce snapshot ↔ formato que el mapa ya entiende (cambios mínimos en el JS legacy: solo el punto de entrada de datos).
- Rollback probado: feature flag para volver al modo anterior en un deploy.
- Feedback animado del lado React: toast/indicador con transición al confirmarse una intención; estado "pendiente" sutil (opacidad 0.7) mientras el modelo valida.
- Criterios: sección 6.2. → Compuerta G2.

### FASE 3 — Motor de Simulación v1

- `src/engines/simulation/`: función pura. Entrada: snapshot + parámetros (picks, velocidad, punto de partida). Salida: `SimulationResult` plano (secuencia de paradas, ruta como lista de puntos, distancia total, tiempo estimado, ocupación resultante).
- Recorrido con heurísticas (nearest-neighbor + mejora 2-opt), nunca TSP exacto.
- Web Worker desde el día 1 (el motor ya es puro; el costo es mínimo y evita congelar la UI).
- Visualización 2D del resultado: capa React superpuesta al iframe (SVG/Canvas overlay) — NO tocar el render interno del mapa. Ruta con trazo progresivo `stroke-dashoffset` (~1.5s, easeInOut), paradas numeradas apareciendo con stagger, panel de métricas con count-up.
- Tests del motor con layouts sintéticos de resultado conocido.
- Criterios: sección 6.3. → Compuerta G3.

### FASE 4 — Vista 3D opcional

- `src/features/vista3d/` con `React.lazy()` + `import()` dinámico; Three.js/react-three-fiber/drei en chunk separado, jamás importados desde el entry point.
- Consume el MISMO `WarehouseModel` en memoria; su única lógica propia es proyección a geometría.
- `InstancedMesh` para ubicaciones; nivel de detalle: agrupado por rack, "explota" al hacer zoom con stagger ~30ms.
- Higiene GPU: `dispose()` explícito de geometrías/materiales/texturas en cleanup; un solo `WebGLRenderer` reusado entre montajes.
- Degradación con gracia: detección de WebGL2 y umbral de objetos → mensaje amable, nunca crash.
- Animaciones: cámara con tweening (CameraControls, 800ms) al enfocar; lerp de color en instancias ante cambios Realtime; recorridos de simulación como marcador siguiendo la ruta (GSAP timeline), cámara-follow opcional.
- Criterios: sección 6.4. → Compuerta G4.

### FASE 5 — Motor de Optimización v1

- `src/engines/optimization/`: puro, en Web Worker. Genera candidatos de layout respetando restricciones, evalúa cada uno CON el motor de simulación (Fase 3), rankea con función de costo de pesos configurables (`w1·distancia − w2·utilización + w3·violaciones − w4·afinidad`).
- Restricciones como datos: tabla/config de reglas evaluables ("frágil no arriba", "clase A cerca de salida", "peso máximo por nivel"); el motor las recibe, no las conoce.
- Usa el histórico de Movimientos para rotación REAL, no supuesta.
- Salida = PROPUESTA con diff visual (qué se movería, de dónde a dónde, ganancia estimada por movimiento). Nunca se aplica automáticamente. Al aprobar: escritura a Supabase + registro de Auditoría.
- Animación del diff: pares origen→destino resaltados por hover, flechas con trazo progresivo, métricas antes/después con count-up.
- Documentar la ruta de escalado a Edge Function en `DECISIONES.md` (no implementarla aún).
- Criterios: sección 6.5. → Compuerta G5.

### FASE 6 — IA asistente v1 (solo lectura)

- Corre en Edge Function de Supabase, jamás en el bundle del cliente. Invocación siempre explícita por el usuario (botón), nunca en background.
- Casos v1: (a) explicar una propuesta de optimización en lenguaje natural a partir del `SimulationResult`/diff, (b) resumir N eventos de auditoría en un párrafo, (c) responder preguntas del estado vía tool use contra métodos del modelo — la IA nunca "sabe" el dato, siempre lo consulta.
- Guardarraíl duro verificable en code review: ningún camino de código permite que la respuesta de la IA escriba al modelo o a Supabase.
- UX: respuesta con streaming (aparición progresiva del texto), indicador de "pensando" discreto, y siempre la fuente de datos citada.
- Criterios: sección 6.6.

## 6. Criterios de aceptación por fase

**6.1 Fase 1**
- Dashboard sin `select` ni suscripciones directas a Supabase.
- `src/domain/` sin imports de React/DOM/UI.
- Todo derivado con test unitario; suite en verde.
- Valores del Dashboard idénticos a los previos con los mismos datos (comparación documentada).
- Con 2 vistas abiertas, 1 evento Realtime = 1 recálculo en el modelo (verificado con log/contador).
- `prefers-reduced-motion` respetado; bundle principal sin Three.js y sin aumento significativo.
- `WarehouseSnapshot v1` documentado en `DOMAIN.md`.

**6.2 Fase 2**
- El mapa no ejecuta ninguna query; solo recibe snapshots y emite intenciones.
- Toda escritura originada en el mapa pasa por validación del modelo y genera auditoría.
- Feature flag de rollback probado (ida y vuelta) en staging.
- Cero regresiones visuales en el mapa (comparación con capturas de la línea base).
- Renderizado interno del mapa sin cambios más allá del punto de entrada de datos.

**6.3 Fase 3**
- Motor sin dependencias de DOM/React/Three; corre en Web Worker; UI nunca se congela.
- `SimulationResult` es serializable y no sabe dibujarse.
- Resultados validados contra layouts sintéticos conocidos + al menos un recorrido real.
- La misma estructura de resultado alimenta el overlay 2D sin adaptación ad-hoc.

**6.4 Fase 4**
- Bundle principal: 0 bytes de Three.js (verificado en build).
- Sin vista 3D montada: cero render loop, cero costo de CPU/GPU (verificado con Performance tab).
- 10 ciclos abrir/cerrar sin crecimiento de memoria GPU (verificado con DevTools).
- Sin lógica de negocio en la vista 3D: solo proyección y presentación.
- Degradación probada en dispositivo/simulación sin WebGL2.

**6.5 Fase 5**
- Cero reglas de negocio hardcodeadas en el motor (revisión de código explícita).
- Ninguna propuesta se aplica sin aprobación humana; aplicar genera auditoría.
- Cada propuesta es explicable: qué regla y qué números la justifican.
- Pesos de la función de costo configurables sin tocar el motor.

**6.6 Fase 6**
- La IA no tiene ningún camino de escritura (verificado en code review, documentado).
- Cero impacto en bundle del cliente más allá del código de la llamada.
- Toda respuesta de IA cita los datos estructurados que usó.
- Invocación solo explícita por el usuario.

## 7. Estándar de animaciones (transversal a todas las fases)

- Todo desde `src/ui/motion/` (tokens + variantes); prohibidas las duraciones/easings mágicos inline.
- Duraciones: 150ms micro-interacciones · 300ms cambios de estado · 500ms navegación · 600ms count-ups · 800ms cámara 3D · ~1.5s trazado de rutas.
- Solo propiedades de compositor (`transform`, `opacity`); jamás animar layout (`width`/`height`/`top`/`left`).
- Toda animación se dispara por cambio del modelo; ninguna genera estado.
- `prefers-reduced-motion`: fades instantáneos o desactivación, global.
- Cero loops permanentes fuera de la vista 3D activa (uso normal = 0 costo de animación).
- Propósito antes que espectáculo: cada animación dirige la atención (qué cambió), comunica causalidad (intención → confirmación) o da continuidad espacial (2D↔3D). Si no hace ninguna de las tres, no va.
