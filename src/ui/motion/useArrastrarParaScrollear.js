import { useEffect } from 'react';

const UMBRAL_ARRASTRE_PX = 6; // por debajo de esto, se trata como un click normal -- no como un arrastre

/**
 * "Grab scroll" -- click y arrastre en cualquier parte de una lista para
 * moverla hacia arriba/abajo, en vez de depender solo de acertarle a la
 * scrollbar fina. Pedido explícito del usuario para el Sidebar.
 *
 * Distingue arrastre de click real: si el mouse se movió más de
 * UMBRAL_ARRASTRE_PX antes de soltar, el próximo click se "traga" (no
 * dispara el botón que quedó debajo del cursor) -- si no, es un click
 * normal y se deja pasar. `mousemove`/`mouseup` van en `window` (no en el
 * contenedor) para que el arrastre siga funcionando aunque el mouse salga
 * del sidebar angosto durante el gesto.
 */
export function useArrastrarParaScrollear(contenedorRef) {
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    let arrastrando = false;
    let inicioY = 0;
    let scrollInicial = 0;
    let distanciaMaxima = 0;

    function tragarProximoClick(el) {
      const swallow = e => {
        e.stopPropagation();
        e.preventDefault();
        el.removeEventListener('click', swallow, true);
      };
      el.addEventListener('click', swallow, true);
    }

    function onMouseDown(e) {
      if (e.button !== 0) return; // solo click izquierdo
      arrastrando = true;
      distanciaMaxima = 0;
      inicioY = e.clientY;
      scrollInicial = contenedor.scrollTop;
    }

    function onMouseMove(e) {
      if (!arrastrando) return;
      const delta = e.clientY - inicioY;
      distanciaMaxima = Math.max(distanciaMaxima, Math.abs(delta));
      contenedor.scrollTop = scrollInicial - delta;
    }

    function onMouseUp() {
      if (!arrastrando) return;
      arrastrando = false;
      if (distanciaMaxima > UMBRAL_ARRASTRE_PX) tragarProximoClick(contenedor);
    }

    contenedor.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      contenedor.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [contenedorRef]);
}
