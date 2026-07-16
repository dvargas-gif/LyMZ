import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from './auth.service.js';
import { useAuth } from './AuthContext.jsx';
import Logo from '../../shared/components/Logo.jsx';
import { useReducedMotion } from '../../ui/motion/prefersReducedMotion.js';
import { entradaConStagger, entradaEscala, entradaProtagonista, entradaImpacto, brilloPulsante, barridoColor, ondaContinua } from '../../ui/motion/variants.js';
import { useTiltParallax } from '../../ui/motion/useTiltParallax.js';
import { STAGGER_MS, DURACION, EASING } from '../../ui/motion/tokens.js';

// Mosaico decorativo del panel de marca: evoca la grilla de racks del
// mezanine (el producto en sí) en vez de una foto de stock genérica.
// Patrón fijo (no aleatorio) para que el layout no "salte" entre renders.
const MOSAICO = [
  0, 1, 0, 0, 2, 0, 1, 0,
  1, 1, 0, 1, 0, 0, 0, 1,
  0, 0, 2, 0, 1, 0, 1, 0,
  1, 0, 0, 1, 0, 1, 0, 0,
  0, 1, 1, 0, 0, 0, 2, 1,
];
const COLUMNAS_MOSAICO = 8;
const CLASE_CELDA = ['', 'login-visual__celda--ocupada', 'login-visual__celda--activa'];
// Color de reposo de cada celda NO activa -- punto de partida/llegada del
// barrido ámbar (ver barridoColor en variants.js). Sin entrada para estado 2
// porque esas ya son ámbar permanente (glow propio, ver brilloPulsante).
const COLOR_BASE_CELDA = ['rgba(255,255,255,.08)', 'rgba(255,255,255,.22)'];

// Índices de la cascada de entrada del panel de marca -- cada bloque de
// texto entra en su turno (0, 1, 2...), la grilla cascadea en diagonal
// arrancando en el turno 3, y las features retoman la cuenta justo
// después de la celda más lejana. Todo en base a STAGGER_MS (ver
// tokens.js) -- ningún valor de delay está escrito a mano acá.
const INDICE_GRILLA_INICIO = 3;
const DIAGONAL_MAXIMA = Math.floor((MOSAICO.length - 1) / COLUMNAS_MOSAICO) + (COLUMNAS_MOSAICO - 1);
const INDICE_FEATURES_INICIO = INDICE_GRILLA_INICIO + DIAGONAL_MAXIMA + 1;
// La frase de marca es el cierre de la cascada -- aparece "de la nada"
// recién cuando ya entró todo lo demás, más una pausa extra para que se
// sienta como una revelación aparte, no un ítem más de la lista.
const INDICE_FRASE = INDICE_FEATURES_INICIO + 3;
const DEMORA_FRASE = INDICE_FRASE * (STAGGER_MS / 1000) + 0.3;

// Cinta inferior: cada ícono con su propia personalidad de movimiento en
// vez de un mismo float sincronizado -- pedido explícito del usuario
// ("que la caja se abra, el cubo dé vueltas y brinque, el camión se
// mueva"). Caja/cubo hacen su ráfaga y descansan (repeatDelay); el camión
// "maneja" de forma continua, sin pausa.
const ANIM_CAJA_ABRIR = {
  animate: { rotate: [0, -12, 9, 0], scale: [1, 1.15, 1] },
  transition: { duration: DURACION.rafaga, repeat: Infinity, repeatDelay: DURACION.pausaRafaga, ease: EASING.rebote },
};
const ANIM_CUBO_VUELTA = {
  animate: { rotate: [0, 360], y: [0, -16, 0, -7, 0] },
  transition: { duration: DURACION.rafaga, repeat: Infinity, repeatDelay: DURACION.pausaRafaga, ease: EASING.rebote },
};
const ANIM_CAMION_MANEJAR = {
  animate: { x: [0, 7, 0], y: [0, -2, 0, -1, 0] },
  transition: { duration: DURACION.conduccion, repeat: Infinity, ease: EASING.cambio },
};
const ANIM_ESTATICO = { animate: {}, transition: { duration: 0 } };

/**
 * Celda del mosaico -- entra en cascada, queda flotando en loop (todas las
 * celdas, no solo las activas) y además hace un barrido de color hacia
 * ámbar y de vuelta, en ola continua (pedido explícito del usuario en dos
 * pasadas: primero "que se muevan", después "que cambien de color ámbar
 * también"). Las celdas "activas" (estado 2) ya son ámbar permanente y en
 * cambio suman el brillo pulsante -- no compiten por el mismo color.
 * Flotación/barrido/brillo arrancan recién cuando termina la entrada de
 * ESA celda puntual, cada una a destiempo de la siguiente.
 */
