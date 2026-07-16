/**
 * Tokens de animación -- fuente única del estándar acordado en
 * MASTER-PROMPT.md sección 7 ("Estándar de animaciones", transversal a
 * todas las fases). Prohibidas las duraciones/easings mágicos inline: todo
 * componente animado importa de acá, nunca escribe "0.3" a mano.
 *
 * camara3d está reservado (Fase 4, vista 3D) -- mismo valor que el estándar
 * acordado, no una anticipación especulativa: mejor un solo lugar con los
 * valores completos que reinventarlos de a uno por fase.
 */
export const DURACION = {
  micro: 0.15,        // micro-interacciones (hover, click)
  estado: 0.3,         // cambios de estado (aparecer/desaparecer, highlight)
  navegacion: 0.5,      // transiciones de navegación entre vistas
  countUp: 0.6,          // animación de conteo en KPIs
  camara3d: 0.8,          // reservado -- Fase 4 (vista 3D), tweening de cámara
  trazadoRuta: 1.5,        // trazo de rutas/badges flotantes (mapa en Fase 3, ilustraciones del Login hoy)
  pausaOnda: 2.6,          // pausa de descanso entre barridos/apariciones de un efecto en loop (ej. los badges flotantes del Login)
  pausaCorta: 1,           // pausa breve para loops que deben sentirse SIEMPRE vivos (ej. partícula/caja de la escena del Login) -- pausaOnda ahí se sentía "lento" (feedback real del usuario)
};

export const EASING = {
  entrada: [0.16, 1, 0.3, 1], // easeOut -- para elementos que aparecen
  cambio: [0.65, 0, 0.35, 1],  // easeInOut -- para elementos que cambian de estado
};

/** Milisegundos de stagger entre elementos de una lista que entra en cascada. */
export const STAGGER_MS = 40;

/** Físicas del "muelle" para interacciones que siguen al puntero (parallax/tilt) -- a diferencia de arriba, no son duration+easing sino rigidez+amortiguación de un spring. Un solo lugar con los valores, igual que DURACION/EASING. */
export const MUELLE = { rigidez: 120, amortiguacion: 14 };
