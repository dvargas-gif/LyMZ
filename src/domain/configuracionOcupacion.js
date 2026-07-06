/**
 * Configuración de ocupación del dominio -- ver DECISIONES.md ADR-004 y
 * ADR-005. Antes de G1d, estos números vivían hardcodeados en
 * public/legacy/js/05-ayudantes.js y 07-render.js sin ningún lugar donde
 * cambiarlos. Los valores por defecto acá son EXACTAMENTE los mismos que
 * el mapa legacy sigue usando (no cambia comportamiento) -- lo que cambia
 * es que ahora es configuración explícita, no una constante enterrada.
 *
 * El mapa legacy NO se toca ni se lee de acá -- sigue con sus propias
 * copias hardcodeadas (Ley 1). Este archivo es la versión del dominio,
 * para todo lo que consuma WarehouseModel de ahora en más.
 */
export const CONFIGURACION_OCUPACION_DEFAULT = {
  /**
   * Capacidad útil de un rack completo, en unidades de "consumo".
   * ADR-004: antes era la constante `4.5` enterrada en llenura() (comentario
   * original: "capacidad útil = 5 niveles × 0.90 = 4.5"). Se preserva como UN
   * solo número configurable, no como los dos factores separados -- en el
   * código original nunca se usaban por separado, solo el producto.
   */
  capacidadUtilRack: 4.5,

  /**
   * Umbrales de "llenura" de un RACK completo (consumoTotal / capacidadUtilRack).
   * ADR-005: valores idénticos a colorLlenura() del mapa legacy.
   */
  umbralRack: {
    sobrecargado: 1.0,
    alerta: 0.85,
    medio: 0.4,
  },

  /**
   * Umbral de un NIVEL individual (consumo agregado de ese nivel solo).
   * ADR-005: idéntico al chequeo ">0.90" dentro de abrir() en 07-render.js.
   * Es un concepto DISTINTO al de rack (mide un nivel, no el rack entero) --
   * no se deriva de umbralRack, se preserva como su propio número.
   */
  umbralNivelExcede: 0.90,

  /**
   * Umbrales de consumo de UN artículo individual (cuánto de un nivel
   * consume por sí solo -- mide concentración, no agregado).
   * ADR-005: idénticos a la tabla del modal en abrir() (07-render.js).
   */
  umbralArticulo: {
    alto: 0.90,
    medio: 0.60,
  },
};
