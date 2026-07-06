# DOMAIN.md — La capa de dominio (`WarehouseModel`)

> Documentación viva. **Actualizado al cierre de G1d** (`MASTER-PROMPT.md` sección 5) — `WarehouseModel` ya existe como código en `src/domain/`. Las secciones "Estado real encontrado en G0" quedan como registro histórico (para entender el punto de partida); el contrato real, implementado y testeado, está en la sección "Contrato del modelo (implementado, G1d)".

## Regla operativa (Ley 2)

Si una vista necesita calcular algo sobre el almacén que no sea puramente de presentación (posición en pantalla, color, animación), esa lógica no va en la vista — va acá, con test. Esto aplica también a servicios: un `*.service.js` puede hacer acceso a datos (leer/escribir Supabase), pero el cálculo de negocio sobre esos datos (merge, ocupación, validación de conflictos) es del dominio.

## Estado real encontrado en G0 (antes de escribir nada nuevo)

### Qué SÍ existe hoy como lógica de dominio (aunque no esté centralizada)

| Lógica | Dónde vive hoy | Pura / testeada | Nota |
|---|---|---|---|
| Merge base + overrides ("¿dónde está el artículo X?") | `reporte.service.js` (React) **y**, por separado, `10-servicios.js` (legacy) | No — ninguna de las dos tiene test propio | Duplicada, ver DECISIONES.md ADR-001 |
| Validación de carga masiva (conflictos, duplicados, destino ocupado) | `cargaMasiva.service.js` | **Sí** — `cargaMasiva.service.test.js` | Buen precedente a seguir: función pura, con test, sin Supabase ni DOM |
| Análisis de rotación ABC/Pareto + recomendación | `analisisPicks.js` | **Sí** — `analisisPicks.test.js` | Es, en la práctica, un embrión del "motor de optimización" (Sección 7 del doc de arquitectura) — ya sigue la Ley 7 (motor puro) sin que se lo hayamos pedido explícitamente |
| ~~Métricas de productividad por usuario/día/hora~~ | ~~`Productividad.jsx`~~ | ~~No~~ | 🟢 **Resuelto en G1e** — ver `src/domain/metricasProductividad.js` más abajo. |

### Qué faltaba en G0 (histórico) y cómo quedó resuelto en G1b-d

- ~~No hay entidad `Ubicación` en Postgres~~ → sigue sin haberla como tabla (no se cambia el schema, Ley 6). El dominio la modela como el par `(pasillo, columna, nivel)` embebido en cada posición resuelta — nunca como una entidad con id propio, porque el dato real no la sostiene (ver ADR de la sesión G1d: no se modela una jerarquía física de Salas que el schema no tiene).
- ~~No hay clase `Rack`/`Nivel`/`Sala` con comportamiento~~ → `WarehouseModel.rack(pasillo,columna)` + `ocupacionDeRack(rack)` (`src/domain/formulasOcupacion.js`, `agruparPorRack.js`). "Sala" = una instancia alternativa completa del modelo (`escenarioId`), nunca un hijo anidado — así ya funciona todo el código existente (`reporteService`, `mensajesMapa.js`), el dominio no inventa una jerarquía distinta.
- ~~No hay un objeto `WarehouseModel`~~ → `src/domain/crearWarehouseModel.js`, ver contrato completo abajo.
- **`CUERPOS` vs `inventario_slotting`**: sigue sin el conteo real confirmado (ADR-003, bloqueado por RLS) — el dominio usa `inventario_slotting` como fuente de `posicionBase` por decisión explícita del usuario, riesgo asumido y documentado.

## Contrato del modelo (implementado, G1d)

`WarehouseModel` es una **fábrica de funciones** (`crearWarehouseModel({escenarioId, servicios, configuracionOcupacion})`), no una clase — consistente con el resto del código (`reporteService`, `cargaMasiva.service.js`, etc. son objetos con métodos, no hay una sola clase ES6 en todo `src/`). Representa indistintamente el mapa real (`escenarioId=null`) o una sala de simulación — la misma forma, nunca un padre con hijos.

```
crearWarehouseModel({ escenarioId, servicios?, configuracionOcupacion? }) → WarehouseModel

WarehouseModel
  .cargar()                        → Promise<this>   -- carga inicial + arranca Realtime (una sola vez)
  .recargarTodo()                  → Promise<this>   -- reconstrucción total desde cero, sin asumir estado anterior
  .asegurarSuscripcion()           → void             -- garantiza el canal Realtime sin forzar recarga de datos

  .posiciones()                    → ArticuloResuelto[]   -- salida de resolverPosicionesActuales(), ver abajo
  .bloqueos()                      → string[]              -- claves "pasillo|columna"
  .estaBloqueado(rackKey)          → boolean
  .descripcion(articulo)           → string                -- con fallback 'Sin descripción disponible'
  .movimientos()                   → Movimiento[]           -- auditoría real (auditService); [] dentro de una sala

  .racks()                         → Map<"pasillo|columna", Rack>   -- derivado, nunca persistido (Ley 3)
  .rack(pasillo, columna)          → Rack | undefined
  .ocupacionDeRack(rack)           → {nArts, nivelesOcupados, consumoTotal, llenura, colorLlenura}

  .snapshot()                      → Promise<WarehouseSnapshot>  -- async: Zod se importa on-demand (ver ADR-008)
  .suscribir(callback)             → unsuscribirFn     -- Ley 4: un evento Realtime = un recálculo = N vistas notificadas
  .destruir()                      → void              -- cierra el canal Realtime, limpia listeners

Rack (derivado, agruparPorRack.js)
  { pasillo, columna, niveles: { [nivel]: Array<{articulo, consumo, picks, rackActual, clase, tipo}> } }

ArticuloResuelto (resolverPosicionesActuales.js, sin cambios desde G1b)
  { articulo, posicionBase: object|null, posicionActual: {pasillo,columna,nivel,clase,tipo}|null, movido: boolean, sinBase: boolean }
```

