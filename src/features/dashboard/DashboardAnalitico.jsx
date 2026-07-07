import Timeline from '../../shared/components/Timeline.jsx';
import Productividad from './Productividad.jsx';
import ResumenOcupacion from './ResumenOcupacion.jsx';

/**
 * Contenedor del dashboard: ResumenOcupacion (nuevo, agregado de todo el
 * mezanine vía WarehouseModel) arriba, Productividad + Timeline abajo. El
 * antiguo botón "Dashboard analítico" dentro del mapa legacy (KPIs/heatmap
 * por celda) ya se eliminó en una sesión anterior por ser dead code
 * duplicado -- esta vista es la que lo reemplaza, con datos agregados que
 * esa versión vieja nunca tuvo.
 */
export default function DashboardAnalitico() {
  return (
    <>
      <ResumenOcupacion />
      <div className="dash-g2" style={{ marginTop: 24 }}>
        <div>
          <Productividad />
        </div>
        <div className="panel">
          <h2>Actividad reciente</h2>
          <Timeline limite={20} />
        </div>
      </div>
    </>
  );
}
