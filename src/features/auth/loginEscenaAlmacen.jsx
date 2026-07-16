import { motion } from 'framer-motion';
import { CuboIso, PosicionVacia, PALETA_CUBO_OPTIMO } from './loginIlustraciones.jsx';
import { DURACION, EASING } from '../../ui/motion/tokens.js';

/**
 * "Digital twin" isométrico del almacén -- reemplaza a las 3 tarjetas de
 * hoy (pedido explícito del usuario: la escena es el protagonista, no un
 * listado). Racks, montacargas, rutas con partícula viajera, nodos que
 * pulsan y una caja en tránsito, todo en el mismo lenguaje visual que
 * CuboIso ya estableció. viewBox fijo (400x260) -- Login.jsx usa el MISMO
 * ancho/alto para `.login-escena` (`aspect-ratio`) y para posicionar los 3
 * paneles HUD en `%`, así un punto acá adentro siempre cae en el mismo
 * lugar visual que su panel correspondiente, sin medir nada en runtime
 * (ver ANCLAS_HUD, la única fuente de verdad de esas 3 coordenadas).
 *
 * `pausar` (distinto de `reducido`): mientras hay una leyenda abierta, el
 * movimiento ambiental de la escena se congela -- pedido explícito del
 * usuario ("a la hora de ver las leyendas se hace difícil por el
 * movimiento constante"). A diferencia de `reducido` (preferencia
 * persistente de accesibilidad, los nodos ni se montan), `pausar` es
 * temporal: los elementos siguen ahí, solo dejan de animar, y retoman
 * apenas se cierra la leyenda.
 */

export const ESCENA_ANCHO = 400;
export const ESCENA_ALTO = 260;

// Punto del panel HUD (hud) + punto de la escena al que apunta (escena) --
// Login.jsx importa esto mismo para posicionar los paneles en `%`, nunca
// hay dos copias de estas coordenadas.
export const ANCLAS_HUD = {
  slotting: { hud: { x: 46, y: 40 }, escena: { x: 150, y: 96 } },
  // Antes en (262,64) -- pegado arriba, dejaba todo el hueco a la izquierda
  // de los racks vacío (feedback real, captura con óvalo señalando ese
  // espacio muerto). Se baja al hueco entre las 2 filas de racks, así el
  // marcador + su ruta ocupan ese lugar en vez de dejarlo en blanco.
  trazabilidad: { hud: { x: 354, y: 40 }, escena: { x: 26, y: 128 } },
  inventario: { hud: { x: 354, y: 222 }, escena: { x: 322, y: 194 } },
};

// Columnas separadas 42px (antes 34px, se veían "pegadas" -- feedback
// real del usuario) para que las cajas respiren entre sí.
const RACK_COLUMNAS = [66, 108, 150, 192, 234];
const RACK_FILA_1 = 96;
const RACK_FILA_2 = 150;
// Patrón fijo de ocupación -- no aleatorio, el layout no puede "saltar" entre renders.
const OCUPADA_FILA_1 = [true, false, true, true, false];
const OCUPADA_FILA_2 = [false, true, false, true, true];

const RUTA_A = 'M58,206 C92,206 90,158 112,138 S138,105 150,98';
const PUNTOS_RUTA_A = [{ x: 58, y: 206 }, { x: 84, y: 198 }, { x: 104, y: 158 }, { x: 130, y: 116 }, { x: 150, y: 98 }];
// Sale del hueco entre las 2 filas de racks (izquierda), pasa por debajo de
// la fila 2 (nunca la atraviesa) y llega al mismo nodo de inventario de siempre.
const RUTA_B = 'M26,128 C50,160 40,196 110,198 S260,198 322,194';
const PUNTOS_RUTA_B = [{ x: 26, y: 128 }, { x: 45, y: 175 }, { x: 110, y: 198 }, { x: 220, y: 199 }, { x: 322, y: 194 }];

// El nodo en (322,194) es también el punto de anclaje del HUD "Inventario"
// -- ahí termina su línea conectora, sin necesitar una figura aparte.
const NODOS = [{ x: 58, y: 206 }, { x: 150, y: 98 }, { x: 262, y: 64 }, { x: 300, y: 100 }, { x: 320, y: 150 }, { x: 322, y: 194 }];