**Instancia compartida (Ley 4):** `obtenerWarehouseModel(escenarioId)` devuelve siempre la MISMA instancia para el mismo `escenarioId` (memoizada en `crearWarehouseModel.js`) — así ningún consumidor nuevo (Dashboard en G1e, el bridge del mapa en Fase 2) abre un segundo canal Realtime por accidente. `reporte.service.js.suscribirCambios()` ya delega ahí (ver ADR-008).

**Inyección de servicios (testabilidad):** `servicios` es opcional — si no se pasa, se usa `crearServiciosReales(escenarioId)` (envuelve los `*.service.js` existentes, nunca reimplementa acceso a Supabase). Los tests pasan fixtures/fakes, sin tocar red — ver `crearWarehouseModel.test.js`.

## Fórmulas de ocupación (portadas del mapa legacy, ver ADR-004/005 e INVENTARIO-LOGICA-MAPA.md)

`src/domain/formulasOcupacion.js` — mismos resultados que `public/legacy/js/05-ayudantes.js`, con tests que fijan el comportamiento actual (`formulasOcupacion.test.js`):

- `nArts(rack)`, `nivelesOcupados(rack)` (ver ADR-006 — NO se llama `nivelesArmar` a propósito), `consumoTotal(rack)`, `llenura(rack, config)`, `colorLlenura(proporcion, config)`.
- La configuración (`src/domain/configuracionOcupacion.js`) reemplaza las constantes hardcodeadas del mapa (capacidad de rack, las 3 escalas de umbral rack/nivel/artículo) — mismos valores por defecto, ahora explícitos y en un solo lugar.

## WarehouseSnapshot v1

**Versión actual: 1** (`SNAPSHOT_VERSION` en `src/domain/WarehouseSnapshot.js`). Plano, JSON-safe, validado con Zod (`WarehouseSnapshotSchema.parse()` — tira si no matchea, a propósito: mejor fallar ruidoso en el origen que mandar algo corrupto a un consumidor lejano como postMessage o un Web Worker).

```
WarehouseSnapshot v1 = {
  version: 1,
  escenarioId: number | null,
  generadoEn: string,              // ISO 8601
  posiciones: ArticuloResuelto[],  // ver arriba -- el estado CRUDO resuelto
  bloqueos: string[],              // claves "pasillo|columna"
  descripciones: Record<string,string>,
  configuracionOcupacion: {...},  // para que quien consuma el snapshot no reimplemente los umbrales
}
```

**Decisión de diseño:** el snapshot NO incluye `racks()` ni `ocupacionDeRack()` (los derivados) — eso se recalcula siempre desde `posiciones`, nunca se congela en el snapshot (Ley 3 aplicada también al contrato de serialización, no solo al modelo en memoria).

**Historial de versiones:**
- **v1** (G1d, 2026-07-06) — primera versión. Consumidores previstos: el bridge del mapa (Fase 2, vía postMessage) y motores de simulación/optimización (Fase 3/5, vía Web Worker) — ninguno implementado todavía, así que el contrato puede seguir ajustándose hasta que el primero lo use de verdad.

## Métricas de productividad (G1e)

`src/domain/metricasProductividad.js` — `calcularMetricasPorUsuario(movimientos)`, `agruparPor(movimientos, claveFn)`. Portadas tal cual desde `Productividad.jsx` (ya eran puras, solo faltaba la ubicación y el test — ver `BACKLOG-MIGRACION.md` #2). Operan sobre `Movimiento[]` (la salida de `WarehouseModel.movimientos()`/`cargarMovimientos()`), no sobre el snapshot completo — son un cálculo de solo lectura sobre el histórico, no sobre la geometría del almacén.

## Nota de cierre de Fase 1 — jerarquía Warehouse→Sala (ver ADR-009)

El contrato de arriba refleja la decisión de ADR-009: no existe (ni se modela) una jerarquía `Warehouse` con `Sala[]` anidadas. Cada instancia de `WarehouseModel` — real o de una sala — es autocontenida. Cualquier trabajo futuro que necesite razonar sobre MÁS DE UNA sala a la vez (comparar propuestas de simulación en Fase 3, o mostrarlas lado a lado en 3D en Fase 4) tiene que orquestar eso por fuera del dominio, consumiendo N instancias/snapshots — el dominio no ofrece (ni debería ofrecer) una función que combine varias salas en un solo resultado. Ver ADR-009 para el razonamiento completo.
