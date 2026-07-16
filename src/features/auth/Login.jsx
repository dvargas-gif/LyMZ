import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authService } from './auth.service.js';
import { useAuth } from './AuthContext.jsx';
import Logo from '../../shared/components/Logo.jsx';
import { useReducedMotion } from '../../ui/motion/prefersReducedMotion.js';
import { entradaConStagger, entradaProtagonista, apareceFlotante } from '../../ui/motion/variants.js';
import EscenaAlmacen, { ANCLAS_HUD, ESCENA_ANCHO, ESCENA_ALTO } from './loginEscenaAlmacen.jsx';
import { DURACION } from '../../ui/motion/tokens.js';

// % dentro de .login-escena -- misma matemática para los paneles HUD (acá)
// y las líneas conectoras (dibujadas DENTRO de EscenaAlmacen, mismo
// viewBox) -- un punto en (x,y) siempre cae en el mismo lugar visual en
// cualquier tamaño de pantalla porque .login-escena tiene un
// aspect-ratio fijo igual al viewBox (ver index.css), nunca hay letterbox.
function pct({ x, y }) {
  return { left: `${(x / ESCENA_ANCHO) * 100}%`, top: `${(y / ESCENA_ALTO) * 100}%` };
}

// Los 3 paneles HUD -- reemplazan a las tarjetas de hoy (pedido explícito
// del usuario, su propia sugerencia: "sin tarjetas, paneles chicos
// flotantes"). Ícono + una sola línea de etiqueta; el `id` calza con
// ANCLAS_HUD (mismo id) y con el `resaltado` que dispara el zoom+glow en
// EscenaAlmacen. `lado`/`alinear` orientan la leyenda que se abre al
// click (ver login-hud__leyenda en index.css) para que nunca se salga
// del panel -- los 3 paneles viven pegados a una esquina de la escena.
const PUNTOS_HUD = [
  { id: 'slotting', icono: 'ti-layout-grid', etiqueta: 'Slotting inteligente', lado: 'abajo', alinear: 'izquierda' },
  { id: 'trazabilidad', icono: 'ti-route', etiqueta: 'Trazabilidad en tiempo real', lado: 'abajo', alinear: 'derecha' },
  { id: 'inventario', icono: 'ti-chart-bar', etiqueta: 'Gestión de inventario', lado: 'arriba', alinear: 'derecha' },
];

// Leyenda que se despliega al hacer click en un panel HUD (pedido
// explícito: "que me despliegue una leyenda de en qué ayuda la
// aplicación") -- mismo texto descriptivo que tenían las tarjetas de la
// iteración anterior, ahora bajo demanda en vez de siempre visible.
const DESCRIPCIONES_HUD = {
  slotting: 'Optimiza la ubicación de tus productos según demanda, rotación y restricciones -- cada posición se aprovecha al máximo.',
  trazabilidad: 'Monitorea cada movimiento y evento de tu inventario con total visibilidad, en tiempo real.',
  inventario: 'Controla tu inventario con precisión y tomá decisiones basadas en datos, no en suposiciones.',
};

// 5 eventos flotantes tipo "toast" repartidos sobre la escena (coordenadas
// del mismo viewBox 400x260) -- posiciones fijas, lejos de los 3 anclajes
// HUD para no superponerse. apareceFlotante() ya escalona la fase por
// índice (ver más abajo) para que nunca se vean los 5 a la vez.
const BADGES_EVENTO = [
  { titulo: 'Producto recibido', detalle: '32 unidades', x: 58, y: 232 },
  { titulo: 'Ubicación óptima', detalle: 'A-12-04', x: 140, y: 58 },
  { titulo: 'Picking completado', detalle: 'Orden #8452', x: 210, y: 178 },
  { titulo: 'Movimiento registrado', detalle: 'Hace 2 min', x: 108, y: 40 },
  { titulo: 'Inventario sincronizado', detalle: 'Hace 1 min', x: 300, y: 158 },
];

const FRANJA_CONFIANZA = [
  { icono: 'ti-shield-check', titulo: 'Seguro', desc: 'Tus datos protegidos con los más altos estándares.' },
  { icono: 'ti-clock', titulo: 'En tiempo real', desc: 'Información actualizada al instante.' },
  { icono: 'ti-circle-check', titulo: 'Confiable', desc: 'Operación continua y sin interrupciones.' },
];

