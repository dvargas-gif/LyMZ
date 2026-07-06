# INVENTARIO-LOGICA-MAPA.md — G1c: lógica de negocio dentro del mapa legacy

> Entregable de G1c (`MASTER-PROMPT.md` sección 5, Fase 1). Complementa a `PROTOCOLO-MAPA.md` (que documenta el CONTRATO postMessage) con lo que pasa DENTRO del mapa — cálculos, reglas de movimiento, umbrales — que un futuro `WarehouseModel` (G1d) necesita conocer para no dejar afuera algo que hoy solo existe en este HTML. Se leyeron los 9 archivos JS del mapa completos (907 líneas): `01-datos.js` (solo el literal `CUERPOS`, ya cubierto en ADR-003), `02-estado.js`, `03-configuracion.js`, `04-sesion.js`, `05-ayudantes.js`, `07-render.js`, `08-interacciones.js`, `09-arrastre.js`, `10-servicios.js` (ya cubierto en ADR-001/PROTOCOLO-MAPA.md), `11-buscar-exportar.js`, `12-arranque.js` (ya cubierto en PROTOCOLO-MAPA.md). Solo lectura — nada de esto se tocó.

## 1. Cálculos de ocupación/capacidad (`05-ayudantes.js`) — los candidatos más directos para `WarehouseModel` (G1d)

Son funciones puras (reciben `cu`, el objeto de un rack en `CUERPOS`, sin tocar DOM) — la forma más parecida a "métodos de dominio" que ya existe en este proyecto, solo que viven en el lugar equivocado (el mapa, no un modelo compartido):

| Función | Archivo:línea | Qué calcula | Nota |
|---|---|---|---|
| `nArts(cu)` | `05-ayudantes.js:8` | Cantidad total de artículos en un rack (todos los niveles) | Es, literalmente, `estaOcupada()`/`cantidadOcupantes()` del contrato que `DOMAIN.md` ya anticipaba. |
| `nivelesArmar(cu)` | `05-ayudantes.js:9-12` | Niveles con ≥1 artículo (o 1 si es tipo CUERPO) | **Mismo nombre/concepto que la columna `niveles_a_armar` de `inventario_slotting`** — pero acá se RECALCULA en vivo desde `CUERPOS`, mientras que la columna de la tabla es un valor congelado de la foto de fábrica. Puede divergir del real si un artículo se movió — no es necesariamente un bug (la tabla documenta el plan original, el mapa muestra la realidad actual), pero el futuro `WarehouseModel` tiene que decidir CUÁL de los dos expone como `nivelesAArmar()`, y no asumir que son intercambiables. |
| `consumoTotal(cu)` | `05-ayudantes.js:13` | Suma del campo `consumo` de todos los artículos de un rack | Insumo directo de `llenura()`. |
| `llenura(cu)` | `05-ayudantes.js:14-17` | `consumoTotal(cu) / 4.5`, capado en 1.2 | **La fórmula de ocupación % de un rack.** Constante de negocio hardcodeada: *"capacidad útil = 5 niveles × 0.90 = 4.5"* (comentario textual del propio archivo). Esto es exactamente `Rack.ocupacionPorcentaje()` del contrato de `DOMAIN.md` — hoy vive acá, con la constante `4.5` escrita a mano, sin ningún lugar donde configurarla. |
| `colorLlenura(p)` | `05-ayudantes.js:18-20` | Umbrales de color: `>1.0` rojo (sobrecargado), `>0.85` ámbar, `>0.4` teal, resto verde | Presentación, pero los CORTES (1.0/0.85/0.4) son una decisión de negocio ("qué se considera lleno"), no solo estética. |
| `intensidad(cl,arts)` | `05-ayudantes.js:5-7` | Color de fondo de una celda según clase + cantidad de artículos (interpolación hacia el color de la clase, tope en 20 artículos) | Presentación pura — el "20" como techo de saturación visual no es una regla de negocio real, es un límite de contraste. |

**Umbrales adicionales, NO centralizados con los de arriba (encontrados en `07-render.js`, dentro de `abrir()` y `render()`):**

- **Por NIVEL** (`07-render.js:195-197`): `consumo del nivel > 0.90` → "⚠ excede 0.90" (mismo `0.90` que la constante de capacidad de rack, pero aplicado a UN nivel, no al rack completo).
- **Por ARTÍCULO** (`07-render.js:202`): `consumo del artículo > 0.90` rojo, `> 0.60` ámbar, resto normal — una TERCERA escala, con sus propios cortes (0.90/0.60), distinta de la de rack (1.0/0.85/0.4) y la de nivel (solo 0.90).