function Racks({ resaltado }) {
  const activo = resaltado === 'slotting';
  return (
    <motion.g
      animate={{ scale: activo ? 1.07 : 1 }}
      transition={{ duration: DURACION.estado, ease: EASING.cambio }}
      style={{ transformOrigin: '150px 122px', filter: activo ? 'drop-shadow(0 0 10px rgba(79,224,209,.65))' : 'none' }}
    >
      {RACK_COLUMNAS.map((x, i) => (
        OCUPADA_FILA_1[i]
          ? <CuboIso key={`f1-${i}`} cx={x} cy={RACK_FILA_1} ancho={13} alto={13} colores={i === 2 ? PALETA_CUBO_OPTIMO : undefined} />
          : <PosicionVacia key={`f1-${i}`} cx={x} cy={RACK_FILA_1} ancho={13} />
      ))}
      {RACK_COLUMNAS.map((x, i) => (
        OCUPADA_FILA_2[i]
          ? <CuboIso key={`f2-${i}`} cx={x} cy={RACK_FILA_2} ancho={13} alto={13} />
          : <PosicionVacia key={`f2-${i}`} cx={x} cy={RACK_FILA_2} ancho={13} />
      ))}
    </motion.g>
  );
}

/** Montacargas estilizado (cuerpo + mástil/horquillas + ruedas) -- mismo nivel de detalle que los cubos, no fotorrealista. Idle: un balanceo sutil, nunca deja su posición. */
function Montacargas({ quieto }) {
  return (
    <motion.g
      transform="translate(46,208)"
      animate={quieto ? undefined : { y: [0, -2, 0] }}
      transition={quieto ? undefined : { duration: DURACION.navegacion, repeat: Infinity, ease: EASING.cambio }}
    >
      <polygon points="0,0 22,-11 44,0 22,11" fill="#E0A23D" stroke="rgba(0,0,0,.2)" strokeWidth={0.75} />
      <polygon points="0,0 0,-14 22,-25 22,-11" fill="#B87D22" stroke="rgba(0,0,0,.2)" strokeWidth={0.75} />
      <polygon points="22,-11 22,-25 44,-14 44,0" fill="#8F5F19" stroke="rgba(0,0,0,.2)" strokeWidth={0.75} />
      <line x1="1" y1="-14" x2="1" y2="-40" stroke="#4FE0D1" strokeWidth={2.5} />
      <line x1="-9" y1="-3" x2="-23" y2="-10" stroke="#2A9E92" strokeWidth={3} strokeLinecap="round" />
      <line x1="-9" y1="3" x2="-23" y2="-4" stroke="#2A9E92" strokeWidth={3} strokeLinecap="round" />
      <circle cx="9" cy="9" r="5" fill="#14242A" />
      <circle cx="35" cy="9" r="5" fill="#14242A" />
    </motion.g>
  );
}

/** Ruta con trazo viajero (mismo `strokeDashoffset` en loop de IlustracionTrazabilidad de hoy) + una partícula recorriéndola por puntos muestreados del path -- sin `offset-path` por soporte de navegador disparejo. */
function RutaConParticula({ d, puntos, colorParticula, quieto, demora = 0 }) {
  return (
    <g>
      <motion.path
        d={d} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth={2} strokeLinecap="round" strokeDasharray="1 8"
        animate={quieto ? undefined : { strokeDashoffset: [0, -36] }}
        transition={quieto ? undefined : { duration: DURACION.trazadoRuta, repeat: Infinity, ease: 'linear' }}
      />
      {!quieto && (
        <motion.circle
          r={3} fill={colorParticula}
          animate={{ cx: puntos.map(p => p.x), cy: puntos.map(p => p.y), opacity: [0, 1, 1, 1, 0] }}
          transition={{ duration: DURACION.trazadoRuta, repeat: Infinity, repeatDelay: DURACION.pausaCorta, ease: 'linear', delay: demora }}
        />
      )}
    </g>
  );
}

