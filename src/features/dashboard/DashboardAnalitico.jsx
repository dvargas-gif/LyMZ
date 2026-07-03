import Timeline from '../../shared/components/Timeline.jsx';
import Productividad from './Productividad.jsx';

/**
 * Contenedor del dashboard: reutiliza el Productividad.jsx (nuevo, basado en
 * auditoría real) + Timeline. El dashboard analítico "de solo lectura" que
 * ya existía dentro del mapa legacy (KPIs de slotting, heatmap, etc.) sigue
 * disponible tal cual dentro de la pestaña "Mapa editable" → botón interno
 * "Dashboard analítico" del propio HTML legacy — no se duplicó ni se tocó.
 */
export default function DashboardAnalitico() {
  return (
    <div className="dash-g2">
      <div>
        <Productividad />
      </div>
      <div className="panel">
        <h2>Actividad reciente</h2>
        <Timeline limite={20} />
      </div>
    </div>
  );
}
