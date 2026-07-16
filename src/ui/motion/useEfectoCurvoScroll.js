import { useEffect } from 'react';

const ANGULO_MAXIMO_GRADOS = 16; // sutil -- el pedido fue "curva", no un carrusel exagerado
const ESCALA_MINIMA = 0.93;
const OPACIDAD_MINIMA = 0.6;

/**
 * Efecto "rueda de combinación" en una lista que scrollea -- cada ítem se
 * inclina en 3D, se achica un poco y se atenúa según qué tan lejos está
 * del CENTRO del contenedor visible, como si estuviera sobre un cilindro
 * (el centro queda plano/nítido, los extremos se curvan). Pedido explícito
 * del usuario para el Sidebar.
 *
 * Sin Framer Motion/GSAP a propósito: el Sidebar es parte del shell
 * siempre montado (ver el comentario sobre bundle size en Sidebar.jsx),
 * así que esto es un scroll listener + rAF + transform de CSS plano, cero
 * peso nuevo en el bundle. Respeta prefers-reduced-motion -- se desactiva
 * del todo para quien lo pidió, nunca fuerza el efecto.
 *
 * @param {import('react').RefObject<HTMLElement>} contenedorRef -- el elemento que scrollea
 * @param {string} itemsSelector -- selector CSS de los ítems a curvar, relativo al contenedor
 * @param {*} [disparador] -- valor que, al cambiar, vuelve a aplicar la curvatura ya mismo (ej. el estado expandido/colapsado del Sidebar, o qué secciones están abiertas) -- sin esto, un cambio de contenido que NO dispare scroll/resize (expandir el menú, abrir una sección) deja los ítems nuevos sin curvar hasta que alguien scrollee o resize a mano.
 */
export function useEfectoCurvoScroll(contenedorRef, itemsSelector, disparador) {
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let rafId = null;

    function aplicarCurvatura() {
      rafId = null;
      const items = contenedor.querySelectorAll(itemsSelector);

      // Si el contenido entra sin necesitar scroll (el caso normal en
      // pantallas altas), no hay "rueda" que recorrer -- todo queda
      // completamente plano. Antes esto se calculaba contra la altura del
      // contenedor entero (position:fixed, 100vh), que casi siempre es
      // mucho más alto que la lista real de ítems -- el centro geométrico
      // caía lejos de donde de verdad está el contenido, y la curva salía
      // pareja/exagerada en vez de nítida (el reporte de "traslucidez
      // rara" y el activo en turquesa "a medias").
      if (contenedor.scrollHeight <= contenedor.clientHeight + 1) {
        items.forEach(item => { item.style.transform = ''; item.style.opacity = ''; });
        return;
      }

      const rectContenedor = contenedor.getBoundingClientRect();
      const centroY = rectContenedor.top + rectContenedor.height / 2;
      const mitadAlto = rectContenedor.height / 2 || 1;

      items.forEach(item => {
        const rectItem = item.getBoundingClientRect();
        const centroItem = rectItem.top + rectItem.height / 2;
        const distancia = Math.max(-1, Math.min(1, (centroItem - centroY) / mitadAlto));
        const angulo = distancia * ANGULO_MAXIMO_GRADOS;
        const escala = 1 - Math.abs(distancia) * (1 - ESCALA_MINIMA);
        const opacidad = 1 - Math.abs(distancia) * (1 - OPACIDAD_MINIMA);
        item.style.transform = `perspective(700px) rotateX(${angulo}deg) scale(${escala})`;
        item.style.opacity = String(opacidad);
      });
    }

    function solicitarActualizacion() {
      if (rafId != null) return;
      rafId = requestAnimationFrame(aplicarCurvatura);
    }

    solicitarActualizacion();
    contenedor.addEventListener('scroll', solicitarActualizacion, { passive: true });
    window.addEventListener('resize', solicitarActualizacion);

    return () => {
      contenedor.removeEventListener('scroll', solicitarActualizacion);
      window.removeEventListener('resize', solicitarActualizacion);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [contenedorRef, itemsSelector, disparador]);
}