/** Amplitud del pulso reducida (1.7->1.35) -- feedback real del usuario ("quitarle un poco de movilidad para que sea más fluido"), sin apagarla del todo. */
function Nodos({ reducido, quieto }) {
  if (reducido) return null;
  return NODOS.map((n, i) => (
    <motion.circle
      key={i} cx={n.x} cy={n.y} r={4} fill="#4FE0D1"
      style={{ transformOrigin: `${n.x}px ${n.y}px` }}
      animate={quieto ? { scale: 1, opacity: 0.8 } : { scale: [1, 1.35, 1], opacity: [0.55, 1, 0.55] }}
      transition={{ duration: DURACION.navegacion, repeat: quieto ? 0 : Infinity, ease: EASING.cambio, delay: quieto ? 0 : i * 0.25 }}
    />
  ));
}

/** Pin de trazabilidad sobre la ruta B -- el punto de anclaje del HUD "Trazabilidad". cx/cy parametrizados (antes hardcodeados en 262,64) para poder reubicarlo sin duplicar la geometría del pin. */
function MarcadorTrazabilidad({ resaltado, cx, cy }) {
  const activo = resaltado === 'trazabilidad';
  return (
    <motion.g
      animate={{ scale: activo ? 1.3 : 1 }}
      transition={{ duration: DURACION.estado, ease: EASING.cambio }}
      style={{ transformOrigin: `${cx}px ${cy}px`, filter: activo ? 'drop-shadow(0 0 10px rgba(245,192,101,.7))' : 'none' }}
    >
      <path d={`M${cx},${cy - 13} a9,9 0 1 1 -0.01,0 z M${cx},${cy + 5} l-6,-10 h12 z`} fill="#F5C065" stroke="rgba(0,0,0,.2)" strokeWidth={0.75} />
      <circle cx={cx} cy={cy - 4} r={3.5} fill="#1B6C63" />
    </motion.g>
  );
}

/** Una caja "en tránsito" sobre la fila 2 de racks -- se desliza entre dos posiciones, en loop con una pausa breve. */
function CajaMovil({ quieto }) {
  if (quieto) return <CuboIso cx={150} cy={RACK_FILA_2 - 26} ancho={10} alto={10} colores={PALETA_CUBO_OPTIMO} />;
  return (
    <motion.g
      animate={{ x: [0, 42, 0] }}
      transition={{ duration: DURACION.trazadoRuta, repeat: Infinity, repeatDelay: DURACION.pausaCorta, ease: EASING.cambio }}
    >
      <CuboIso cx={150} cy={RACK_FILA_2 - 26} ancho={10} alto={10} colores={PALETA_CUBO_OPTIMO} />
    </motion.g>
  );
}

function LineaConectora({ ancla, activo }) {
  return (
    <motion.line
      x1={ancla.hud.x} y1={ancla.hud.y} x2={ancla.escena.x} y2={ancla.escena.y}
      strokeWidth={activo ? 1.8 : 1} strokeDasharray="3 4" strokeLinecap="round"
      animate={{ stroke: activo ? '#9FEDE2' : 'rgba(255,255,255,.18)' }}
      transition={{ duration: DURACION.micro }}
    />
  );
}

export default function EscenaAlmacen({ reducido, resaltado, pausar = false }) {
  const quieto = reducido || pausar;
  return (
    <svg
      viewBox={`0 0 ${ESCENA_ANCHO} ${ESCENA_ALTO}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true"
    >
      <ellipse cx={200} cy={232} rx={190} ry={16} fill="rgba(0,0,0,.18)" />

      <RutaConParticula d={RUTA_A} puntos={PUNTOS_RUTA_A} colorParticula="#4FE0D1" quieto={quieto} />
      <RutaConParticula d={RUTA_B} puntos={PUNTOS_RUTA_B} colorParticula="#F5C065" quieto={quieto} demora={DURACION.pausaCorta / 2} />

      <Racks resaltado={resaltado} />
      <Montacargas quieto={quieto} />
      <MarcadorTrazabilidad resaltado={resaltado} cx={ANCLAS_HUD.trazabilidad.escena.x} cy={ANCLAS_HUD.trazabilidad.escena.y} />
      <CajaMovil quieto={quieto} />
      <Nodos reducido={reducido} quieto={quieto} />

      {Object.entries(ANCLAS_HUD).map(([id, ancla]) => (
        <LineaConectora key={id} ancla={ancla} activo={resaltado === id} />
      ))}
    </svg>
  );
}