**Conclusión de esta sección:** hay TRES escalas de "cuánto es demasiado" coexistiendo (rack/nivel/artículo), cada una con sus propios cortes, ninguna centralizada ni configurable hoy. Es exactamente el tipo de cosa que la Ley 8 (`MASTER-PROMPT.md`) pide modelar como "restricciones/reglas como datos" cuando llegue el motor de optimización (Fase 5) — pero aplica también antes de eso, para `WarehouseModel` (G1d): si el modelo va a exponer `ocupacionPorcentaje()`/`estaSobrecargado()`, tiene que decidir con qué escala, no inventar una cuarta.

## 2. Reglas de movimiento (`08-interacciones.js`)

| Función | Archivo:línea | Regla |
|---|---|---|
| `confirmar(destKey, niv)` | `08-interacciones.js:126-149` | Mueve UN artículo. Si el rack destino no existe, lo crea con `clase:"-", grupo:"-", tipo:"NORMAL"` — **el rack destino NO hereda la clase del artículo que llega**, queda "sin clasificar" hasta que alguien la edite. |
| `soltarCuerpoEn(destKey)` | `08-interacciones.js:187-224` | Mueve un rack COMPLETO (todos sus niveles). Regla explícita: **solo puede soltarse sobre un rack VACÍO** (`nArts(destino)===0`, línea 197) — si no, rechaza con un mensaje y no aplica el cambio. Sí preserva `clase/grupo/tipo` del origen (los pasa a `notificarPosicion`). |
| `deshacer()` | `08-interacciones.js:150-175` | Deshace el ÚLTIMO cambio de la pila `cambios` (en memoria, se pierde al recargar la página) — no es un historial navegable, es un `pop()` de una sola operación. Reconstruye el rack de origen si había sido borrado (caso "mover cuerpo completo" que vació el origen). |
| `limpiarSlot(key)` / `limpiarAreaSeleccionada()` | `08-interacciones.js:90-100`, `45-62` | Solo dentro de una sala: vacían por completo uno o varios racks (`delete CUERPOS[key]`) y notifican eliminación por artículo. No existen en el mapa real (ni el botón que las dispara se muestra). |
| `toggleBloqueo(key)` | `08-interacciones.js:17-22` | On/off simple sobre un `Set` en memoria. Una celda bloqueada no se abre ni recibe movimientos — chequeo hecho en el `onclick` de cada celda (`07-render.js:110,117`). |

### Hallazgo importante: `confirmar()` NO envía `clase/grupo/tipo` al notificar la posición

`confirmar()` llama `notificarPosicion(art, cuD.pas, cuD.col, niv)` — **con 4 argumentos**, no 7 (`08-interacciones.js:144`). La firma real de `notificarPosicion` es `(art,pas,col,niv,clase,grupo,tipo)` (`10-servicios.js:9`) — así que `clase`, `grupo` y `tipo` llegan como `undefined`.

En cambio `soltarCuerpoEn()` (mover un rack completo) SÍ los pasa: `notificarPosicion(a.art, dpas, dcol, niv, cuO.clase, cuO.grupo, cuO.tipo)` (`08-interacciones.js:217`).

Efecto (razonablemente seguro por cómo funciona `JSON.stringify`+upsert de Postgres, **no verificado end-to-end contra datos reales** — mismo bloqueo de RLS que ADR-003/G1a): al mover UN artículo por click+modal, la fila que queda en `posiciones_actuales` probablemente pierde `clase`/`tipo` (quedan `null` la primera vez que ese artículo se mueve; en movimientos posteriores del mismo artículo, el upsert de Postgres típicamente conserva el valor viejo en esas columnas porque no vienen en el payload). **Esto es casi seguro la razón real por la que `reporteService.obtener()` (y ahora `resolverPosicionesActuales()`) necesitan el fallback `clase ?? actual.clase`** — no era código defensivo "por si las moscas", el mapa real genera movimientos así de manera rutinaria. Vale la pena confirmarlo con datos reales cuando se resuelva el bloqueo de RLS (mismo pendiente de ADR-003), porque si es cierto, el futuro `WarehouseModel` (G1d) tiene que documentar esto como comportamiento esperado, no como anomalía.

## 3. Geometría / capacidad por pasillo (`03-configuracion.js`)

