import { useEffect, useState } from 'react';
import { iniciales } from '../utils/iniciales.js';

function saludoPorHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Saludo elegante y breve al entrar — se cierra solo a los pocos segundos.
 * Rediseño 2026-07-22 (mockup del usuario): avatar circular con iniciales
 * (mismo look que el avatar del pie del Sidebar) + pill "En línea" -- ver
 * BurbujaMensajes.jsx/presencia.service.js, esto no la CONSUME de verdad
 * (siempre es cierto: si ves este toast, estás conectado ahora mismo), es
 * el mismo lenguaje visual que el resto de la mensajería/presencia nueva.
 * A diferencia de Login/Sidebar/Rack3D (esos sí son "islas" de marca fijas
 * a propósito), este SÍ sigue el toggle claro/oscuro de la app -- pedido
 * explícito 2026-07-22: "quiero que exista la posibilidad de cambio de
 * tema a uno más claro" en el saludo, igual que ya podía hacerse en el
 * panel de Mensajes (BurbujaMensajes/PanelFlotanteMensajes.jsx, que ya
 * usaba los tokens de tema desde el principio, nunca hex fijo).
 */
export default function SaludoToast({ apodo, onCerrar }) {
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setSaliendo(true), 4500);
    const t2 = setTimeout(onCerrar, 4850);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onCerrar]);

  function cerrarYa() {
    setSaliendo(true);
    setTimeout(onCerrar, 350);
  }

  return (
    <div className={`saludo-toast ${saliendo ? 'saliendo' : ''}`}>
      <span className="saludo-toast__avatar">{iniciales(apodo)}</span>
      <div className="saludo-toast__texto">
        <strong>{saludoPorHora()}, <span className="saludo-toast__nombre">{apodo}</span></strong>
        <span>Qué bueno tenerte de vuelta en el WMS.</span>
        <span className="saludo-toast__en-linea"><i className="ti ti-circle-filled" /> En línea</span>
      </div>
      <button className="saludo-toast__cerrar" onClick={cerrarYa} title="Cerrar">
        <i className="ti ti-x" style={{ fontSize: 13 }} />
      </button>
    </div>
  );
}
