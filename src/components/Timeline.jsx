import { useEffect, useState } from 'react';
import { auditService } from '../audit/audit.service.js';

/** Actividad reciente, estilo timeline de GitHub / Microsoft 365. */
export default function Timeline({ limite = 15 }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const data = await auditService.recientes(limite);
      if (activo) setItems(data);
    }
    cargar();
    const t = setInterval(cargar, 4000); // se auto-actualiza
    return () => { activo = false; clearInterval(t); };
  }, [limite]);

  if (items.length === 0) {
    return <p className="muted">Todavía no hay actividad registrada.</p>;
  }

  return (
    <ul className="timeline">
      {items.map(it => (
        <li key={it.id} className="timeline__item">
          <span className={`timeline__dot timeline__dot--${it.estado === 'Correcto' ? 'ok' : 'warn'}`} />
          <div>
            <div className="timeline__linea">
              <strong>{it.usuarioNombre || 'Sistema'}</strong> · {it.accion}
              {it.articulo ? <> · art. <code>{it.articulo}</code></> : null}
              {it.rackOrigen ? <> · {it.rackOrigen} → {it.rackDestino}</> : null}
            </div>
            <div className="timeline__meta">{it.fecha} {it.hora} · {it.estado}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
