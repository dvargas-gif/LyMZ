import { useEffect, useMemo, useState } from 'react';
import { obtenerWarehouseModel } from '../../domain/crearWarehouseModel.js';
import { calcularMetricasPorUsuario, agruparPor } from '../../domain/metricasProductividad.js';
import Skeleton from '../../ui/motion/Skeleton.jsx';
import AnimatedCard from '../../ui/motion/AnimatedCard.jsx';
import KpiValor from '../../ui/motion/KpiValor.jsx';

/**
 * Cero queries propias, cero fórmulas propias (G1e) -- `calcularMetricasPorUsuario`/
 * `agruparPor` viven en src/domain/metricasProductividad.js (con test), y los
 * movimientos salen de WarehouseModel.movimientos() (auditService envuelto
 * ahí) en vez de llamar a auditService directo. Mismo comportamiento que
 * antes: una sola carga al montar, sin suscripción Realtime (la auditoría no
 * está entre las tablas que el modelo escucha hoy -- ver DOMAIN.md).
 */
export default function Productividad() {
  const [movimientos, setMovimientos] = useState(null); // null = cargando (para el skeleton)

  useEffect(() => {
    (async () => {
      const modelo = obtenerWarehouseModel(null);
      await modelo.cargarMovimientos();
      setMovimientos(modelo.movimientos().filter(r => r.accion === 'movimiento'));
    })();
  }, []);

  const cargando = movimientos === null;
  const lista = movimientos ?? [];
  const porUsuario = useMemo(() => calcularMetricasPorUsuario(lista), [lista]);
  const porDia = useMemo(() => agruparPor(lista, m => m.fecha), [lista]);
  const porHora = useMemo(() => agruparPor(lista, m => m.hora.slice(0, 2) + ':00'), [lista]);
  const hayDatos = lista.length > 0;

  if (cargando) {
    return (
      <div className="panel">
        <h2>Dashboard de productividad</h2>
        <div className="dash-g2" style={{ marginTop: 16 }}>
          <Skeleton indice={0} alto={110} />
          <Skeleton indice={1} alto={110} />
        </div>
        <Skeleton indice={2} alto={160} className="skeleton--tabla" />
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Dashboard de productividad</h2>

      {!hayDatos && (
        <div className="pend-banner">
          <i className="ti ti-database-off" /> Todavía no hay movimientos registrados en esta sesión. Las métricas se llenan a medida que se usa el mapa.
        </div>
      )}

      <div className="dash-g2" style={{ marginTop: 16 }}>
        <AnimatedCard className="dc">
          <h3>Movimientos por día</h3>
          <ul className="lista-simple">
            {Object.entries(porDia).map(([k, v]) => <li key={k}><span>{k}</span><strong><KpiValor valor={v} /></strong></li>)}
            {!hayDatos && <li className="muted">Sin datos</li>}
          </ul>
        </AnimatedCard>
        <AnimatedCard className="dc">
          <h3>Movimientos por hora</h3>
          <ul className="lista-simple">
            {Object.entries(porHora).map(([k, v]) => <li key={k}><span>{k}</span><strong><KpiValor valor={v} /></strong></li>)}
            {!hayDatos && <li className="muted">Sin datos</li>}
          </ul>
        </AnimatedCard>
      </div>

      <h3 style={{ marginTop: 24 }}>Ranking de usuarios</h3>
      <table className="tabla">
        <thead>
          <tr><th>#</th><th>Usuario</th><th>Movimientos</th><th>Tiempo prom. entre mov.</th><th>Errores</th><th>Deshechos</th><th>Productividad</th><th>Última actividad</th></tr>
        </thead>
        <tbody>
          {porUsuario.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin datos aún</td></tr>}
          {porUsuario.map((u, i) => (
            <tr key={u.usuario}>
              <td>{i + 1}</td><td>{u.usuario}</td><td><KpiValor valor={u.movimientos} /></td><td>{u.tiempoPromedio}</td>
              <td>{u.errores}</td><td>{u.deshechos}</td>
              <td><span className="estado-badge estado-badge--ok"><KpiValor valor={u.productividad} formatear={v => `${Math.round(v)}%`} /></span></td>
              <td>{u.ultimaActividad ? new Date(u.ultimaActividad).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
