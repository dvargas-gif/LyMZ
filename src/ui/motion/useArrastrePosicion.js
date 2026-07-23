import { useEffect, useRef, useState } from 'react';

const UMBRAL_ARRASTRE_PX = 6; // por debajo de esto, se trata como un click normal -- no como un arrastre (mismo criterio que useArrastrarParaScrollear.js)
const MARGEN_PANTALLA_PX = 8;
// Debe coincidir con el tamaño real del elemento arrastrable (.burbuja-mensajes
// en index.css: width/height 52px) -- se usa para poder acotar la posición
// ANTES de que el elemento exista en el DOM (no hay getBoundingClientRect
// todavía en el primer render), tanto al restaurar de localStorage como al defecto.
const TAMANO_ELEMENTO_PX = 52;

function acotar(pos) {
  return {
    x: Math.min(Math.max(pos.x, MARGEN_PANTALLA_PX), window.innerWidth - TAMANO_ELEMENTO_PX - MARGEN_PANTALLA_PX),
    y: Math.min(Math.max(pos.y, MARGEN_PANTALLA_PX), window.innerHeight - TAMANO_ELEMENTO_PX - MARGEN_PANTALLA_PX),
  };
}

/**
 * Bug real reportado 2026-07-23 ("no se ve" la burbuja): la posición
 * guardada en localStorage se restauraba tal cual, sin comprobar que
 * siguiera entrando en la ventana ACTUAL -- si se había arrastrado con una
 * ventana más grande (u otro monitor) y después se abre con una más chica,
 * la burbuja queda fuera de la vista, invisible pero técnicamente montada.
 * El clamp de abajo (acotar()) antes solo corría DURANTE el arrastre --
 * ahora también corre acá, al restaurar/al usar el default.
 */
function posicionInicial(clave, defecto) {
  try {
    const guardada = localStorage.getItem(clave);
    if (guardada) return acotar(JSON.parse(guardada));
  } catch { /* localStorage bloqueado o valor corrupto -- se usa el default */ }
  return acotar(defecto);
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
