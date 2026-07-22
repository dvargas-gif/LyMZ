/**
 * Detección de capacidad WebGL2 -- compartida por cualquier escena 3D de la
 * app (hoy: el rack decorativo del Login; mañana: la Fase 4 real del
 * almacén, ver MASTER-PROMPT.md sección "Vista 3D opcional"). Nunca asume
 * soporte -- crear un canvas de prueba y pedir el contexto es la única
 * forma confiable, no hay feature-detection por user-agent.
 */
export function detectarWebGL2() {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}