// Índices de la cascada de entrada -- marca, título, subtítulo, la escena
// completa, y la franja de confianza al final. STAGGER_MS (ver tokens.js)
// hace el resto -- ningún delay escrito a mano acá.
const INDICE_ESCENA = 3;
const INDICE_CONFIANZA = INDICE_ESCENA + 1;
// Los 5 badges de evento se reparten en fase a lo largo de un ciclo
// completo (duración + pausa de apareceFlotante) -- así nunca coinciden
// más de uno o dos a la vez sobre la escena.
const CICLO_BADGE = DURACION.trazadoRuta + DURACION.pausaOnda;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  // Antes de revelar: el panel turquesa ocupa toda la pantalla (para que se
  // vea la animación completa, pedido explícito) y el formulario ni se
  // monta. Un click/tap o Enter/Espacio en cualquier parte del panel lo
  // revela -- de ahí en más se comporta exactamente como antes (retracción
  // al enfocar un campo, etc.).
  const [revelado, setRevelado] = useState(false);
  // Qué zona de la escena está "activa" (mouse/foco sobre su panel HUD) --
  // cruza de un elemento HTML (el panel) a uno SVG distinto (el rack/ruta/
  // dashboard correspondiente dentro de EscenaAlmacen), por eso necesita
  // estado de React y no alcanza con :hover puro en CSS.
  const [hoverActivo, setHoverActivo] = useState(null);
  // Qué leyenda quedó abierta por click -- independiente del hover: una
  // vez clickeada, el resaltado de la escena queda "trabado" en esa zona
  // aunque el mouse se mueva a otro lado, hasta que se cierre.
  const [legendaAbierta, setLegendaAbierta] = useState(null);
  const resaltado = legendaAbierta ?? hoverActivo;

  function manejarClickHud(id, e) {
    // Antes de revelar, un click en CUALQUIER parte del panel (incluido un
    // ícono HUD) tiene que revelar el formulario con un solo toque -- si
    // acá abajo hiciéramos stopPropagation, ese primer click se lo "tragaba"
    // la leyenda y nunca llegaba a disparar el revelado (bug real: "debo
    // tocar dos veces"). Sin `return` temprano, se deja burbujear normal
    // hacia el onClick de .login-visual.
    if (!revelado) return;
    e.stopPropagation();
    setLegendaAbierta(actual => (actual === id ? null : id));
  }
  const { login } = useAuth();
  const navigate = useNavigate();
  const reducido = useReducedMotion();

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
      >
        {/* Fondo decorativo: foco esmeralda + franjas de luz + partículas --
            nunca fotografía, todo CSS/SVG. Los relieves de hexágonos/líneas
            diagonales se sacaron (no le gustaron al usuario) -- fondo
            esmeralda más limpio. pointer-events:none para que nunca compita
            con el click de revelar/hover de los paneles HUD. */}
        <div className="login-fondo-foco" aria-hidden="true" />
        <div className="login-fondo-linea login-fondo-linea--1" aria-hidden="true" />
        <div className="login-fondo-linea login-fondo-linea--2" aria-hidden="true" />

        <div className="login-visual__contenido">
          <motion.div className="login-visual__marca" {...entradaConStagger(0, reducido)}>
            <Logo size={52} suave />
            <span className="login-visual__marca-nombre">
              <span className="login-visual__marca-inicial">O</span>verseas{' '}
              <span className="login-visual__marca-inicial">L</span>ogistics{' '}
              <span className="login-visual__marca-inicial">O</span>perations
            </span>
          </motion.div>

          <motion.h2 className="login-visual__titulo" {...entradaConStagger(1, reducido)}>
            Control total.<br />
            <span className="login-visual__titulo-acento">Trazabilidad en cada movimiento.</span>
          </motion.h2>
          <motion.p className="login-visual__subtitulo" {...entradaConStagger(2, reducido)}>
            Plataforma integral de slotting, trazabilidad y gestión de inventario en tiempo real.
          </motion.p>

          <motion.div
            className="login-escena"
            onClick={() => setLegendaAbierta(null)}
            {...entradaConStagger(INDICE_ESCENA, reducido)}
          >
          <div className="login-escena__caja">
            <EscenaAlmacen reducido={reducido} resaltado={resaltado} pausar={!!legendaAbierta} />

            {PUNTOS_HUD.map(p => (
              <div key={p.id} className="login-hud-envoltorio" style={pct(ANCLAS_HUD[p.id].hud)}>
                {p.id === 'inventario' ? (
                  <button
                    type="button"
                    className={`login-dashboard ${resaltado === p.id ? 'login-dashboard--activo' : ''}`}
                    onMouseEnter={() => setHoverActivo(p.id)}
                    onMouseLeave={() => setHoverActivo(null)}
                    onFocus={() => setHoverActivo(p.id)}
                    onBlur={() => setHoverActivo(null)}
                    onClick={e => manejarClickHud(p.id, e)}
                    aria-expanded={legendaAbierta === p.id}
                  >
                    <span className="login-dashboard__titulo">Inventario en tiempo real</span>
                    <div className="login-dashboard__cuerpo">
                      <div className="login-dashboard__dona">
                        <svg viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="4" />
                          <circle cx="18" cy="18" r="15" fill="none" stroke="#4FE0D1" strokeWidth="4" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="1.3" transform="rotate(-90 18 18)" />
                        </svg>
                        <span>98.6%</span>
                      </div>
                      <ul className="login-dashboard__stats">
                        <li><span>SKUs</span><strong>1.248</strong></li>
                        <li><span>Unidades</span><strong>45.982</strong></li>
                        <li><span>Órdenes activas</span><strong>26</strong></li>
                      </ul>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`login-hud ${resaltado === p.id ? 'login-hud--activo' : ''}`}
                    onMouseEnter={() => setHoverActivo(p.id)}
                    onMouseLeave={() => setHoverActivo(null)}
                    onFocus={() => setHoverActivo(p.id)}
                    onBlur={() => setHoverActivo(null)}
                    onClick={e => manejarClickHud(p.id, e)}
                    aria-expanded={legendaAbierta === p.id}
                  >
                    <i className={`ti ${p.icono}`} />
                    <span>{p.etiqueta}</span>
                  </button>
                )}

                {legendaAbierta === p.id && (
                  <motion.div
                    className={`login-hud__leyenda login-hud__leyenda--${p.lado} login-hud__leyenda--${p.alinear}`}
                    onClick={e => e.stopPropagation()}
                    initial={{ opacity: 0, scale: .92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: DURACION.micro }}
                  >
                    <button type="button" className="login-hud__leyenda-cerrar" onClick={() => setLegendaAbierta(null)} aria-label="Cerrar">
                      <i className="ti ti-x" />
                    </button>
                    <strong>{p.etiqueta}</strong>
                    <p>{DESCRIPCIONES_HUD[p.id]}</p>
                  </motion.div>
                )}
              </div>
            ))}

            {!reducido && !legendaAbierta && BADGES_EVENTO.map((b, i) => (
              <motion.div
                key={b.titulo}
                className="login-badge-evento"
                style={pct(b)}
                {...apareceFlotante(reducido, (i * CICLO_BADGE) / BADGES_EVENTO.length)}
              >
                <div className="login-badge-evento__icono"><i className="ti ti-box" /></div>
                <div className="login-badge-evento__texto">
                  <strong>{b.titulo} <i className="ti ti-circle-check" /></strong>
                  <span>{b.detalle}</span>
                </div>
              </motion.div>
            ))}
          </div>
          </motion.div>

          <motion.ul className="login-confianza" {...entradaConStagger(INDICE_CONFIANZA, reducido)}>
            {FRANJA_CONFIANZA.map(f => (
              <li key={f.titulo}>
                <i className={`ti ${f.icono}`} />
                <div><strong>{f.titulo}</strong><span>{f.desc}</span></div>
              </li>
            ))}
          </motion.ul>

          {!revelado && (
            <div className="login-visual__hint">
              <i className="ti ti-hand-click" />
              <span>Tocá para continuar</span>
            </div>
          )}
        </div>
      </motion.div>

      {revelado && (
      <div className="login-panel">
        <motion.form
          className="login-card"
          onSubmit={handleSubmit}
          {...entradaProtagonista(reducido)}
        >
          <div className="login-card__brand">
            <Logo size={30} />
            <div>
              <h1>WMS · Plataforma Logística</h1>
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
            <div className="login-card__campo login-card__campo--con-toggle">
              <i className="ti ti-lock" />
              <input type={mostrarPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required />
              <button
                type="button"
                className="login-card__toggle-password"
                onClick={() => setMostrarPassword(v => !v)}
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <i className={`ti ${mostrarPassword ? 'ti-eye-off' : 'ti-eye'}`} />
              </button>
            </div>
          </label>

          {/* "Recordarme" / "¿Olvidaste tu contraseña?" -- solo visuales por
              ahora (decisión tomada con el usuario): sin lógica de sesión
              persistente ni reset por email todavía. */}
          <div className="login-card__fila-opciones">
            <label className="login-card__recordarme">
              <input type="checkbox" defaultChecked />
              Recordarme
            </label>
            <a href="#" onClick={e => e.preventDefault()}>¿Olvidaste tu contraseña?</a>
          </div>

          {error && <div className="login-card__error"><i className="ti ti-alert-circle" /> {error}</div>}
          <button type="submit" className="btn-primary" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Ingresar'} {!cargando && <i className="ti ti-arrow-right" />}
          </button>

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

          <p className="login-card__seguridad"><i className="ti ti-lock" /> Conexión segura y encriptada</p>
        </motion.form>
      </div>
      )}
    </div>
  );
}
