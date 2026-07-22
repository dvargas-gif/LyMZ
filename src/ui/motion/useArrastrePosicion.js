import { useEffect, useRef, useState } from 'react';

const UMBRAL_ARRASTRE_PX = 6; // por debajo de esto, se trata como un click normal -- no como un arrastre (mismo criterio que useArrastrarParaScrollear.js)
const MARGEN_PANTALLA_PX = 8;

function posicionInicial(clave, defecto) {
  try {
    const guardada = localStorage.getItem(clave);
    if (guardada) return JSON.parse(guardada);
  } catch { /* localStorage bloqueado o valor corrupto -- se usa el default */ }
  return defecto;
}

/**
 * Arrastre libre en x/y para un elemento `position:fixed` (la burbuja de
 * mensajes) -- mismo patrón que useArrastrarParaScrollear.js (mousedown en
 * el elemento, mousemove/mouseup en `window` para que el gesto siga
 * funcionando aunque el cursor salga del botón, y un umbral de distancia
 * para distinguir un click real de un arrastre antes de "tragarse" el
 * próximo click), pero moviendo `top`/`left` en vez de `scrollTop`.
 *
 * Posición persistida en localStorage -- la burbuja queda donde el usuario
 * la dejó, entre recargas.
 */
export function useArrastrePosicion(refElemento, claveStorage, defecto) {
  const [posicion, setPosicion] = useState(() => posicionInicial(claveStorage, defecto));
  const [arrastrando, setArrastrando] = useState(false);
  // Ref sincronizada con `posicion` en cada render (no en un efecto) -- así
  // mousedown/mouseup leen el valor más reciente sin que el efecto de abajo
  // tenga que depender de `posicion` y re-atarse en cada pixel de arrastre.
  const posicionRef = useRef(posicion);
  posicionRef.current = posicion;
  const estadoRef = useRef({ activo: false, inicioX: 0, inicioY: 0, posInicial: defecto, distanciaMaxima: 0 });

  useEffect(() => {
    const el = refElemento.current;
    if (!el) return;

    function tragarProximoClick(elemento) {
      const swallow = e => { e.stopPropagation(); e.preventDefault(); elemento.removeEventListener('click', swallow, true); };
      elemento.addEventListener('click', swallow, true);
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      estadoRef.current = { activo: true, inicioX: e.clientX, inicioY: e.clientY, posInicial: posicionRef.current, distanciaMaxima: 0 };
      setArrastrando(true);
    }

    function onMouseMove(e) {
      const est = estadoRef.current;
      if (!est.activo) return;
      const dx = e.clientX - est.inicioX;
      const dy = e.clientY - est.inicioY;
      est.distanciaMaxima = Math.max(est.distanciaMaxima, Math.hypot(dx, dy));

      const anchoVentana = window.innerWidth, altoVentana = window.innerHeight;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(est.posInicial.x + dx, MARGEN_PANTALLA_PX), anchoVentana - rect.width - MARGEN_PANTALLA_PX);
      const y = Math.min(Math.max(est.posInicial.y + dy, MARGEN_PANTALLA_PX), altoVentana - rect.height - MARGEN_PANTALLA_PX);
      setPosicion({ x, y });
    }

    function onMouseUp() {
      const est = estadoRef.current;
      if (!est.activo) return;
      est.activo = false;
      setArrastrando(false);
      if (est.distanciaMaxima > UMBRAL_ARRASTRE_PX) {
        tragarProximoClick(el);
        try { localStorage.setItem(claveStorage, JSON.stringify(posicionRef.current)); } catch { /* localStorage bloqueado -- no persiste, no rompe */ }
      }
    }

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [refElemento, claveStorage]);

  return { posicion, arrastrando };
}
