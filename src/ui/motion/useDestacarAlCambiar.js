import { useEffect, useRef, useState } from 'react';

const DURACION_MS = 400; // 300-400ms, transición de color -- ver estándar de animaciones

/**
 * Devuelve `true` durante ~400ms cada vez que `valor` cambia -- para
 * disparar la transición de color + pulso de escala que pide el estándar
 * ("cambios Realtime con transición de color 300-400ms + pulso único de
 * escala"). No dispara en el primer render (valor inicial), solo en cambios
 * reales posteriores -- evita el "flash" de highlight al montar el componente.
 */
export function useDestacarAlCambiar(valor) {
  const anterior = useRef(valor);
  const [destacado, setDestacado] = useState(false);

  useEffect(() => {
    if (anterior.current === valor) return;
    anterior.current = valor;
    setDestacado(true);
    const t = setTimeout(() => setDestacado(false), DURACION_MS);
    return () => clearTimeout(t);
  }, [valor]);

  return destacado;
}
