import { useEffect, useState } from 'react';
import { obtenerWarehouseModel } from '../../domain/crearWarehouseModel.js';
import { calcularResumenOcupacion } from '../../domain/resumenOcupacion.js';
import Skeleton from '../../ui/motion/Skeleton.jsx';
import AnimatedCard from '../../ui/motion/AnimatedCard.jsx';
import KpiValor from '../../ui/motion/KpiValor.jsx';

function formatearRack(f) {
  return `${f.pasillo}-C${String(f.columna).padStart(3, '0')}`;
}

/**
 * Vista agregada de ocupación de TODO el mezanine -- el mapa legacy nunca
 * tuvo esto (solo celda por celda). Cero queries/fórmulas propias: usa
 * WarehouseModel.racks() + calcularResumenOcupacion() (src/domain/).
 */
export default function ResumenOcupacion() {
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    (async () => {
      const modelo = await obtenerWarehouseModel(null).cargar();
      setResumen(calcularResumenOcupacion(modelo.racks(), modelo.configuracionOcupacion));
    })();
  }, []);

  if (!resumen) {
    return (
      <div className="panel">
        <h2>Resumen de ocupación del mezanine</h2>
        <div className="kpis-mini" style={{ marginTop: 16 }}>
          <Skeleton indice={0} alto={64} ancho={140} />
          <Skeleton indice={1} alto={64} ancho={140} />
          <Skeleton indice={2} alto={64} ancho={140} />
        </div>
        <div className="dash-g2" style={{ marginTop: 16 }}>
          <Skeleton indice={2} alto={140} />
          <Skeleton indice={3} alto={140} />
        </div>
      </div>
    );
  }

  const llenuraPromedioPct = resumen.llenuraPromedio * 100;

  return (
    <div className="panel">
      <h2>Resumen de ocupación del mezanine</h2>
      <p className="muted">{resumen.totalRacks} racks ocupados en total.</p>

      <div className="kpis-mini" style={{ marginTop: 16 }}>
        <div className="kpi-mini">
          <div className="v"><KpiValor valor={llenuraPromedioPct} formatear={v => `${Math.round(v)}%`} /></div>
          <div className="l">Llenura promedio</div>
        </div>
        <div className={`kpi-mini ${resumen.sobrecargados.length > 0 ? 'kpi-mini--warn' : ''}`}>
          <div className="v"><KpiValor valor={resumen.sobrecargados.length} /></div>
          <div className="l">Racks sobrecargados</div>
        </div>
        <div className="kpi-mini">
          <div className="v"><KpiValor valor={resumen.conNivelesPendientes.length} /></div>
          <div className="l">Con niveles sin armar</div>
        </div>
      </div>

      <div className="dash-g2" style={{ marginTop: 20 }}>
        <AnimatedCard className="dc">
          <h3>Distribución de ocupación</h3>
          <ul className="lista-simple">
            <li><span>Sobrecargados</span><strong><KpiValor valor={resumen.sobrecargados.length} /></strong></li>
            <li><span>En alerta</span><strong><KpiValor valor={resumen.enAlerta.length} /></strong></li>
            <li><span>OK</span><strong><KpiValor valor={resumen.ok.length} /></strong></li>
          </ul>
        </AnimatedCard>
        <AnimatedCard className="dc">
          <h3>Racks con niveles pendientes de armar</h3>
          <ul className="lista-simple">
            {resumen.conNivelesPendientes.slice(0, 8).map(f => (
              <li key={f.clave}><span>{formatearRack(f)}</span><strong>{f.nivelesAArmar}N</strong></li>
            ))}
            {resumen.conNivelesPendientes.length === 0 && <li className="muted">Ninguno</li>}
          </ul>
        </AnimatedCard>
      </div>

      <h3 style={{ marginTop: 24 }}>Top racks más llenos</h3>
      <table className="tabla">
        <thead>
          <tr><th>#</th><th>Rack</th><th>Artículos</th><th>Llenura</th></tr>
        </thead>
        <tbody>
          {resumen.topMasLlenos.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin datos</td></tr>}
          {resumen.topMasLlenos.map((f, i) => (
            <tr key={f.clave}>
              <td>{i + 1}</td>
              <td>{formatearRack(f)}</td>
              <td>{f.nArts}</td>
              <td>
                <span className="estado-badge" style={{ background: `${f.colorLlenura}22`, color: f.colorLlenura }}>
                  <KpiValor valor={f.llenura * 100} formatear={v => `${Math.round(v)}%`} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
