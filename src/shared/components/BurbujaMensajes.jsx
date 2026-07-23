import { useEffect, useRef, useState } from 'react';
import { useArrastrePosicion } from '../../ui/motion/useArrastrePosicion.js';
import PanelFlotanteMensajes from '../../features/mensajes/PanelFlotanteMensajes.jsx';
import { mensajesService } from '../services/mensajes.service.js';

const CLAVE_POSICION = 'wms-burbuja-mensajes-posicion';
const DURACION_AVISO_MS = 4000;
// Capturado UNA vez al cargar el módulo, antes de que este componente toque
// document.title -- así el "(N)" siempre se arma sobre el título real de la
// página, sin hardcodear el texto de index.html acá.
const TITULO_BASE = document.title;

/**
 * Burbuja flotante de mensajería (2026-07-22) -- pedido explícito del
 * usuario: "que se pueda mover en el set a conveniencia", no una pestaña
 * de navegación ni un modal que bloquee el resto de la app. Se monta UNA
 * sola vez en Shell (App.jsx), visible en cualquier pantalla.
 *
 * El resumen de no leídos y la suscripción en vivo viven ACÁ (no dentro de
 * PanelFlotanteMensajes) -- pedido explícito 2026-07-22: "que salga una
 * notificación por chat no recibido" -- antes de este cambio, esa
 * suscripción solo existía mientras el panel estaba montado (abierto), así
 * que un mensaje nuevo con la burbuja cerrada no se enteraba de nada hasta
 * que el usuario la abría. Ahora corre siempre que la burbuja está viva, o
 * sea toda la sesión.
 */
export default function BurbujaMensajes({ sesion, conectados }) {
  const botonRef = useRef(null);
  const defecto = { x: window.innerWidth - 76, y: window.innerHeight - 76 };
  const { posicion, arrastrando } = useArrastrePosicion(botonRef, CLAVE_POSICION, defecto);
  const [abierto, setAbierto] = useState(false);
  const [resumen, setResumen] = useState(new Map());
  const [ultimoEntrante, setUltimoEntrante] = useState(null);
  const [avisoNuevo, setAvisoNuevo] = useState(false);
  const abiertoRef = useRef(abierto);
  abiertoRef.current = abierto;

  const noLeidos = [...resumen.values()].reduce((acc, c) => acc + c.noLeidos, 0);

  async function refrescarResumen() {
    const r = await mensajesService.listarResumenConversaciones(sesion.usuarioId);
    setResumen(r);
    return r;
  }

  useEffect(() => { refrescarResumen(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sesion.usuarioId]);

  // Aviso en el título de la pestaña -- pedido explícito de QA 2026-07-23:
  // "no llega una notificación numérica fuera de la burbuja" -- el badge
  // pegado al botón no se ve si la pestaña está de fondo o minimizada; el
  // título sí (mismo patrón que Gmail/Slack: "(3) WMS · ...").
  useEffect(() => {
    document.title = noLeidos > 0 ? `(${noLeidos}) ${TITULO_BASE}` : TITULO_BASE;
    return () => { document.title = TITULO_BASE; };
  }, [noLeidos]);

  useEffect(() => {
    return mensajesService.suscribirMensajesEntrantes(sesion.usuarioId, async nuevo => {
      await refrescarResumen();
      setUltimoEntrante(nuevo);
      if (!abiertoRef.current) {
        setAvisoNuevo(true);
        setTimeout(() => setAvisoNuevo(false), DURACION_AVISO_MS);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.usuarioId]);

  function alternar() {
    setAbierto(v => !v);
    setAvisoNuevo(false);
  }

  return (
    <>
      <button
        ref={botonRef}
        className={`burbuja-mensajes ${arrastrando ? 'burbuja-mensajes--arrastrando' : ''} ${avisoNuevo ? 'burbuja-mensajes--aviso' : ''}`}
        style={{ left: posicion.x, top: posicion.y }}
        onClick={alternar}
        title="Mensajes"
      >
        <i className={`ti ${abierto ? 'ti-x' : 'ti-message-circle'}`} />
        {!abierto && noLeidos > 0 && <span className="burbuja-mensajes__badge">{noLeidos}</span>}
      </button>

      {abierto && (
        <PanelFlotanteMensajes
          sesion={sesion}
          conectados={conectados}
          posicion={posicion}
          resumen={resumen}
          ultimoEntrante={ultimoEntrante}
          onCerrar={() => setAbierto(false)}
          onRefrescarResumen={refrescarResumen}
        />
      )}
    </>
  );
}
