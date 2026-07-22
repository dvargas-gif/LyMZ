import { useRef, useState } from 'react';
import { useArrastrePosicion } from '../../ui/motion/useArrastrePosicion.js';
import PanelFlotanteMensajes from '../../features/mensajes/PanelFlotanteMensajes.jsx';

const CLAVE_POSICION = 'wms-burbuja-mensajes-posicion';

/**
 * Burbuja flotante de mensajería (2026-07-22) -- pedido explícito del
 * usuario: "que se pueda mover en el set a conveniencia", no una pestaña
 * de navegación ni un modal que bloquee el resto de la app. Se monta UNA
 * sola vez en Shell (App.jsx), visible en cualquier pantalla.
 */
export default function BurbujaMensajes({ sesion, conectados }) {
  const botonRef = useRef(null);
  const defecto = { x: window.innerWidth - 76, y: window.innerHeight - 76 };
  const { posicion, arrastrando } = useArrastrePosicion(botonRef, CLAVE_POSICION, defecto);
  const [abierto, setAbierto] = useState(false);
  const [noLeidos, setNoLeidos] = useState(0);

  return (
    <>
      <button
        ref={botonRef}
        className={`burbuja-mensajes ${arrastrando ? 'burbuja-mensajes--arrastrando' : ''}`}
        style={{ left: posicion.x, top: posicion.y }}
        onClick={() => setAbierto(v => !v)}
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
          onCerrar={() => setAbierto(false)}
          onCambioNoLeidos={setNoLeidos}
        />
      )}
    </>
  );
}