- `maxColDe(pas)` / `gapsDe(pas)` (`03-configuracion.js:19-20`): MZ01 = 27 columnas por defecto, el resto = 36 — sobreescribible por un Administrador vía `pasillos_config` (ya documentado a nivel de mensaje en `PROTOCOLO-MAPA.md`; esto es el detalle de la regla en sí, que vive acá).
- `GRUPO_GAP_DESPUES = ["MZ01","MZ03","MZ05","MZ07"]` (`03-configuracion.js:63`): agrupa los pasillos en pares para el corredor visual (MZ01 solo / MZ02-03 / MZ04-05 / MZ06-07 / MZ08 solo). **Esto es un hecho estructural real del almacén** (qué pasillos son físicamente adyacentes), no solo una decisión estética — si algún día `WarehouseModel`/simulación necesita saber "pasillos vecinos" para calcular recorridos, esta es la fuente hoy, y no existe en ninguna tabla de Supabase.
- `NIVORDER = ["N05","N04","N03","N02","N01","CUERPO"]` (`03-configuracion.js:62`): orden de apilado de niveles de arriba hacia abajo — otro hecho geométrico real, hoy solo en el mapa.
- `PALETAS`/`ZCOL` (temas claro/oscuro/alto_contraste): presentación pura, **ya documentado como duplicación intencional** con `src/shared/constants/coloresArticulo.js` (comentario en el propio archivo lo explica: el mapa no puede importar JS de React). Solo cubre el tema "claro" — los temas oscuro/alto_contraste no tienen equivalente en React porque React nunca necesita pintar el mapa con esos temas (los pinta el propio iframe). No requiere acción.

## 4. Exportación (`11-buscar-exportar.js`) — una TERCERA implementación del mismo problema que ADR-001

`exportar()` (`11-buscar-exportar.js:15-33`) aplana `CUERPOS` (ya mergeado con overrides) a un Excel con columnas propias — es la MISMA operación conceptual que `reporteService.obtener()` (React) y que el propio `render()`/`abrir()` del mapa (mostrar el estado actual), implementada una tercera vez, de forma independiente:

- Reconstruye un string de ubicación propio (`MZ01-C016-N02-1` o `...-CUERPO ENTERO (N01-N05)`) que no coincide con ningún otro formato ya visto — ni con `rack_actual` (formato `RCLxxx-Cxxx-Nxx-x`, ver ADR-003), ni con ninguna columna real de Supabase.
- La hoja "Cambios" del Excel sale de `cambios` (la pila en memoria de esta sesión, se pierde al recargar) — **NO es lo mismo que la auditoría real persistida** (`auditoria` table, alimentada por `slotting:audit`). Un usuario que exporta después de recargar la página vería la hoja de cambios vacía, aunque haya movimientos reales en la auditoría — riesgo de confusión, no un bug técnico, pero vale la pena que quien diseñe reportes en el futuro (Fase 3+) lo sepa.

No se propone ninguna acción sobre esto en G1c (está fuera del alcance: no tocar el mapa legacy) — se registra como antecedente para cuando la Fase 2/3 diseñe cómo unificar reportes/exportación sobre el dominio.

## 5. Resumen para G1d (qué necesita saber el futuro `WarehouseModel`)

1. **Fórmulas de ocupación ya existen y están probadas en producción** (`llenura`, `nArts`, `nivelesArmar`, `consumoTotal`) — G1d no las inventa, las traslada, decidiendo primero cuál escala de umbral usar (sección 1).
2. **`niveles_a_armar` tiene DOS significados posibles** (columna congelada de la tabla vs. cálculo en vivo del mapa) — G1d tiene que elegir uno y documentar la elección, no asumir que son lo mismo.
3. **Los movimientos de UN artículo (no de un rack completo) probablemente llegan sin `clase`/`tipo`** — cualquier lógica de dominio que dependa de esos campos en un movimiento individual necesita el mismo fallback que ya tiene `resolverPosicionesActuales()`, y esto habría que confirmarlo con datos reales apenas se resuelva el bloqueo de RLS.
4. **La agrupación de pasillos en pares (`GRUPO_GAP_DESPUES`) y el orden de niveles (`NIVORDER`) son hechos geométricos reales**, hoy solo en el mapa — si simulación (Fase 3) necesita adyacencia de pasillos, la fuente hoy es esta constante, no una tabla.
5. **Existe una tercera implementación de "aplanar el estado a filas"** (`exportar()`) — no se toca en esta fase, pero cuando se diseñe cómo unificar reportes/exportación (post Fase 2), hay que contar con ella, no solo con `reporteService`.
