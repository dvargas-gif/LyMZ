/**
 * Paleta del canvas del mapa -- 4 colores principales, pedidos explícitamente
 * por el usuario para reemplazar el "todo un tono de verde" de la Fase A:
 * verde oscuro (estructura), negro grafito (fondo), blanco cálido
 * (texto/paneles), café ceniza (detalles del "almacén"). Pensada para leerse
 * como aplicación industrial moderna, no como interfaz de videojuego.
 *
 * Los colores por CLASE de artículo (A/B/C/D/CUERPO) NO viven acá -- siguen
 * en src/shared/constants/coloresArticulo.js, son datos de negocio
 * compartidos con el resto de la app (Dashboard, reportes), no un tema
 * visual del mapa.
 */

export const VERDE_ESTRUCTURA = '#1F3D34';
export const VERDE_ESTRUCTURA_CLARO = '#3A6358'; // hover/acento sobre fondo oscuro

export const NEGRO_GRAFITO = '#121415';
export const NEGRO_GRAFITO_CLARO = '#1B1F20'; // paneles/tarjetas, un escalón arriba del fondo

export const BLANCO_CALIDO = '#F2EDE4';
export const BLANCO_CALIDO_TENUE = '#B9B3A8'; // texto secundario sobre fondo oscuro

export const CAFE_CENIZA = '#4A4038';
export const CAFE_CENIZA_CLARO = '#6B5F54'; // bordes/divisores, más visible que el café base

/** Fondo del CANVAS del mapa (Stage, celdas vacías, minimapa) -- gris industrial en vez del negro casi puro de antes, pedido explícito del usuario. NO afecta la toolbar/tooltip/panel flotantes, que siguen sobre su propia base oscura translúcida. */
export const GRIS_MAPA = '#2E3234';
export const GRIS_MAPA_CLARO = '#3A3E40'; // celdas vacías -- un escalón más claro que el fondo, mismo criterio que tenía NEGRO_GRAFITO_CLARO antes

/** Panel de detalle (PanelDetalle/BarraPestanas) -- "blanco hueso" pedido explícito del usuario para reemplazar el tema oscuro verde/café que tenía. Estos SOLO se usan ahí, el resto de la UI del canvas (toolbar, tooltip, movebar) sigue oscura. */
export const BLANCO_HUESO = '#F7F3EA';
export const BLANCO_HUESO_TARJETA = '#EFEAE0'; // tarjetas/barra de pestañas -- un escalón más oscuro que el fondo del panel
export const GRIS_TEXTO = '#3B3733'; // texto principal sobre el panel claro
export const GRIS_TEXTO_TENUE = '#6B655C'; // texto secundario sobre el panel claro
// ADR de legibilidad operativa (2026-07-08): #D9D2C4 original medía 1.25:1
// contra BLANCO_HUESO_TARJETA -- muy por debajo del mínimo WCAG 1.4.11 (3:1)
// para bordes funcionales. Oscurecido manteniendo el mismo tono cálido:
// 3.65:1 contra BLANCO_HUESO, 3.37:1 contra BLANCO_HUESO_TARJETA (calculado,
// no a ojo). Es la única variable que cambia -- todo lo que usa BORDE_CLARO
// se pone más nítido de una sola vez, no se creó un token paralelo.
export const BORDE_CLARO = '#827E76'; // bordes sobre el panel claro

/** Estado de llenado (comparte semántica con colorLlenura() del dominio, no la reemplaza -- ver formulasOcupacion.js). */
export const ESTADOS = {
  ok: '#6FA98A',
  medio: '#4C8FA0',
  alerta: '#C99A4A',
  sobrecargado: '#B5533F',
};

/**
 * Resaltado de la tarea de migración que YA tenés en curso (`migracion_slots.iniciado_por`
 * === tu usuario) -- pedido explícito: ver en el mapa, sin tener que buscarlo, a cuál
 * rack hay que LLEVAR mercadería (verde -- reusa ESTADOS.ok, mismo tono que
 * ya significaba "resultado encontrado") y de cuáles hay que SACARLA
 * durante "Recolectando" (morado, color nuevo -- no se pisa con ningún
 * significado existente del mapa). El botón "Generar movimiento" (F2) que
 * originalmente motivó esto se sacó (2026-07-22, superado por Órdenes de
 * Ejecución) -- el resaltado sigue valiendo para quien inicia un traslado a mano.
 */
export const MIGRACION_ORIGEN = '#8B6DBE';
