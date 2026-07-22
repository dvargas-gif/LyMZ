import { useEffect, useState } from 'react';
import { auditService } from './audit.service.js';
import { storage } from '../../shared/services/storage.supabase.js';
import { exportarExcel } from '../../shared/utils/exportExcel.js';
import { puede } from '../auth/roles.js';
import ControlesPaginacion from '../../shared/components/ControlesPaginacion.jsx';

// Mismo recorte de display que ya tenía esta vista (slice(0,30)/slice(0,50))
// -- ahora es el tamaño REAL de página (se descarga solo eso), no solo lo
// que se mostraba de un array que ya venía completo en memoria.
const POR_PAGINA_INTENTOS = 30;
const POR_PAGINA_LOG = 50;
const ESTADOS_OPC = ['', 'Correcto', 'Cancelado', 'Deshecho'];
const TIPOS_OPC = ['', 'individual', 'cuerpo_completo'];

/**
 * Vista de seguridad + historial (2026-07-22, fusionada -- antes "Historial
 * de movimientos" vivía como su propia pestaña de navegación, separada de
 * Auditoría, mostrando exactamente el mismo log con filtros y export. Ahora
 * vive ACÁ: la tabla de abajo reemplaza al viejo "Log completo" con la
 * versión filtrable+exportable de Historial.jsx (eliminado).
 *
 * La sección de seguridad (KPIs + intentos de login) sigue restringida a
 * `ver_auditoria` (Admin/Supervisor) -- el rol "Solo lectura" tiene
 * `ver_historial` pero NO `ver_auditoria`, así que entra a esta vista (el
 * ítem del sidebar ahora se gatea por `ver_historial`, que ya incluye a
 * Admin/Supervisor también) y ve el historial de movimientos como siempre,
 * pero no los intentos de login ni los KPIs de seguridad.
 *
 * Nunca se borra ningún registro desde aquí (no existe botón de eliminar a propósito).
 */
