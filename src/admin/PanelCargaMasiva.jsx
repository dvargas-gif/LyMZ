import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { reporteService } from '../services/reporte.service.js';
import { posicionesService } from '../services/posiciones.service.js';
import { escenarioPosicionesService } from '../services/escenarioPosiciones.service.js';
import { escenariosService } from '../services/escenarios.service.js';
import { normalizarFilasDestino, validarCargaMasiva } from '../services/cargaMasiva.service.js';
import { parsearTextoPegado } from '../services/analisisPicks.js';
import { auditService } from '../audit/audit.service.js';
import { ACCIONES } from '../audit/audit.schema.js';
import { colorDeClase } from '../constants/coloresArticulo.js';
import EdicionEnVivoTabla from './EdicionEnVivoTabla.jsx';

/**
 * Dos formas de reacomodar de golpe, mismo panel:
 * - "Carga por Excel": subís un archivo con las ubicaciones que querés y se
 *   aplican todas juntas (bueno para cambios grandes ya armados de antemano).
 * - "Editar en vivo": una tabla tipo planilla donde tocás una fila y cambiás
 *   su pasillo/columna/nivel ahí mismo, uno por uno (bueno para ajustes
 *   puntuales sin tener que armar un Excel). Las dos comparten el mismo
 *   selector de destino (mapa real o una sala) y la misma validación de
 *   conflictos (validarCargaMasiva), para no duplicar esa lógica.
 */
