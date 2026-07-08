# PROTOCOLO-MAPA.md — Contrato postMessage actual (mapa legacy ↔ React)

> Inventario completo, verificado por grep sobre `public/legacy/js/*.js` y `src/features/mapa/*.{js,jsx}` — no es una lista de memoria. Este es el contrato que la Fase 2 (bridge) tiene que envolver sin romper. Ningún mensaje nuevo se agrega sin actualizar este archivo primero.

## Mapa → React (el iframe avisa, React decide/persiste)

| Tipo | Emisor (archivo:línea) | Payload | Qué hace React al recibirlo (`mensajesMapa.js`) |
|---|---|---|---|
| `slotting:audit` | `08-interacciones.js:81` | `{articulo, desde, hacia, tipoMovimiento, usuario, fechaHora, escenarioId}` | Si `escenarioId` está presente, se ignora (una sala no genera auditoría real). Si no, `auditService.registrarMovimiento(...)`. |
| `slotting:posicion` | `10-servicios.js:12` | `{articulo, pasillo, columna, nivel, clase, grupo, tipo, escenarioId}` | Con `escenarioId` → `escenarioPosicionesService.guardar()`. Sin él → `posicionesService.guardar()`. Si falla, responde `slotting:errorGuardado`. |
| `slotting:deshecho` | `10-servicios.js:22` | `{articulo, desde, hacia, escenarioId}` | Igual que `audit`: en sala se ignora; si no, `auditService.registrarDeshecho(...)`. |
| `slotting:limpiarArticulo` | `10-servicios.js:68` | `{articulo, escenarioId}` | Solo tiene efecto con `escenarioId` → `escenarioEliminadosService.marcarEliminado(...)`. |
| `slotting:bloqueo` | `10-servicios.js:59` | `{key, pasillo, columna, bloqueada, escenarioId}` | Con `escenarioId` → `escenarioBloqueosService`. Sin él → `bloqueosService`. |
| `slotting:seleccionArea` | `08-interacciones.js:41` | `{cantidad, escenarioId}` | Reenvía a `onSeleccionCambia?.(cantidad)` — solo actualiza un contador en React, no persiste nada. |
| `slotting:solicitarAddRack` | `07-render.js:42` | `{maxColumnas}` | Llama `onSolicitarAddRack?.()` — abre el modal `AddRackModal` en React. El mapa nunca habla con Supabase para esto. |
| `slotting:solicitarEstado` | `12-arranque.js:33` | `{escenarioId}` | React junta 6 fuentes en paralelo (posiciones, bloqueos, eliminados, descripciones, config, maxColumnas por pasillo) y responde con `slotting:estadoInicial`. Cada fuente falla de forma aislada (no tumba las demás). 🔶 **Fase 2 paso 1 (2026-07-06):** el bridge sabe construir la RESPUESTA (ver fila de abajo) a partir de un `WarehouseSnapshot`; la SOLICITUD en sí (el listener real en `mensajesMapa.js`) sigue sin tocar — el bridge todavía no está conectado. |

## React → Mapa (comandos y el snapshot inicial)

| Tipo | Emisor | Payload | Qué hace el mapa al recibirlo |
|---|---|---|---|
| `slotting:estadoInicial` | `mensajesMapa.js:113` (respuesta a `solicitarEstado`) | `{posiciones, bloqueos, descripciones, configuracion, eliminados, maxColumnas}` | `12-arranque.js` aplica cada `posicion` con `aplicarPosicionGuardada()` (muta `CUERPOS`, ver DECISIONES.md ADR-001) y pinta con el resto. 🟢 **Cubierto por el bridge, aislado (Fase 2 paso 1):** `src/features/mapa/bridge/construirEstadoInicial(snapshot)` produce este mismo payload a partir de un `WarehouseSnapshot` — con 2 diferencias conocidas documentadas en `PROGRESO.md` (falta `grupo` en `posiciones`; `bloqueos`/`configuracion` pierden columnas de metadata que el mapa no lee). **NO conectado** al postMessage real — detrás de `BRIDGE_MAPA_HABILITADO=false` en `featureFlag.js`, sin ningún import hacia `SlottingFrame.jsx`/`mensajesMapa.js` todavía. |
| `slotting:errorGuardado` | `mensajesMapa.js:46` (respuesta a un `slotting:posicion` fallido) | `{articulo}` | El mapa ya movió el artículo visualmente (optimista); esto solo avisa que no quedó persistido. No hay rollback visual automático hoy. |
| `slotting:comando` | `SlottingFrame.jsx` (vía `forwardRef`, disparado desde la barra de acciones de una sala en React) | `{accion: 'activarModoBloqueo' \| 'activarModoSeleccion' \| 'limpiarSeleccion'}` | El mapa ejecuta la función correspondiente que ya tenía (no se le agregó lógica nueva, solo el listener). |

## Estado de cobertura del bridge (actualizado en cada paso de la Fase 2)

- 🟢 **Cubierto (paso 1):** `slotting:estadoInicial` — solo la construcción del payload de RESPUESTA, aislada, sin conectar.
- ⬜ **Sin tocar todavía:** `slotting:solicitarEstado` (el listener real que dispara la respuesta), y las 9 rutas de ESCRITURA/intención: `slotting:posicion`, `slotting:bloqueo`, `slotting:deshecho`, `slotting:audit`, `slotting:limpiarArticulo`, `slotting:seleccionArea`, `slotting:solicitarAddRack`, `slotting:comando`, `slotting:errorGuardado`. Estas son las que MASTER-PROMPT.md (Fase 2) describe como "toda acción del usuario sale como intención; el modelo valida y escribe" — pasos futuros, no de este.

## Notas para la Fase 2 (bridge, sin tocar el render interno)

- **Todos los mensajes ya pasan por un único punto de entrada/salida**: `SlottingFrame.jsx` (`onMessage`) y `mensajesMapa.js` (dispatch por tipo) del lado React; `window.parent.postMessage` disperso en 4 archivos del lado legacy. El bridge de la Fase 2 puede envolver el lado React sin tocarlo casi nada (ya está aislado) — el trabajo real es traducir `slotting:estadoInicial` a la forma de un `WarehouseSnapshot`, y las intenciones del usuario (`slotting:posicion`, `slotting:bloqueo`, etc.) a la validación del modelo antes de persistir.
- **`escenarioId` viaja en casi todos los payloads** como el mecanismo que distingue "mapa real" de "sala de simulación" — el bridge tiene que preservar esto, no es opcional.
- **El mapa nunca llama a Supabase directamente** (confirmado, ver `BACKLOG-MIGRACION.md` sección 4) — todo pasa por este protocolo. Esto es una ventaja real para la Fase 2: no hay que "sacarle" a la fuerza el acceso a datos, ya no lo tiene.
- **Punto de entrada de datos a cambiar en Fase 2** (único cambio propuesto al JS legacy, según el mandato): el listener de `slotting:estadoInicial` en `12-arranque.js:18-21` — hoy aplica posiciones una por una con `aplicarPosicionGuardada()` sobre `CUERPOS`; la propuesta es que reciba directamente un `WarehouseSnapshot` ya resuelto (mismo resultado, pero calculado una sola vez en el dominio, no recalculado con el bucle de `aplicarPosicionGuardada` corriendo N veces sobre un objeto de 270 KB).
