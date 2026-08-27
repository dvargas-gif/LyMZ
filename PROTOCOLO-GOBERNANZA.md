# PROTOCOLO-GOBERNANZA.md — Reglas de operación para el agente

> Referenciado desde MASTER-PROMPT.md. Aplica a toda sesión que toque producción (código o datos).
> Origen: sesión de auditoría 2026-08-25, donde el agente diagnosticó bien y gobernó mal (Regla 2, más abajo).
> Versión negociada -- las reglas 1 y 7 fueron discutidas y modificadas antes de aceptarse; el resto se aceptó sin cambios porque cada una tenía un incidente real pegado al lado. Regla de diseño para el futuro: una regla nueva nace de un incidente real, o carga la justificación de por qué no puede esperar a tenerlo -- las preventivas sin caso se erosionan solas.

---

## Regla 1 (v2) — Escritura de código vs. escritura de datos de producción, con desempate

**Código** (git, reversible, testeado): se escribe y prueba libre en la rama de trabajo, mismo ritmo que ya validó el usuario toda la sesión. Antes de commit: diff completo + decisiones semánticas explicitadas (Regla 2).

**Datos de producción (SQL contra Supabase)**: aprobación literal previa, sin excepción, siempre en formato Regla 5 (PRE/escritura/POST/rollback).

**Cláusula de desempate**: ante cualquier duda sobre si algo es "decisión de negocio" o "detalle técnico", se trata como decisión de negocio. El costo de preguntar de más es un mensaje; el de clasificar mal ya se pagó una vez (ver Regla 2). El agente no es juez confiable de su propia clasificación -- si duda, pregunta.

---

## Regla 2 — Las decisiones semánticas son del PM, no del agente

Si un cambio de código o de datos implica una decisión sobre QUÉ HACE el sistema ante un caso ambiguo (no solo cómo lo hace), esa decisión se propone con opciones y consecuencias -- el agente no elige por su cuenta.

**Violación real que originó esta regla:** ante un movimiento pendiente todavía referenciado por trabajo real (`despacho_tareas`/`migracion_buffer`), el agente decidió solo la política ("excluir del borrado, preservar intacto") e implementó directo, sin presentar las alternativas reales (abortar todo, cascadear, avisar y saltar) para que el PM eligiera.

---

## Regla 3 — Las preguntas al mundo físico bloquean, marcadas `[PISO]`

Si la respuesta requiere que alguien camine al piso, mire un rack, o verifique mercadería real, esa pregunta bloquea SOLO el trabajo que depende de ella (no todo el mensaje) -- pero se marca con el prefijo `[PISO]` para que sea inconfundible, y se lista al final de cada mensaje que tenga alguna abierta.

---

## Regla 4 — El estado en datos refleja la realidad física, siempre

Antes de asignar o cambiar el `estado` de cualquier registro que representa algo físico, responder por escrito: *"¿Dónde está este objeto físicamente AHORA, y este estado le dice eso al motor?"*

Al reconstruir registros históricos, preservar timestamps originales cuando existan; si no existen, decirlo explícitamente en vez de rellenar con "ahora".

---

## Regla 5 — Toda escritura a producción viaja con su verificación

```sql
begin;
-- (A) PRE: consultas que muestran el estado actual, con el resultado esperado anotado
-- (B) La escritura
-- (C) POST: consultas que demuestran que quedó bien, con el resultado esperado anotado
-- (D) Condición explícita de rollback: "si POST no da X, rollback"
-- commit;  <- descomentado solo por el PM, después de ver POST
```

Sin PRE y POST con valores esperados numéricos, la SQL no está lista para proponerse.

---

## Regla 6 — Los hallazgos nuevos se reportan aparte, no se absorben

Un dato anómalo que aparece a mitad de otra tarea se reporta como hallazgo separado, con su evidencia, preguntando si se investiga ahora o se anota en BACKLOG. No se ignora, no se arregla de paso, no se mezcla con la tarea en curso.

---

## Regla 7 (acotada) — Etiqueta de modo solo donde importa

Etiqueta obligatoria (`[DIAGNÓSTICO]` / `[PROPUESTA]` / `[EJECUCIÓN]`) únicamente en mensajes que contengan diff, SQL, o reporte de ejecución -- no en charla, preguntas, o análisis. Ceremonia que no compra seguridad debe morir; un protocolo inflado termina ignorado entero.

---

## Regla 8 — Reporte de cierre de sesión

Al final de cada sesión de trabajo que tocó producción: (1) qué se ejecutó realmente, con evidencia POST; (2) qué quedó propuesto sin aprobar; (3) preguntas `[PISO]` abiertas; (4) hallazgos anotados sin resolver; (5) qué actualizar en PROGRESO.md/DECISIONES.md.

---

## Canario para el PM (no para el agente)

Ocho reglas significan que cada avance pasa por la lectura del PM -- la fatiga de aprobación es silenciosa. Una vez por semana, pedirle al agente que resuma qué se aprobó, y compararlo contra lo que realmente se recuerda haber aprobado. El día que no coincidan, no endurecer las reglas -- recortarlas a las tres que de verdad se leen.

## Cláusula final

Diagnosticar bien no compra permiso para ejecutar. Las dos cosas se evalúan por separado, y la segunda sin gate anula el valor de la primera.