export default function PanelCargaMasiva({ sesion, onCerrar }) {
  const [modo, setModo] = useState('excel'); // 'excel' | 'vivo'
  const [destino, setDestino] = useState('real'); // 'real' | id de escenario
  const [salas, setSalas] = useState([]);
  const [previa, setPrevia] = useState(null); // resultado de validarCargaMasiva
  const [pegado, setPegado] = useState('');
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // {aplicados, conflictos}

  useEffect(() => { escenariosService.listar().then(setSalas); }, []);

  const escenarioId = destino === 'real' ? null : destino;

  async function procesarFilas(filasCrudas) {
    setError('');
    setResultado(null);
    const normalizadas = normalizarFilasDestino(filasCrudas);
    if (normalizadas.length === 0) {
      setError('No se encontró ninguna fila con artículo + pasillo + columna reconocibles.');
      return;
    }
    setCargando(true);
    try {
      const estadoActual = await reporteService.obtener(escenarioId);
      const validado = validarCargaMasiva(normalizadas, estadoActual);
      setPrevia(validado);
    } finally {
      setCargando(false);
    }
  }

  function manejarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const lector = new FileReader();
    lector.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        procesarFilas(XLSX.utils.sheet_to_json(hoja, { defval: '' }));
      } catch {
        setError('No se pudo leer el archivo. Probá exportarlo de nuevo como .xlsx o .csv.');
      }
    };
    lector.readAsBinaryString(file);
    e.target.value = '';
  }

  function usarPegado() {
    procesarFilas(parsearTextoPegado(pegado));
  }

  async function aplicar() {
    if (!previa || previa.aplicables.length === 0) return;
    if (!escenarioId && !confirm(`Vas a mover ${previa.aplicables.length} artículo(s) en el MAPA REAL de una sola vez. Esto no tiene un "deshacer" masivo. ¿Confirmás?`)) return;
    setAplicando(true);
    try {
      const filas = previa.aplicables.map(f => ({ articulo: f.articulo, pasillo: f.pasillo, columna: f.columna, nivel: f.nivel, clase: f.clase, grupo: f.grupo, tipo: f.tipo }));
      if (escenarioId) {
        await escenarioPosicionesService.guardarLote(escenarioId, filas, sesion.usuarioId);
      } else {
        await posicionesService.guardarLote(filas, sesion.usuarioId);
        await Promise.all(filas.map(f => auditService.registrar({
          usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
          accion: ACCIONES.ADMIN, articulo: f.articulo,
          rackDestino: `${f.pasillo}-C${String(f.columna).padStart(3, '0')}`, nivelDestino: f.nivel,
          observaciones: 'Carga masiva de posiciones (Excel/tabla)',
        })));
      }
      setResultado({ aplicados: filas.length, conflictos: previa.conflictos.length, duplicados: previa.duplicados.length });
      setPrevia(null);
      setPegado('');
    } catch (err) {
      setError(`No se pudo aplicar la carga: ${err.message || err}`);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>📥✏️ Carga y edición de posiciones</h2>
          <button onClick={onCerrar} className="btn-icon"><i className="ti ti-x" /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, margin: '10px 0 14px' }}>
          <button className={`btn-secondary ${modo === 'excel' ? 'activo' : ''}`} onClick={() => setModo('excel')}>
            <i className="ti ti-file-spreadsheet" /> Carga por Excel
          </button>
          <button className={`btn-secondary ${modo === 'vivo' ? 'activo' : ''}`} onClick={() => setModo('vivo')}>
            <i className="ti ti-pencil" /> Editar en vivo (tabla)
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#1C3A3E', display: 'block', marginBottom: 6 }}>¿Dónde se aplica?</label>
          <select value={destino} onChange={e => { setDestino(e.target.value); setPrevia(null); setResultado(null); }} style={selectStyle}>
            <option value="real">Mapa real (⚠ afecta la operación real)</option>
            {salas.map(s => <option key={s.id} value={s.id}>🧪 Sala: {s.nombre}</option>)}
          </select>
        </div>

        {modo === 'vivo' && (
          <EdicionEnVivoTabla escenarioId={escenarioId} sesion={sesion} />
        )}

        {modo === 'excel' && (
        <>
        <p style={{ fontSize: 12, color: '#6E7A72', marginBottom: 16 }}>
          Subí un Excel/CSV (o pegá una tabla) con el acomodo que querés — columnas de artículo, pasillo y columna
          como mínimo (nivel/clase/grupo/tipo son opcionales, se completan con lo que el artículo ya tiene hoy).
        </p>

        {!previa && !resultado && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <label style={dropStyle}>
              <i className="ti ti-file-spreadsheet" style={{ fontSize: 22, color: '#15454A' }} />
              <span>Subir Excel / CSV</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={manejarArchivo} style={{ display: 'none' }} />
            </label>
            <div style={{ flex: 1, minWidth: 280 }}>
              <textarea
                placeholder={'O pegá una tabla acá (con encabezado), ej:\narticulo\tpasillo\tcolumna\tnivel\nABC123\tMZ01\t5\tN02'}
                value={pegado}
                onChange={e => setPegado(e.target.value)}
                style={{ width: '100%', minHeight: 74, fontSize: 12, fontFamily: 'monospace', padding: 10, borderRadius: 8, border: '1px solid #DADCE0' }}
              />
              <button className="btn-primary" disabled={!pegado.trim()} onClick={usarPegado} style={{ marginTop: 6 }}>Usar tabla pegada</button>
            </div>
          </div>
        )}

        {error && <p style={{ color: '#C0392B', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
        {cargando && <p style={{ textAlign: 'center', color: '#9A9684', padding: 20 }}>Comparando contra el estado actual…</p>}

        {resultado && (
          <div style={{ background: '#EAF3EE', border: '1px solid #1D9E75', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <b style={{ color: '#1D9E75' }}>✓ Se aplicaron {resultado.aplicados} posiciones</b>
            {resultado.duplicados > 0 && <span style={{ color: '#6E7A72', fontSize: 12.5 }}> — {resultado.duplicados} fila(s) duplicada(s) del mismo artículo/destino se aplicaron una sola vez.</span>}
            {resultado.conflictos > 0 && <span style={{ color: '#6E7A72', fontSize: 12.5 }}> — {resultado.conflictos} fila(s) se omitieron por conflicto (ver abajo antes de cerrar, o volvé a cargar el archivo para revisarlas).</span>}
          </div>
        )}

        {previa && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12.5 }}>
              <span>✅ Aplicables: <b>{previa.aplicables.length}</b></span>
              <span>♻ Duplicados: <b>{previa.duplicados.length}</b></span>
              <span>⚠ Conflictos: <b style={{ color: previa.conflictos.length ? '#C0392B' : 'inherit' }}>{previa.conflictos.length}</b></span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className="btn-primary" disabled={aplicando || previa.aplicables.length === 0} onClick={aplicar}>
                {aplicando ? 'Aplicando…' : `Aplicar ${previa.aplicables.length} cambios`}
              </button>
              <button className="btn-secondary" disabled={aplicando} onClick={() => setPrevia(null)}>Cancelar</button>
            </div>
            <TablaPreviaCarga filas={previa.filas} />
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

function TablaPreviaCarga({ filas }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={theadRow}>
          <th style={thStyle}>Artículo</th><th style={thStyle}>Destino</th><th style={thStyle}>Clase</th><th style={thStyle}>Estado</th>
        </tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} style={{ borderTop: '1px solid #F0EEE5', background: !f.valido ? '#FCEBEB' : f.duplicado ? '#FAEEDA' : 'transparent' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.pasillo}-C{String(f.columna || 0).padStart(3, '0')}{f.nivel ? `-${f.nivel}` : ''}</td>
              <td style={tdStyle}>{f.clase && f.clase !== '-' ? <span style={{ ...badgeStyle, background: colorDeClase(f.clase, f.tipo) }}>{f.clase}</span> : '—'}</td>
              <td style={{ ...tdStyle, color: !f.valido ? '#C0392B' : f.duplicado ? '#D08A1E' : '#1D9E75', fontSize: 11.5 }}>{f.motivo || 'OK'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(28,58,62,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 20 };
const cardStyle = { background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.35)' };
const dropStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, width: 180, minHeight: 74, border: '2px dashed #C8C2B4', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: '#6E7A72' };
const selectStyle = { fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontFamily: 'inherit', width: '100%', maxWidth: 380 };
const theadRow = { textAlign: 'left', color: '#9A9684', fontSize: 11, textTransform: 'uppercase' };
const thStyle = { padding: '6px 8px', borderBottom: '1px solid #EAECEF' };
const tdStyle = { padding: '7px 8px' };
const badgeStyle = { display: 'inline-block', minWidth: 22, textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 };
