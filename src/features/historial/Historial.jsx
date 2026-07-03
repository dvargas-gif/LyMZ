import { useEffect, useState } from 'react';
import { auditService } from '../auditoria/audit.service.js';
import { exportarExcel } from '../../shared/utils/exportExcel.js';
import { puede } from '../auth/roles.js';

const ESTADOS_OPC = ['', 'Correcto', 'Cancelado', 'Deshecho'];
const TIPOS_OPC = ['', 'individual', 'cuerpo_completo'];

export default function Historial({ sesion }) {
  const [registros, setRegistros] = useState([]);
  const [filtros, setFiltros] = useState({ usuarioNombre: '', fecha: '', rack: '', articulo: '', tipoMovimiento: '', estado: '' });

  async function cargar() {
    const data = await auditService.listar(filtros);
    setRegistros(data);
  }

  useEffect(() => { cargar(); }, []); // eslint-disable-line

  function onFiltroChange(campo, valor) {
    setFiltros(f => ({ ...f, [campo]: valor }));
  }

  const puedeExportar = puede(sesion.rol, 'exportar');

  function handleExportar() {
    exportarExcel(registros.map(r => ({
      Fecha: r.fecha, Hora: r.hora, Usuario: r.usuarioNombre, Accion: r.accion,
      RackOrigen: r.rackOrigen, NivelOrigen: r.nivelOrigen,
      RackDestino: r.rackDestino, NivelDestino: r.nivelDestino,
      Articulo: r.articulo, Cantidad: r.cantidad, TipoMovimiento: r.tipoMovimiento,
      Estado: r.estado, Observaciones: r.observaciones,
    })), `Historial_Movimientos_${new Date().toISOString().slice(0,10)}.xlsx`, 'Historial');
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <h2>Historial de movimientos</h2>
        {puedeExportar && (
          <button className="btn-primary" onClick={handleExportar}>
            <i className="ti ti-file-export" /> Exportar a Excel
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
        <button className="btn-secondary" onClick={cargar}><i className="ti ti-filter" /> Filtrar</button>
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
    </div>
  );
}
