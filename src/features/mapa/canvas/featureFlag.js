/**
 * Interruptor único del canvas nuevo del mapa (react-konva), Fase A --
 * apagado por default a propósito: el iframe legacy sigue siendo lo que
 * usa todo el mundo hasta que el canvas cubra el 100% de su funcionalidad
 * (ver el plan de fases). Permite volver al mapa legacy en un deploy sin
 * revertir código.
 *
 * NO activar por default sin aprobación explícita del usuario.
 */
export const MAPA_CANVAS_HABILITADO = false;
