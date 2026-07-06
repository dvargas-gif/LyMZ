import { z } from 'zod';

/**
 * WarehouseSnapshot v1 -- ver DOMAIN.md para el contrato completo y su
 * historial de versiones. Es el estado CRUDO resuelto (posiciones, bloqueos,
 * descripciones, config de ocupación) -- nunca los derivados (racks,
 * ocupación por rack, etc.): esos se recalculan siempre desde el snapshot,
 * nunca se congelan dentro de él (Ley 3: derivados nunca persistidos,
 * aplicada también al propio snapshot).
 *
 * Plano y JSON-safe a propósito: es la moneda futura para postMessage
 * (Fase 2) y Web Workers (Fase 3+) -- nada de Map/Set/clases, solo tipos
 * planos serializables.
 */

export const SNAPSHOT_VERSION = 1;

/** Espejo de inventario_slotting (ver db/schema.sql) -- la foto de fábrica. */
export const PosicionBaseSchema = z.object({
  articulo: z.string(),
  pasillo: z.string(),
  columna: z.number(),
  nivel: z.string().nullable(),
  clase: z.string().nullable(),
  tipo: z.string().nullable(),
  picks: z.number().nullable().optional(),
  consumo: z.number().nullable().optional(),
  rack_actual: z.string().nullable().optional(),
  niveles_a_armar: z.number().nullable().optional(),
});

/** Posición actual resultante -- {pasillo,columna,nivel,clase,tipo} o null si el artículo fue eliminado (solo dentro de una sala). */
export const PosicionActualSchema = z.object({
  pasillo: z.union([z.string(), z.number()]),
  columna: z.number(),
  nivel: z.string().nullable(),
  clase: z.string().nullable(),
  tipo: z.string().nullable(),
}).nullable();

/** Salida de resolverPosicionesActuales() para un artículo -- posicionBase y posicionActual SEPARADOS, ver ADR-003. */
export const ArticuloResueltoSchema = z.object({
  articulo: z.string(),
  posicionBase: PosicionBaseSchema.nullable(),
  posicionActual: PosicionActualSchema,
  movido: z.boolean(),
  sinBase: z.boolean(),
});

/** Espejo de bloqueos/escenario_bloqueos -- solo la clave del rack bloqueado. */
export const BloqueoSchema = z.string(); // "pasillo|columna"

/** Espejo de auditoria -- ver db/schema.sql. Solo movimientos reales (una sala no genera auditoría real). */
export const MovimientoSchema = z.object({
  usuarioId: z.string().nullable().optional(),
  usuarioNombre: z.string().nullable().optional(),
  fecha: z.string(),
  hora: z.string(),
  accion: z.string(),
  estado: z.string(),
  articulo: z.string().nullable().optional(),
  rackOrigen: z.string().nullable().optional(),
  nivelOrigen: z.string().nullable().optional(),
  rackDestino: z.string().nullable().optional(),
  nivelDestino: z.string().nullable().optional(),
  tipoMovimiento: z.string().nullable().optional(),
});

/** Espejo de configuracionOcupacion.js -- viaja en el snapshot porque quien lo consuma (bridge, 3D) no debe reimplementar los umbrales. */
export const ConfiguracionOcupacionSchema = z.object({
  capacidadUtilRack: z.number(),
  umbralRack: z.object({ sobrecargado: z.number(), alerta: z.number(), medio: z.number() }),
  umbralNivelExcede: z.number(),
  umbralArticulo: z.object({ alto: z.number(), medio: z.number() }),
});

export const WarehouseSnapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  escenarioId: z.number().nullable(),
  generadoEn: z.string(), // ISO 8601
  posiciones: z.array(ArticuloResueltoSchema),
  bloqueos: z.array(BloqueoSchema),
  descripciones: z.record(z.string(), z.string()),
  configuracionOcupacion: ConfiguracionOcupacionSchema,
});

/**
 * Construye y VALIDA un WarehouseSnapshot a partir del estado interno de un
 * WarehouseModel. Tira si el resultado no matchea el schema -- mejor fallar
 * ruidoso acá que mandar un snapshot corrupto a un consumidor futuro
 * (postMessage, Web Worker) que va a fallar mucho más lejos del origen.
 */
export function crearSnapshot({ escenarioId, posiciones, bloqueos, descripciones, configuracionOcupacion }) {
  const snapshot = {
    version: SNAPSHOT_VERSION,
    escenarioId,
    generadoEn: new Date().toISOString(),
    posiciones,
    bloqueos,
    descripciones: Object.fromEntries(descripciones),
    configuracionOcupacion,
  };
  return WarehouseSnapshotSchema.parse(snapshot);
}
