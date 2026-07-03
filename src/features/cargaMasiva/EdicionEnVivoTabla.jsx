import { useEffect, useMemo, useState } from 'react';
import { reporteService } from '../reportes/reporte.service.js';
import { posicionesService } from '../../shared/services/posiciones.service.js';
import { escenarioPosicionesService } from '../salas/escenarioPosiciones.service.js';
import { validarCargaMasiva, normalizarArticulo } from './cargaMasiva.service.js';
import { auditService } from '../auditoria/audit.service.js';
import { ACCIONES } from '../auditoria/audit.schema.js';
import BadgeClase from '../../shared/components/BadgeClase.jsx';
import { formatearPosicion } from '../../shared/utils/formatearPosicion.js';

/**
 * Tabla editable en vivo: cada fila (artículo) tiene su pasillo/columna/nivel
 * editables ahí mismo, como una planilla. Reutiliza validarCargaMasiva()
 * pasándole un lote de una sola fila — la misma función que usa la carga
 * por Excel, así los dos caminos validan exactamente igual (conflictos,
 * mismo destino que otro artículo, etc.) sin duplicar esa lógica.
 */
export default function EdicionEnVivoTabla({ escenarioId, sesion }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(null); // articulo en edición
  const [temp, setTemp] = useState({ pasillo: '', columna: '', nivel: '' });
  const [guardandoArticulo, setGuardandoArticulo] = useState(null);
  const [errorFila, setErrorFila] = useState(null); // {articulo, motivo}

  async function cargar() {
    setCargando(true);
    setFilas(await reporteService.obtener(escenarioId));
    setCargando(false);
  }

  useEffect(() => { cargar(); }, [escenarioId]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(f =>
      f.articulo.toLowerCase().includes(q) ||
      (f.descripcion || '').toLowerCase().includes(q) ||
      (f.pasillo || '').toLowerCase().includes(q)
    );
  }, [filas, busqueda]);

  function iniciarEdicion(f) {
    setEditando(f.articulo);
    setErrorFila(null);
    setTemp({ pasillo: f.pasillo || '', columna: f.columna ?? '', nivel: f.nivel || '' });
  }

  function cancelarEdicion() {
    setEditando(null);
    setErrorFila(null);
  }

  async function confirmarEdicion(f) {
    const pasillo = temp.pasillo.trim().toUpperCase();
    const columna = parseInt(temp.columna, 10);
    const nivel = temp.nivel.trim().toUpperCase() || null;
    if (!pasillo || !Number.isFinite(columna) || columna < 1) {
      setErrorFila({ articulo: f.articulo, motivo: 'Pasillo y columna son obligatorios (columna debe ser un número mayor o igual a 1).' });
      return;
    }
    const filaDeseada = { articulo: normalizarArticulo(f.articulo), pasillo, columna, nivel, clase: f.clase, grupo: f.grupo, tipo: f.tipo };
    const { filas: validadas } = validarCargaMasiva([filaDeseada], filas);
    const validada = validadas[0];
    if (!validada.valido) {
      setErrorFila({ articulo: f.articulo, motivo: validada.motivo });
      return;
    }

    setGuardandoArticulo(f.articulo);
    try {
      const guardado = { articulo: validada.articulo, pasillo: validada.pasillo, columna: validada.columna, nivel: validada.nivel, clase: validada.clase, grupo: validada.grupo, tipo: validada.tipo };
      if (escenarioId) {
        await escenarioPosicionesService.guardar({ escenarioId, ...guardado, usuarioId: sesion.usuarioId });
      } else {
        await posicionesService.guardar({ ...guardado, usuarioId: sesion.usuarioId });
        await auditService.registrar({
          usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
          accion: ACCIONES.ADMIN, articulo: guardado.articulo,
          rackDestino: `${guardado.pasillo}-C${String(guardado.columna).padStart(3, '0')}`, nivelDestino: guardado.nivel,
          observaciones: 'Editado en vivo desde la tabla',
        });
      }
      setFilas(prev => prev.map(x => (x.articulo === f.articulo ? { ...x, ...guardado } : x)));
      setEditando(null);
      setErrorFila(null);
    } catch (err) {
      setErrorFila({ articulo: f.articulo, motivo: `No se pudo guardar: ${err.message || err}` });
    } finally {
      setGuardandoArticulo(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <p style={{ fontSize: 12, color: '#6E7A72', marginBottom: 10 }}>
        Tocá el ✏️ de cualquier fila para editar su pasillo/columna/nivel ahí mismo — se guarda al instante,
        validando que el destino no lo tenga ocupado otro artículo{escenarioId ? ' de esta sala' : ' real'}.
      </p>
      <input
        placeholder="Buscar por artículo, descripción o pasillo…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontFamily: 'inherit', marginBottom: 10 }}
      />
      {cargando ? (
        <p style={{ textAlign: 'center', color: '#9A9684', padding: 24 }}>Cargando…</p>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
              <tr style={{ textAlign: 'left', color: '#9A9684', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={thStyle}>Artículo</th>
                <th style={thStyle}>Descripción</th>
                <th style={thStyle}>Posición</th>
                <th style={thStyle}>Clase</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9A9684', padding: 20 }}>Sin resultados.</td></tr>
              )}
              {filtradas.map(f => (
                <tr key={f.articulo} style={{ borderTop: '1px solid #F0EEE5', opacity: guardandoArticulo === f.articulo ? 0.5 : 1 }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo}</td>
                  <td style={tdStyle}>{f.descripcion}</td>
                  <td style={tdStyle}>
                    {editando === f.articulo ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input value={temp.pasillo} onChange={e => setTemp(t => ({ ...t, pasillo: e.target.value }))} placeholder="MZ01" style={inputMini} />
                        <input value={temp.columna} onChange={e => setTemp(t => ({ ...t, columna: e.target.value }))} placeholder="col" style={{ ...inputMini, width: 44 }} />
                        <input value={temp.nivel} onChange={e => setTemp(t => ({ ...t, nivel: e.target.value }))} placeholder="N02" style={inputMini} />
                        <button className="btn-icon" title="Guardar" onClick={() => confirmarEdicion(f)}><i className="ti ti-check" /></button>
                        <button className="btn-icon" title="Cancelar" onClick={cancelarEdicion}><i className="ti ti-x" /></button>
                      </div>
                    ) : (
                      <span style={{ fontFamily: 'monospace' }}>{f.pasillo ? formatearPosicion(f.pasillo, f.columna, f.nivel) : '— sin ubicación —'}</span>
                    )}
                    {errorFila?.articulo === f.articulo && <div style={{ color: '#C0392B', fontSize: 11, marginTop: 4 }}>{errorFila.motivo}</div>}
                  </td>
                  <td style={tdStyle}>
                    {f.clase ? <BadgeClase clase={f.clase} tipo={f.tipo} /> : '—'}
                  </td>
                  <td style={tdStyle}>
                    {editando !== f.articulo && (
                      <button className="btn-icon" title="Editar posición" onClick={() => iniciarEdicion(f)}><i className="ti ti-pencil" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '6px 8px', borderBottom: '1px solid #EAECEF' };
const tdStyle = { padding: '7px 8px', verticalAlign: 'top' };
const inputMini = { fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #DADCE0', fontFamily: 'monospace', width: 62 };
