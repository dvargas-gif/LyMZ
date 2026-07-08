/**
 * Interruptor único del canvas nuevo del mapa (react-konva). Activado a
 * partir del 2026-07-08 por decisión explícita del usuario, después de:
 * (1) una auditoría de paridad funcional completa contra el mapa legacy
 * (ver PROGRESO.md/DECISIONES.md), y (2) cerrar los 3 gaps que esa
 * auditoría encontró -- "Limpiar slot" individual en sala, terminal de
 * cambios expandible, y color de alerta por artículo individual.
 *
 * Permite volver al mapa legacy en un deploy sin revertir código si hiciera falta.
 */
export const MAPA_CANVAS_HABILITADO = true;
