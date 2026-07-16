/**
 * Helper de cubo isométrico del panel de marca del Login -- primer uso de
 * SVG a mano en el repo (antes todo era Tabler Icons o CSS). 3 polígonos
 * (cara superior clara, izquierda media, derecha oscura, proyección
 * estándar de 30°), reutilizado por `loginEscenaAlmacen.jsx` para construir
 * los racks/pallets de la escena -- nada de librerías nuevas, nada de fotos.
 */

export const PALETA_CUBO = { top: '#4FE0D1', izq: '#2A9E92', der: '#1B6C63' };
export const PALETA_CUBO_OPTIMO = { top: '#F5C065', izq: '#E0A23D', der: '#B87D22' };

/**
 * Un cubo isométrico centrado en (cx,cy) -- ancho: mitad de la diagonal
 * horizontal del rombo superior; alto: alto vertical de las caras
 * laterales. Contorno sutil + una línea de "cinta" cruzando la cara
 * superior (detalle de caja de embalaje, no solo un rombo de color plano)
 * -- pulido pedido explícito ("las figuras... podríamos mejorar más").
 */
export function CuboIso({ cx, cy, ancho = 14, alto = 14, colores = PALETA_CUBO, opacity = 1 }) {
  const mitadV = ancho / 2; // proporción 2:1 del rombo (estándar isométrico)
  const top = `${cx},${cy - mitadV} ${cx + ancho},${cy} ${cx},${cy + mitadV} ${cx - ancho},${cy}`;
  const izq = `${cx - ancho},${cy} ${cx},${cy + mitadV} ${cx},${cy + mitadV + alto} ${cx - ancho},${cy + alto}`;
  const der = `${cx},${cy + mitadV} ${cx + ancho},${cy} ${cx + ancho},${cy + alto} ${cx},${cy + mitadV + alto}`;
  return (
    <g opacity={opacity} stroke="rgba(0,0,0,.22)" strokeWidth={0.75} strokeLinejoin="round">
      <polygon points={izq} fill={colores.izq} />
      <polygon points={der} fill={colores.der} />
      <polygon points={top} fill={colores.top} />
      <line x1={cx - ancho} y1={cy} x2={cx + ancho} y2={cy} stroke="rgba(255,255,255,.35)" strokeWidth={0.75} />
      <line x1={cx} y1={cy - mitadV} x2={cx} y2={cy + mitadV} stroke="rgba(255,255,255,.35)" strokeWidth={0.75} />
    </g>
  );
}

/** Solo el contorno del rombo superior (sin caras laterales) -- una posición de rack VACÍA, mismo lenguaje visual que el mapa real de la app (celda vacía vs. ocupada). Opacidad bajada (antes .22) -- pedido explícito de "menos cargado". */
export function PosicionVacia({ cx, cy, ancho = 14 }) {
  const mitadV = ancho / 2;
  const top = `${cx},${cy - mitadV} ${cx + ancho},${cy} ${cx},${cy + mitadV} ${cx - ancho},${cy}`;
  return <polygon points={top} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={1} strokeDasharray="2 2" />;
}
