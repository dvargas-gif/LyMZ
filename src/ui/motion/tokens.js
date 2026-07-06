/**
 * Tokens de animación -- fuente única del estándar acordado en
 * MASTER-PROMPT.md sección 7 ("Estándar de animaciones", transversal a
 * todas las fases). Prohibidas las duraciones/easings mágicos inline: todo
 * componente animado importa de acá, nunca escribe "0.3" a mano.
 *
 * camara3d y trazadoRuta están definidos ya (mismos valores que el estándar)
 * aunque todavía no los use nadie -- son del mismo estándar acordado, no una
 * anticipación especulativa: mejor un solo lugar con los 6 valores completos
 * que reinventarlos de a uno por fase.
 */
export const DURACION = {
  micro: 0.15,        // micro-interacciones (hover, click)
  estado: 0.3,         // cambios de estado (aparecer/desaparecer, highlight)
  navegacion: 0.5,      // transiciones de navegación entre vistas
  countUp: 0.6,          // animación de conteo en KPIs
  camara3d: 0.8,          // reservado -- Fase 4 (vista 3D), tweening de cámara
  trazadoRuta: 1.5,        // reservado -- Fase 3 (simulación), trazo de rutas sobre el mapa
};

export const EASING = {
  entrada: [0.16, 1, 0.3, 1], // easeOut -- para elementos que aparecen
  cambio: [0.65, 0, 0.35, 1],  // easeInOut -- para elementos que cambian de estado
};

/** Milisegundos de stagger entre elementos de una lista que entra en cascada. */
export const STAGGER_MS = 40;