export default function AuditoriaView({ sesion }) {
  const puedeVerSeguridad = puede(sesion.rol, 'ver_auditoria');
  const puedeExportar = puede(sesion.rol, 'exportar');

  // -- Historial de movimientos (filtrable, ex Historial.jsx) --
  const [registros, setRegistros] = useState([]);
  const [totalLog, setTotalLog] = useState(0);
  const [paginaLog, setPaginaLog] = useState(1);
  const [filtros, setFiltros] = useState({ usuarioNombre: '', fecha: '', rack: '', articulo: '', tipoMovimiento: '', estado: '' });
  const [disparador, setDisparador] = useState(0); // fuerza una recarga aunque `paginaLog` no cambie, ver aplicarFiltros
  const [exportando, setExportando] = useState(false);

  // -- Seguridad (solo Admin/Supervisor) --
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [intentos, setIntentos] = useState([]);
  const [totalIntentos, setTotalIntentos] = useState(0);
  const [paginaIntentos, setPaginaIntentos] = useState(1);
  const [fallidos, setFallidos] = useState(0);

  // Paginado en el SERVIDOR (ver audit.service.js.listarPaginado) -- nunca
  // descarga más que la página actual, a diferencia de antes que traía TODA
  // la auditoría (una tabla que solo crece, sin techo natural).
  useEffect(() => {
    (async () => {
      const { filas, total } = await auditService.listarPaginado(filtros, { pagina: paginaLog, porPagina: POR_PAGINA_LOG });
      setRegistros(filas);
      setTotalLog(total);
    })();
  }, [paginaLog, disparador]); // eslint-disable-line

  useEffect(() => {
    if (!puedeVerSeguridad) return;
    auditService.listarPaginado({}, { pagina: 1, porPagina: 1 }).then(({ total }) => setTotalGeneral(total));
  }, [puedeVerSeguridad]);

  useEffect(() => {
    if (!puedeVerSeguridad) return;
    (async () => {
      const desde = (paginaIntentos - 1) * POR_PAGINA_INTENTOS;
      const { filas, total } = await storage.getPagina('intentos_login', { desde, hasta: desde + POR_PAGINA_INTENTOS - 1 });
      setIntentos(filas);
      setTotalIntentos(total);
    })();
  }, [paginaIntentos, puedeVerSeguridad]);

  useEffect(() => {
    if (!puedeVerSeguridad) return;
    storage.contarPorIgualdad('intentos_login', 'exitoso', false).then(setFallidos);
  }, [puedeVerSeguridad]);

  function onFiltroChange(campo, valor) {
    setFiltros(f => ({ ...f, [campo]: valor }));
  }

  // Un filtro nuevo siempre vuelve a la página 1 -- si no, "página 3" podría
  // quedar vacía con el filtro nuevo. `disparador` garantiza una recarga real
  // aunque `paginaLog` ya fuera 1 (setPaginaLog(1) no dispararía el efecto
  // por sí solo en ese caso -- mismo bug evitado que ya resolvía Historial.jsx).
  function aplicarFiltros() {
    setPaginaLog(1);
    setDisparador(d => d + 1);
  }

  // El export sigue exportando TODO lo que matchea el filtro (no solo la
  // página en pantalla) -- usa listar() (trae todo, sin paginar), la misma
  // fuente completa de siempre, independiente de qué página esté mirando el usuario.
  async function handleExportar() {
    setExportando(true);
    try {
      const todos = await auditService.listar(filtros);
      exportarExcel(todos.map(r => ({
        Fecha: r.fecha, Hora: r.hora, Usuario: r.usuarioNombre, Accion: r.accion,
        RackOrigen: r.rackOrigen, NivelOrigen: r.nivelOrigen,
        RackDestino: r.rackDestino, NivelDestino: r.nivelDestino,
        Articulo: r.articulo, Cantidad: r.cantidad, TipoMovimiento: r.tipoMovimiento,
        Estado: r.estado, Observaciones: r.observaciones,
      })), `Historial_Movimientos_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Historial');
    } finally {
      setExportando(false);
    }
  }

  const totalPaginasLog = Math.max(1, Math.ceil(totalLog / POR_PAGINA_LOG));
  const totalPaginasIntentos = Math.max(1, Math.ceil(totalIntentos / POR_PAGINA_INTENTOS));

  return (
    <div className="panel">
      <h2>Auditoría</h2>
      <p className="muted">Registro inmutable. Todas las acciones quedan aquí, incluidas las de seguridad.</p>

      {puedeVerSeguridad && (
        <>
          <div className="kpis-mini" style={{ marginTop: 16 }}>
            <div className="kpi-mini"><div className="v">{totalGeneral}</div><div className="l">Registros totales</div></div>
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
        </>
      )}

      <div className="panel__header" style={{ marginTop: 24 }}>
        <h3 style={{ margin: 0 }}>Historial de movimientos</h3>
        {puedeExportar && (
          <button className="btn-primary" onClick={handleExportar} disabled={exportando}>
            <i className="ti ti-file-export" /> {exportando ? 'Exportando…' : 'Exportar a Excel'}
          </button>
        )}
      </div>

      <div className="filtros-bar">
        <input placeholder="Usuario" value={filtros.usuarioNombre} onChange={e => onFiltroChange('usuarioNombre', e.target.value)} />
        <input type="date" value={filtros.fecha} onChange={e => onFiltroChange('fecha', e.target.value)} />
        <input placeholder="Rack (ej. MZ01-C016)" value={filtros.rack} onChange={e => onFiltroChange('rack', e.target.value)} />
        <input placeholder="Artículo" value={filtros.articulo} onChange={e => onFiltroChange('articulo', e.target.value)} />
        <select value={filtros.tipoMovimiento} onChange={e => onFiltroChange('tipoMovimiento', e.target.value)}>
          {TIPOS_OPC.map(o => <option key={o} value={o}>{o || 'Todos los tipos'}</option>)}
        </select>
        <select value={filtros.estado} onChange={e => onFiltroChange('estado', e.target.value)}>
          {ESTADOS_OPC.map(o => <option key={o} value={o}>{o || 'Todos los estados'}</option>)}
        </select>
        <button className="btn-secondary" onClick={aplicarFiltros}><i className="ti ti-filter" /> Filtrar</button>
      </div>

      <table className="tabla">
        <thead>
          <tr>
            <th>Fecha</th><th>Hora</th><th>Usuario</th><th>Acción</th>
            <th>Origen</th><th>Destino</th><th>Artículo</th><th>Tipo</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {registros.length === 0 && (
            <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>Sin registros para estos filtros.</td></tr>
          )}
          {registros.map(r => (
            <tr key={r.id}>
              <td>{r.fecha}</td><td>{r.hora}</td><td>{r.usuarioNombre}</td><td>{r.accion}</td>
              <td>{r.rackOrigen ? `${r.rackOrigen} · ${r.nivelOrigen || ''}` : '—'}</td>
              <td>{r.rackDestino ? `${r.rackDestino} · ${r.nivelDestino || ''}` : '—'}</td>
              <td><code>{r.articulo || '—'}</code></td>
              <td>{r.tipoMovimiento || '—'}</td>
              <td><span className={`estado-badge estado-badge--${r.estado === 'Correcto' ? 'ok' : 'warn'}`}>{r.estado}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ControlesPaginacion pagina={paginaLog} totalPaginas={totalPaginasLog} total={totalLog} onCambiarPagina={setPaginaLog} />
    </div>
  );
}
