/**
 * Datos de ejemplo (mock, no hay backend real detrás) para la tarjeta de
 * SKU/producto que aparece al abrir una caja del rack 3D del Login -- pedido
 * explícito: "al seleccionar una ubicación que aparezca SKU/producto/
 * cantidad/estado/último movimiento". Convive con el contenido real de
 * CAPACIDADES_NIVEL (los 5 niveles), no lo reemplaza -- esto es una capa de
 * detalle aparte, sobre las cajas individuales, no sobre los niveles.
 * Un elemento por caja/tote interactiva (ver el orden de `contadorCaja` en
 * RackModel.js: nivel 0 -> índices 0,1; nivel 3 -> índices 2,3).
 */
export const INFO_MERCADERIA = [
  { posicion: 'A-01-01', sku: 'ABC-2031', producto: 'Motor Servo', cantidad: 18, estado: 'Disponible', ultimoMovimiento: 'Hace 32 segundos' },
  { posicion: 'A-01-02', sku: 'DEF-1187', producto: 'Rodamiento Industrial', cantidad: 42, estado: 'Disponible', ultimoMovimiento: 'Hace 5 minutos' },
  { posicion: 'A-04-01', sku: 'GHI-5502', producto: 'Sensor de Proximidad', cantidad: 7, estado: 'Bajo stock', ultimoMovimiento: 'Hace 12 minutos' },
  { posicion: 'A-04-02', sku: 'JKL-3390', producto: 'Correa Transportadora', cantidad: 24, estado: 'Disponible', ultimoMovimiento: 'Hace 1 hora' },
];
