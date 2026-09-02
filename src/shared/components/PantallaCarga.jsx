import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import { CuboIso } from '../../features/auth/loginIlustraciones.jsx';
import { PALETA_CUBO_OPTIMO } from '../../features/auth/loginPaletas.js';
import { useReducedMotion } from '../../ui/motion/prefersReducedMotion.js';
import { DURACION, EASING } from '../../ui/motion/tokens.js';

const DUR_TOTAL_S = DURACION.arranque * 2;

/**
 * Splash de arranque (2026-07-27, ajustado tras feedback: más fluido y más
 * corto). El logo OLO gira y se va encogiendo hasta volverse una gotita
 * (mismo punto donde "aterriza" el cajón isométrico que crece a
 * continuación, mismo isotipo que ya usa loginEscenaAlmacen.jsx) -- las
 * animaciones de logo y cajón terminan/empiezan en el mismo tamaño chico y
 * la misma zona, para que se sienta como una sola transformación continua
 * en vez de "gira y después sale una caja" (reportado en vivo: "no se ve
 * lindo", faltaba fluidez). Las dos ideas del pedido original ("el logo" y
 * "el rack dando vueltas") conviven, una detrás de la otra.
 *
 * Se ve cada vez que se abre la página, en el hueco que antes quedaba en
 * blanco mientras se resuelve la sesión de Supabase (ver AuthContext.jsx).
 * Duración fija propia, independiente de cuánto tarde la sesión: se revela
 * recién cuando TERMINAN LAS DOS cosas (sesión resuelta Y animación
 * terminada), nunca antes -- así el intro se ve completo siempre.
 */
export default function PantallaCarga({ listo, onFin }) {
  const reducido = useReducedMotion();
  const [fase, setFase] = useState('logo'); // 'logo' -> 'rack' -> 'listo'

  useEffect(() => {
    if (reducido) { setFase('listo'); return; }
    const t1 = setTimeout(() => setFase('rack'), DURACION.arranque * 1000);
    const t2 = setTimeout(() => setFase('listo'), DUR_TOTAL_S * 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reducido]);

  useEffect(() => {
    if (listo && fase === 'listo') onFin();
  }, [listo, fase, onFin]);

  if (reducido) {
    return (
      <div className="pantalla-carga" role="status" aria-label="Cargando">
        <Logo size={88} suave />
      </div>
    );
  }

  return (
    <div className="pantalla-carga" role="status" aria-label="Cargando">
      <div className="pantalla-carga__figura">
        <AnimatePresence>
          {fase === 'logo' && (
            <motion.div
              key="logo"
              className="pantalla-carga__capa"
              initial={{ opacity: 0, scale: 1, y: 0 }}
              animate={{ opacity: 1, rotate: [0, 300, 480], scale: [1, 1.12, 0.12], y: [0, -3, 8] }}
              exit={{ opacity: 0, scale: 0.04, y: 14, transition: { duration: DURACION.micro } }}
              transition={{ duration: DURACION.arranque, times: [0, 0.5, 1], ease: EASING.cambio }}
            >
              <Logo size={88} suave />
            </motion.div>
          )}
          {fase !== 'logo' && (
            <motion.div
              key="rack"
              className="pantalla-carga__capa"
              initial={{ opacity: 0, scale: 0.04, y: -6, rotate: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotate: 720 }}
              transition={{ duration: DURACION.arranque, ease: EASING.entrada }}
            >
              <svg width="88" height="88" viewBox="-27 -27 54 54" role="img" aria-hidden="true">
                <CuboIso cx={0} cy={0} ancho={19} alto={19} colores={PALETA_CUBO_OPTIMO} />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
