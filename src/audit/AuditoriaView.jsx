import { useEffect, useState } from 'react';
import { auditService } from './audit.service.js';
import { storage } from '../services/storage.supabase.js';

/**
 * Vista de seguridad: sesiones, intentos fallidos y acciones administrativas,
 * además de todo el log crudo. Nunca se borra ningún registro desde aquí
 * (no existe botón de eliminar a propósito).
 */
export default function AuditoriaView() {
  const [log, setLog] = useState([]);
  const [intentos, setIntentos] = useState([]);

  useEffect(() => {
    (async () => {
      setLog(await auditService.listar({}));
      setIntentos((await storage.getAll('intentos_login')).sort((a, b) => b.id - a.id));
    })();
  }, []);

  const fallidos = intentos.filter(i => !i.exitoso);

  return (
    <div className="panel">
      <h2>Auditoría del sistema</h2>
      <p className="muted">Registro inmutable. Todas las acciones quedan aquí, incluidas las de seguridad.</p>

      <div className="kpis-mini">
        <div className="kpi-mini"><div className="v">{log.length}</div><div className="l">Registros totales</div></div>
        <div className="kpi-mini"><div className="v">{intentos.length}</div><div className="l">Intentos de login</div></div>
        <div className="kpi-mini kpi-mini--warn"><div className="v">{fallidos.length}</div><div className="l">Intentos fallidos</div></div>
      </div>

      <h3 style={{ marginTop: 24 }}>Intentos de inicio de sesión</h3>
      <table className="tabla">
        <thead><tr><th>Fecha/Hora</th><th>Usuario</th><th>IP</th><th>Resultado</th></tr></thead>
        <tbody>
          {intentos.slice(0, 30).map(i => (
            <tr key={i.id}>
              <td>{new Date(i.fecha_hora).toLocaleString()}</td>
              <td>{i.usuario}</td><td>{i.ip}</td>
              <td><span className={`estado-badge estado-badge--${i.exitoso ? 'ok' : 'warn'}`}>{i.exitoso ? 'Exitoso' : 'Fallido'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Log completo (todas las acciones)</h3>
      <table className="tabla">
        <thead><tr><th>Fecha</th><th>Hora</th><th>Usuario</th><th>Acción</th><th>Estado</th><th>Obs.</th></tr></thead>
        <tbody>
          {log.slice(0, 50).map(r => (
            <tr key={r.id}>
              <td>{r.fecha}</td><td>{r.hora}</td><td>{r.usuarioNombre}</td><td>{r.accion}</td>
              <td><span className={`estado-badge estado-badge--${r.estado === 'Correcto' ? 'ok' : 'warn'}`}>{r.estado}</span></td>
              <td>{r.observaciones}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
