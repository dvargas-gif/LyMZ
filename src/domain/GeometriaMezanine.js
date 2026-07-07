import { z } from 'zod';

/**
 * Geometría real del mezanine -- extraída del plano DXF (docs/geometria/),
 * cruzando el bloque de rack repetido con las etiquetas de posición
 * (formato MZ0X-C0YY-N0Z-1, el mismo que ya usa el resto del sistema) que
 * marcan el inicio y fin de cada pasillo. Ver DECISIONES.md para el
 * proceso de extracción (varios intentos, documentados, hasta llegar a
 * este resultado validado).
 *
 * Plano ≠ Fase 2/bridge: esto es SOLO lectura de geometría física (x,y),
 * no toca el mapa legacy ni su render. La Fase 2 sigue en pausa.
 */

export const VERSION_GEOMETRIA = 1;

export const UbicacionFisicaSchema = z.object({
  columna: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
});

export const PasilloFisicoSchema = z.object({
  pasillo: z.string(),
  orientacion: z.enum(['horizontal', 'vertical']),
  ubicaciones: z.array(UbicacionFisicaSchema),
});

export const GeometriaMezanineSchema = z.object({
  version: z.literal(VERSION_GEOMETRIA),
  unidad: z.literal('metros'),
  generadoDesde: z.string(),
  pasillos: z.array(PasilloFisicoSchema),
});

/** Valida un objeto de geometría crudo contra el schema. Tira si no matchea -- mejor fallar acá que con datos corruptos más adelante. */
export function validarGeometria(datosCrudos) {
  return GeometriaMezanineSchema.parse(datosCrudos);
}

/** {pasillo|columna -> {x,y}} -- forma más práctica para lookups puntuales (ej. "¿dónde está MZ04 columna 12?"). */
export function indexarPorClave(geometria) {
  const indice = new Map();
  for (const p of geometria.pasillos) {
    for (const u of p.ubicaciones) {
      indice.set(`${p.pasillo}|${u.columna}`, { x: u.x, y: u.y });
    }
  }
  return indice;
}
