import { useEffect, useState } from 'react';
import { auditService } from './audit.service.js';
import { storage } from '../../shared/services/storage.supabase.js';
import ControlesPaginacion from '../../shared/components/ControlesPaginacion.jsx';

// Mismo recorte de display que ya tenía esta vista (slice(0,30)/slice(0,50))
// -- ahora es el tamaño REAL de página (se descarga solo eso), no solo lo
// que se mostraba de un array que ya venía completo en memoria.
const POR_PAGINA_INTENTOS = 30;
const POR_PAGINA_LOG = 50;

/**
 * Vista de seguridad: sesiones, intentos fallidos y acciones administrativas,
 * además de todo el log crudo. Nunca se borra ningún registro desde aquí
 * (no existe botón de eliminar a propósito).
 *
 * Las dos tablas paginan en el SERVIDOR (ver audit.service.js.listarPaginado
 * y storage.getPagina) -- la auditoría es la única tabla del proyecto sin
 * techo natural (crece con cada login/movimiento), así que traerla entera
 * para mostrar 30-50 filas era el desperdicio real. Los 3 KPI de arriba
 * siguen siendo el TOTAL real (conteos de servidor), no el tamaño de la página.
 */
export default function AuditoriaView() {
  const [log, setLog] = useState([]);
  const [totalLog, setTotalLog] = useState(0);
  const [paginaLog, setPaginaLog] = useState(1);

  const [intentos, setIntentos] = useState([]);
  const [totalIntentos, setTotalIntentos] = useState(0);
  const [paginaIntentos, setPaginaIntentos] = useState(1);
  const [fallidos, setFallidos] = useState(0);

  useEffect(() => {
    (async () => {
      const { filas, total } = await auditService.listarPaginado({}, { pagina: paginaLog, porPagina: POR_PAGINA_LOG });
      setLog(filas);
      setTotalLog(total);
    })();
  }, [paginaLog]);

  useEffect(() => {
    (async () => {
      const desde = (paginaIntentos - 1) * POR_PAGINA_INTENTOS;
      const { filas, total } = await storage.getPagina('intentos_login', { desde, hasta: desde + POR_PAGINA_INTENTOS - 1 });
      setIntentos(filas);
      setTotalIntentos(total);
    })();
  }, [paginaIntentos]);

  useEffect(() => {
    storage.contarPorIgualdad('intentos_login', 'exitoso', false).then(setFallidos);
  }, []);

  const totalPaginasLog = Math.max(1, Math.ceil(totalLog / POR_PAGINA_LOG));
  const totalPaginasIntentos = Math.max(1, Math.ceil(totalIntentos / POR_PAGINA_INTENTOS));

  return (
    <div className="panel">
      <h2>Auditoría del sistema</h2>
      <p className="muted">Registro inmutable. Todas las acciones quedan aquí, incluidas las de seguridad.</p>

      <div className="kpis-mini">
        <div className="kpi-mini"><div className="v">{totalLog}</div><div className="l">Registros totales</div></div>
        <div className="kpi-mini"><div className="v">{totalIntentos}</div><div className="l">Intentos de login</div></div>
        <div className="kpi-mini kpi-mini--warn"><div className="v">{fallidos}</div><div className="l">Intentos fallidos</div></div>
      </div>

      <h3 style={{ marginTop: 24 }}>Intentos de inicio de sesión</h3>
      <table className="tabla">
        <thead><tr><th>Fecha/Hora</th><th>Usuario</th><th>IP</th><th>Resultado</th></tr></thead>
        <tbody>
          {intentos.map(i => (
            <tr key={i.id}>
              <td>{new Date(i.fecha_hora).toLocaleString()}</td>
              <td>{i.usuario}</td><td>{i.ip}</td>
              <td><span className={`estado-badge estado-badge--${i.exitoso ? 'ok' : 'warn'}`}>{i.exitoso ? 'Exitoso' : 'Fallido'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ControlesPaginacion pagina={paginaIntentos} totalPaginas={totalPaginasIntentos} total={totalIntentos} onCambiarPagina={setPaginaIntentos} />

      <h3 style={{ marginTop: 24 }}>Log completo (todas las acciones)</h3>
      <table className="tabla">
        <thead><tr><th>Fecha</th><th>Hora</th><th>Usuario</th><th>Acción</th><th>Estado</th><th>Obs.</th></tr></thead>
        <tbody>
          {log.map(r => (
            <tr key={r.id}>
              <td>{r.fecha}</td><td>{r.hora}</td><td>{r.usuarioNombre}</td><td>{r.accion}</td>
              <td><span className={`estado-badge estado-badge--${r.estado === 'Correcto' ? 'ok' : 'warn'}`}>{r.estado}</span></td>
              <td>{r.observaciones}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ControlesPaginacion pagina={paginaLog} totalPaginas={totalPaginasLog} total={totalLog} onCambiarPagina={setPaginaLog} />
    </div>
  );
}
