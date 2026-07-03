import { useEffect, useMemo, useState } from 'react';
import { auditService } from '../auditoria/audit.service.js';

function calcularMetricasPorUsuario(movimientos) {
  const porUsuario = {};
  for (const m of movimientos) {
    const u = m.usuarioNombre || 'Desconocido';
    porUsuario[u] = porUsuario[u] || { usuario: u, movimientos: 0, deshechos: 0, errores: 0, timestamps: [] };
    porUsuario[u].movimientos++;
    if (m.estado === 'Deshecho') porUsuario[u].deshechos++;
    if (m.estado === 'Cancelado') porUsuario[u].errores++;
    porUsuario[u].timestamps.push(`${m.fecha}T${m.hora}`);
  }
  return Object.values(porUsuario).map(u => {
    const tiempos = u.timestamps.map(t => new Date(t).getTime()).sort((a, b) => a - b);
    let sumaDiffs = 0, n = 0;
    for (let i = 1; i < tiempos.length; i++) { sumaDiffs += (tiempos[i] - tiempos[i - 1]); n++; }
    const promedioMs = n > 0 ? sumaDiffs / n : null;
    const ultimaActividad = u.timestamps.sort().slice(-1)[0] || null;
    return {
      usuario: u.usuario, movimientos: u.movimientos, deshechos: u.deshechos, errores: u.errores,
      tiempoPromedio: promedioMs ? `${Math.round(promedioMs / 1000 / 60)} min` : '—',
      productividad: u.movimientos > 0 ? Math.round((u.movimientos - u.errores - u.deshechos) / u.movimientos * 100) : 0,
      ultimaActividad,
    };
  }).sort((a, b) => b.movimientos - a.movimientos);
}

function agruparPor(movimientos, claveFn) {
  const acc = {};
  for (const m of movimientos) {
    const k = claveFn(m);
    acc[k] = (acc[k] || 0) + 1;
  }
  return acc;
}

export default function Productividad() {
  const [movimientos, setMovimientos] = useState([]);

  useEffect(() => {
    (async () => {
      const todos = await auditService.listar({});
      setMovimientos(todos.filter(r => r.accion === 'movimiento'));
    })();
  }, []);

  const porUsuario = useMemo(() => calcularMetricasPorUsuario(movimientos), [movimientos]);
  const porDia = useMemo(() => agruparPor(movimientos, m => m.fecha), [movimientos]);
  const porHora = useMemo(() => agruparPor(movimientos, m => m.hora.slice(0, 2) + ':00'), [movimientos]);
  const hayDatos = movimientos.length > 0;

  return (
    <div className="panel">
      <h2>Dashboard de productividad</h2>

      {!hayDatos && (
        <div className="pend-banner">
          <i className="ti ti-database-off" /> Todavía no hay movimientos registrados en esta sesión. Las métricas se llenan a medida que se usa el mapa.
        </div>
      )}

      <div className="dash-g2" style={{ marginTop: 16 }}>
        <div className="dc">
          <h3>Movimientos por día</h3>
          <ul className="lista-simple">
            {Object.entries(porDia).map(([k, v]) => <li key={k}><span>{k}</span><strong>{v}</strong></li>)}
            {!hayDatos && <li className="muted">Sin datos</li>}
          </ul>
        </div>
        <div className="dc">
          <h3>Movimientos por hora</h3>
          <ul className="lista-simple">
            {Object.entries(porHora).map(([k, v]) => <li key={k}><span>{k}</span><strong>{v}</strong></li>)}
            {!hayDatos && <li className="muted">Sin datos</li>}
          </ul>
        </div>
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
              <td>{i + 1}</td><td>{u.usuario}</td><td>{u.movimientos}</td><td>{u.tiempoPromedio}</td>
              <td>{u.errores}</td><td>{u.deshechos}</td>
              <td><span className="estado-badge estado-badge--ok">{u.productividad}%</span></td>
              <td>{u.ultimaActividad ? new Date(u.ultimaActividad).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
