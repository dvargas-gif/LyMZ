import { useEffect, useState } from 'react';

function saludoPorHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Saludo elegante y breve al entrar — se cierra solo a los pocos segundos. */
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
      <span className="saludo-toast__icono">✨</span>
      <div className="saludo-toast__texto">
        <strong>{saludoPorHora()}, {apodo}</strong>
        <span>Qué bueno tenerte de vuelta en el WMS.</span>
      </div>
      <button className="saludo-toast__cerrar" onClick={cerrarYa} title="Cerrar">
        <i className="ti ti-x" style={{ fontSize: 13 }} />
      </button>
    </div>
  );
}
