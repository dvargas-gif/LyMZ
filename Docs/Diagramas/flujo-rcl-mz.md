# Migración RCL → MZ — flujo operativo

> Diagrama vivo: se actualiza a medida que el proceso real cambia. Reconstruido a partir de
> `MASTER-PROMPT.md`, `DECISIONES.md` (ADR-015, ADR-017, ADR-020) y `PROGRESO.md` — no es
> una fuente de verdad aparte, es una lectura de esos documentos en forma de diagrama.

Cómo se mueve un artículo desde su posición legacy (`RCL`) hasta su destino en el nuevo
mezanine (`MZ`): el buffer temporal, el bloqueo de slot, la confirmación humana, y dónde se
cruza con Despacho y la detección de conflictos.

```mermaid
flowchart TD
  subgraph PLAN["Plan de migración"]
    P0["Motor de optimización<br/>(dos fases)"] -->|asigna destino| P1["migracion_movimientos<br/><i>pendiente</i>"]
  end

  subgraph PISO["Piso — Operador"]
    A["Rack RCL<br/>con mercadería"] -->|recolecta / vacía| B["migracion_buffer<br/><i>temporal, por operador</i>"]
  end
  P1 -.->|define destino real| B

  subgraph REGLAS["Sistema — reglas automáticas"]
    B -->|"volumen > 100 / operador"| R1["Purga<br/>por volumen"]
    B -->|"antigüedad excede umbral"| R2["Purga<br/>por antigüedad"]
  end

  B -->|traslado físico| C["Slot MZ destino"]
  C -->|"iniciar traslado"| D["migracion_slots<br/><i>bloqueado</i>"]

  subgraph SUP["Supervisor / Administrador"]
    D -->|confirma llegada| E["migracion_slots<br/><i>confirmado_en</i>"]
  end

  E --> F["inventario_slotting<br/><i>posición MZ real</i>"]
  E -.->|cierra| P1

  subgraph DESP["Despacho (en paralelo)"]
    G["Oleada:<br/>rack completo"] -->|"tarea vaciar / depositar"| B
    H["Cambio manual<br/>en el mapa"] -.->|"¿coincide con el plan?"| I{"¿Conflicto?"}
    I -->|no| J["Se marca<br/>recolectado solo"]
    I -->|"sí"| K["Cola de revisión<br/>Supervisor"]
  end

  F -.->|registra| Z[("auditoria")]

  classDef piso fill:#e3f2ef,stroke:#128577,color:#1c2422;
  classDef sistema fill:#ebe6dc,stroke:#8a8272,color:#1c2422;
  classDef humano fill:#f3e6d3,stroke:#a06a2c,color:#1c2422;
  class A,B,C piso;
  class P0,P1,R1,R2,G,H,I,J,Z sistema;
  class D,E,K humano;
```

## Leyenda

- **Verde (piso):** lo que toca el operador directamente.
- **Beige (sistema):** reglas automáticas, sin intervención humana.
- **Kraft (humano):** requiere aprobación de Supervisor o Administrador.
- Línea sólida = movimiento de datos/estado. Línea punteada = referencia o disparo condicional.

## Notas

- El motor de optimización define el destino **antes** de que el operador toque el rack —
  el buffer nunca es el punto donde se decide a dónde va un artículo.
- Todo artículo en `migracion_buffer` es temporal: sale hacia un slot MZ real, o se purga por
  volumen (`> 100/operador`) o por antigüedad si no avanza (ver ADR-025, hallazgo H2).
- El bloqueo de slot (`migracion_slots.bloqueado`) solo afecta **iniciar traslado** — no
  bloquea otras acciones sobre ese slot (decisión de negocio confirmada en la sesión de F1,
  ver ADR-015).
- La detección de conflicto (ADR-020) es lo que evita que un cambio manual en el mapa quede
  huérfano del plan de migración — antes de esa corrección, un movimiento manual que no
  coincidía con el plan no generaba ningún aviso.
