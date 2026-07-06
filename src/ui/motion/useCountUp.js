import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { DURACION } from './tokens.js';
import { useReducedMotion } from './prefersReducedMotion.js';

/**
 * Anima un número desde su valor anterior hasta `valorObjetivo` en ~600ms
 * (DURACION.countUp). Con prefers-reduced-motion, salta directo al valor
 * final -- nunca deja un número "congelado" a mitad de camino.
 */
export function useCountUp(valorObjetivo) {
  const reducido = useReducedMotion();
  const [valor, setValor] = useState(valorObjetivo);
  const anterior = useRef(valorObjetivo);

  useEffect(() => {
    if (reducido || !Number.isFinite(valorObjetivo)) {
      setValor(valorObjetivo);
      anterior.current = valorObjetivo;
      return;
    }
    const controles = animate(anterior.current, valorObjetivo, {
      duration: DURACION.countUp,
      ease: 'easeOut',
      onUpdate: setValor,
    });
    anterior.current = valorObjetivo;
    return () => controles.stop();
  }, [valorObjetivo, reducido]);

  return valor;
}
