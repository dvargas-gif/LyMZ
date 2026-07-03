import { colorDeClase } from '../constants/coloresArticulo.js';

/**
 * Badge de clasificación de artículo (A/B/C/D o "CE" para cuerpo entero).
 * Cada archivo que lo usa sigue decidiendo POR SU CUENTA si corresponde
 * mostrar un badge o un "—" (esa condición varía un poco entre pantallas y
 * no es parte de este componente) — esto solo resuelve el contenido del
 * badge una vez que ya se decidió mostrarlo.
 *
 * `mostrarCE=false` reproduce el comportamiento actual de PanelCargaMasiva y
 * PanelCargaPicks, que hoy NO sustituyen la clase por "CE" en cuerpos
 * enteros (a diferencia de ReportePanel/EdicionEnVivoTabla, que sí) — se
 * preservó esa diferencia tal cual estaba en vez de unificarla en silencio.
 */
const badgeStyle = { display: 'inline-block', minWidth: 22, textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 };

export default function BadgeClase({ clase, tipo, mostrarCE = true }) {
  const etiqueta = mostrarCE && tipo === 'CUERPO' ? 'CE' : clase;
  return <span style={{ ...badgeStyle, background: colorDeClase(clase, tipo) }}>{etiqueta}</span>;
}
