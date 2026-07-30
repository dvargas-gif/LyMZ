import { useEffect, useState } from 'react';
import { auditService } from '../../features/auditoria/audit.service.js';

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
          <div className="timeline__chips">
            <span className="chip chip--fuerte">{it.usuarioNombre || 'Sistema'}</span>
            <span className="chip">{it.accion}</span>
            {it.articulo ? <span className="chip chip--codigo">{it.articulo}</span> : null}
            {it.rackOrigen ? <span className="chip">{it.rackOrigen} → {it.rackDestino}</span> : null}
            <span className="chip chip--tenue">{it.fecha} {it.hora}</span>
            <span className={`chip chip--${it.estado === 'Correcto' ? 'ok' : 'warn'}`}>{it.estado}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
