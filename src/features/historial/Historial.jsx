import { useEffect, useState } from 'react';
import { auditService } from '../auditoria/audit.service.js';
import { exportarExcel } from '../../shared/utils/exportExcel.js';
import { puede } from '../auth/roles.js';
import ControlesPaginacion from '../../shared/components/ControlesPaginacion.jsx';

const ESTADOS_OPC = ['', 'Correcto', 'Cancelado', 'Deshecho'];
const TIPOS_OPC = ['', 'individual', 'cuerpo_completo'];
const POR_PAGINA = 50;

export default function Historial({ sesion }) {
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ usuarioNombre: '', fecha: '', rack: '', articulo: '', tipoMovimiento: '', estado: '' });
  const [exportando, setExportando] = useState(false);
  const [disparador, setDisparador] = useState(0); // ver aplicarFiltros -- fuerza una recarga aunque `pagina` no cambie

  // Paginado en el SERVIDOR (ver audit.service.js.listarPaginado) -- nunca
  // descarga más que la página actual, a diferencia de antes que traía
  // TODA la auditoría (una tabla que solo crece, sin techo natural).
  async function cargar() {
    const { filas, total: totalFilas } = await auditService.listarPaginado(filtros, { pagina, porPagina: POR_PAGINA });
    setRegistros(filas);
    setTotal(totalFilas);
  }

  // Un solo lugar dispara cargar() -- nunca se llama directo desde
  // aplicarFiltros(). Antes, aplicarFiltros() llamaba a cargar() de una Y
  // además cambiaba `pagina` (que dispara este mismo efecto): dos fetch en
  // carrera, uno con la página vieja contra el filtro nuevo y otro con la
  // página 1 -- si el primero resolvía después, la tabla quedaba mostrando
  // datos de la página vieja mientras el paginador ya decía "Página 1".
  useEffect(() => { cargar(); }, [pagina, disparador]); // eslint-disable-line

  function aplicarFiltros() {
    setPagina(1); // un filtro nuevo siempre vuelve a la página 1 -- si no, "página 3" podría quedar vacía con el filtro nuevo
    setDisparador(d => d + 1); // garantiza una recarga real aunque `pagina` ya fuera 1 (setPagina(1) no dispararía el efecto por sí solo en ese caso)
  }

  function onFiltroChange(campo, valor) {
    setFiltros(f => ({ ...f, [campo]: valor }));
  }

  const puedeExportar = puede(sesion.rol, 'exportar');
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

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
      })), `Historial_Movimientos_${new Date().toISOString().slice(0,10)}.xlsx`, 'Historial');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <h2>Historial de movimientos</h2>
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

      <ControlesPaginacion pagina={pagina} totalPaginas={totalPaginas} total={total} onCambiarPagina={setPagina} />
    </div>
  );
}