function CeldaMosaico({ estado, indice, reducido }) {
  const entrada = entradaEscala(indice, reducido);
  const demora = reducido ? 0 : entrada.transition.delay + entrada.transition.duration;
  const onda = ondaContinua(reducido, demora);
  if (estado !== 2) {
    const barrido = barridoColor(COLOR_BASE_CELDA[estado], reducido, demora);
    return (
      <motion.div
        className={`login-visual__celda ${CLASE_CELDA[estado]}`}
        initial={entrada.initial}
        animate={{ ...entrada.animate, ...onda.animate, ...barrido.animate }}
        transition={{ opacity: entrada.transition, scale: entrada.transition, y: onda.transition, backgroundColor: barrido.transition }}
      />
    );
  }
  const glow = brilloPulsante(reducido, demora);
  return (
    <motion.div
      className={`login-visual__celda ${CLASE_CELDA[estado]}`}
      initial={entrada.initial}
      animate={{ ...entrada.animate, ...onda.animate, ...glow.animate }}
      transition={{ opacity: entrada.transition, scale: entrada.transition, y: onda.transition, boxShadow: glow.transition }}
    />
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  // Antes de revelar: el panel turquesa ocupa toda la pantalla (para que se
  // vea la animación completa, pedido explícito) y el formulario ni se
  // monta. Un click/tap o Enter/Espacio en cualquier parte del panel lo
  // revela -- de ahí en más se comporta exactamente como antes (retracción
  // al enfocar un campo, etc.).
  const [revelado, setRevelado] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const reducido = useReducedMotion();
  const tiltVisual = useTiltParallax();
  const tiltCard = useTiltParallax();

  function revelar() { setRevelado(true); }
  function revelarConTeclado(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); revelar(); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const sesion = await authService.login(email, password);
      login(sesion);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setCargandoGoogle(true);
    try {
      await authService.loginConGoogle(); // redirige a Google; la vuelta la maneja AuthContext solo
    } catch (err) {
      setError(err.message);
      setCargandoGoogle(false);
    }
  }

  return (
    <div className="login-page">
      <motion.div
        className={`login-visual ${!revelado ? 'login-visual--completo' : ''}`}
        aria-hidden={revelado ? 'true' : undefined}
        role={revelado ? undefined : 'button'}
        tabIndex={revelado ? undefined : 0}
        aria-label={revelado ? undefined : 'Continuar a iniciar sesión'}
        onClick={revelado ? undefined : revelar}
        onKeyDown={revelado ? undefined : revelarConTeclado}
        style={tiltVisual.style}
        onMouseMove={tiltVisual.onMouseMove}
        onMouseLeave={tiltVisual.onMouseLeave}
      >
        <div className="login-visual__contenido">
          <motion.div className="login-visual__marca" {...entradaConStagger(0, reducido)}>
            <Logo size={52} suave />
            <span>OLO</span>
          </motion.div>

          <motion.h2 className="login-visual__titulo" {...entradaConStagger(1, reducido)}>
            Tu mezanine, ordenado y trazable en tiempo real.
          </motion.h2>
          <motion.p className="login-visual__subtitulo" {...entradaConStagger(2, reducido)}>
            Slotting, migración guiada y auditoría en un solo lugar.
          </motion.p>

          <div className="login-visual__grid">
            {MOSAICO.map((estado, i) => {
              const fila = Math.floor(i / COLUMNAS_MOSAICO);
              const columna = i % COLUMNAS_MOSAICO;
              const indice = INDICE_GRILLA_INICIO + fila + columna;
              return <CeldaMosaico key={i} estado={estado} indice={indice} reducido={reducido} />;
            })}
          </div>

          <ul className="login-visual__features">
            <motion.li {...entradaConStagger(INDICE_FEATURES_INICIO, reducido)}><i className="ti ti-map-2" /> Mapa en vivo del mezanine</motion.li>
            <motion.li {...entradaConStagger(INDICE_FEATURES_INICIO + 1, reducido)}><i className="ti ti-route" /> Migración guiada RCL → MZ</motion.li>
            <motion.li {...entradaConStagger(INDICE_FEATURES_INICIO + 2, reducido)}><i className="ti ti-shield-check" /> Auditoría y trazabilidad completa</motion.li>
          </ul>

          <motion.p className="login-visual__frase" {...entradaImpacto(reducido, DEMORA_FRASE)}>
            <span className="login-visual__frase-brillo" style={reducido ? undefined : { animationDelay: `${DEMORA_FRASE}s` }}>
              Tu almacén, coreografiado al milímetro.
            </span>
          </motion.p>
        </div>

        <div className="login-visual__cinta">
          <motion.i className="ti ti-package" {...(reducido ? ANIM_ESTATICO : ANIM_CAJA_ABRIR)} />
          <motion.i className="ti ti-box" {...(reducido ? ANIM_ESTATICO : ANIM_CUBO_VUELTA)} />
          <motion.i className="ti ti-truck-delivery" {...(reducido ? ANIM_ESTATICO : ANIM_CAMION_MANEJAR)} />
        </div>

        {!revelado && (
          <div className="login-visual__hint">
            <i className="ti ti-hand-click" />
            <span>Tocá para continuar</span>
          </div>
        )}
      </motion.div>

      {revelado && (
      <div className="login-panel">
        <motion.form
          className="login-card"
          onSubmit={handleSubmit}
          {...entradaProtagonista(reducido)}
          style={tiltCard.style}
          onMouseMove={tiltCard.onMouseMove}
          onMouseLeave={tiltCard.onMouseLeave}
        >
          <div className="login-card__brand">
            <Logo size={30} />
            <div>
              <h1>WMS · Slotting Mezanine</h1>
              <span className="login-card__eyebrow">Iniciá sesión para continuar</span>
            </div>
          </div>

          <label>Email
            <div className="login-card__campo">
              <i className="ti ti-mail" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
            </div>
          </label>
          <label>Contraseña
            <div className="login-card__campo">
              <i className="ti ti-lock" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
          </label>
          {error && <div className="login-card__error"><i className="ti ti-alert-circle" /> {error}</div>}
          <button type="submit" className="btn-primary" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>

          <div className="login-card__divisor">
            <div />
            o
            <div />
          </div>

          <button type="button" className="btn-secondary" onClick={handleGoogle} disabled={cargandoGoogle}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg>
            {cargandoGoogle ? 'Redirigiendo…' : 'Continuar con Google'}
          </button>
        </motion.form>
      </div>
      )}
    </div>
  );
}
