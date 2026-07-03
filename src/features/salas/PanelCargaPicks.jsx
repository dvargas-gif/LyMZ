import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { escenarioPicksService } from './escenarioPicks.service.js';
import { reporteService } from '../reportes/reporte.service.js';
import { normalizarFilasPicks, parsearTextoPegado, calcularAnalisis } from './analisisPicks.js';
import ModalBase from '../../shared/components/ModalBase.jsx';
import BadgeClase from '../../shared/components/BadgeClase.jsx';
import { formatearPosicion } from '../../shared/utils/formatearPosicion.js';

const COLOR_ROTACION = { Alta: '#1D9E75', Media: '#D08A1E', Baja: '#9A9684' };

/**
 * Carga de picks (Excel/CSV o texto pegado) + análisis de rotación de UNA
 * sala. Todo lo que se carga acá vive en `escenario_picks`, jamás en una
 * tabla real — la comparación "rotación real vs clase actual" usa
 * `reporteService.obtener(escenarioId)`, el mismo merge base+overrides que
 * ya usa el reporte de la sala, para no duplicar esa lógica.
 */
export default function PanelCargaPicks({ escenario, sesion, onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [posiciones, setPosiciones] = useState([]);
  const [picksGuardados, setPicksGuardados] = useState([]);
  const [previa, setPrevia] = useState(null); // filas parseadas, pendientes de confirmar
  const [pegado, setPegado] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [verTodas, setVerTodas] = useState(false);

  async function cargarBase() {
    setCargando(true);
    setError('');
    try {
      const [pos, picks] = await Promise.all([
        reporteService.obtener(escenario.id),
        escenarioPicksService.listar(escenario.id),
      ]);
      setPosiciones(pos);
      setPicksGuardados(picks);
    } catch (err) {
      console.error(err);
      setError('No se pudo cargar la carga de picks de esta sala. Si es la primera vez que se usa, falta correr supabase/sql/2026-07-02_salas_simulacion_avanzado.sql en Supabase.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarBase(); }, [escenario.id]);

  const analisis = useMemo(() => {
    if (picksGuardados.length === 0) return null;
    return calcularAnalisis(picksGuardados, posiciones);
  }, [picksGuardados, posiciones]);

  function manejarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    const lector = new FileReader();
    lector.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const filasCrudas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
        const normalizadas = normalizarFilasPicks(filasCrudas);
        if (normalizadas.length === 0) { setError('No se encontró ninguna columna de artículo/código reconocible en el archivo.'); return; }
        setPrevia(normalizadas);
      } catch {
        setError('No se pudo leer el archivo. Probá exportarlo de nuevo como .xlsx o .csv.');
      }
    };
    lector.readAsBinaryString(file);
    e.target.value = '';
  }

  function usarPegado() {
    setError('');
    const filas = parsearTextoPegado(pegado);
    const normalizadas = normalizarFilasPicks(filas);
    if (normalizadas.length === 0) { setError('No se pudo interpretar la tabla pegada. Necesita un encabezado en la primera línea y una columna de artículo/código.'); return; }
    setPrevia(normalizadas);
  }

  async function confirmarCarga() {
    setGuardando(true);
    setError('');
    try {
      await escenarioPicksService.cargarLote({ escenarioId: escenario.id, filas: previa, usuarioId: sesion.usuarioId });
      setPrevia(null);
      setPegado('');
      await cargarBase();
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar la carga. Si es la primera vez que se usa, falta correr supabase/sql/2026-07-02_salas_simulacion_avanzado.sql en Supabase.');
    } finally {
      setGuardando(false);
    }
  }

  const filasVisibles = analisis ? (verTodas ? analisis.filas : analisis.filas.slice(0, 15)) : [];

  return (
    <ModalBase titulo={`📈 Carga de picks — ${escenario.nombre}`} onCerrar={onCerrar} maxWidth={1080} maxHeight="88vh" scrollContenido>
      <p style={{ fontSize: 12, color: '#6E7A72', marginBottom: 16 }}>
        Subí demanda real (código, picks, frecuencia, prioridad) para ver qué artículos tienen más movimiento
        y si están bien ubicados según esta sala. Estos datos son exclusivos de "{escenario.nombre}".
      </p>

      {!previa && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <label style={dropStyle}>
            <i className="ti ti-file-spreadsheet" style={{ fontSize: 22, color: '#15454A' }} />
            <span>Subir Excel / CSV</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={manejarArchivo} style={{ display: 'none' }} />
          </label>
          <div style={{ flex: 1, minWidth: 280 }}>
            <textarea
              placeholder={'O pegá una tabla acá (con encabezado), ej:\narticulo\tpicks\tprioridad\nABC123\t150\tAlta'}
              value={pegado}
              onChange={e => setPegado(e.target.value)}
              style={{ width: '100%', minHeight: 74, fontSize: 12, fontFamily: 'monospace', padding: 10, borderRadius: 8, border: '1px solid #DADCE0' }}
            />
            <button className="btn-primary" disabled={!pegado.trim()} onClick={usarPegado} style={{ marginTop: 6 }}>Usar tabla pegada</button>
          </div>
        </div>
      )}

      {error && <p style={{ color: '#C0392B', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

      {previa && (
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Se leyeron {previa.length} fila(s). Revisá y confirmá para cargarlas a esta sala (reemplaza la carga anterior si había una).
          </p>
          <div style={{ overflowX: 'auto', maxHeight: 220, border: '1px solid #EEE', borderRadius: 8, marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={theadRow}><th style={thStyle}>Artículo</th><th style={thStyle}>Nombre</th><th style={thStyle}>Picks</th><th style={thStyle}>Prioridad</th></tr></thead>
              <tbody>
                {previa.slice(0, 30).map((f, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #F0EEE5' }}>
                    <td style={tdStyle}>{f.articulo}</td><td style={tdStyle}>{f.nombre}</td><td style={tdStyle}>{f.cantidad_picks}</td><td style={tdStyle}>{f.prioridad || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={guardando} onClick={confirmarCarga}>{guardando ? 'Cargando…' : `Cargar ${previa.length} filas a la sala`}</button>
            <button className="btn-secondary" disabled={guardando} onClick={() => setPrevia(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {cargando ? (
        <p style={{ textAlign: 'center', color: '#9A9684', padding: 24 }}>Cargando…</p>
      ) : !analisis ? (
        <p className="muted" style={{ padding: 12 }}>Todavía no cargaste picks en esta sala.</p>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 18 }}>
            <Kpi label="Artículos con picks" valor={analisis.resumen.totalArticulos} />
            <Kpi label="Total picks cargados" valor={analisis.resumen.totalPicks} />
            <Kpi label="Zona preferente (más clase A)" valor={analisis.resumen.zonaPreferente || '—'} />
            <Kpi label="Oportunidades de mejora" valor={analisis.resumen.oportunidadesMejora} destacar={analisis.resumen.oportunidadesMejora > 0} />
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 18, fontSize: 12.5 }}>
            {['Alta', 'Media', 'Baja'].map(r => (
              <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_ROTACION[r] }} />
                Rotación {r}: <b>{analisis.resumen.porRotacion[r]}</b>
              </span>
            ))}
          </div>

          {analisis.resumen.malUbicados.length > 0 && (
            <>
              <h3 style={h3Style}>⚠ Artículos mal ubicados según sus picks</h3>
              <TablaAnalisis filas={analisis.resumen.malUbicados} />
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 8px' }}>
            <h3 style={{ ...h3Style, margin: 0 }}>Detalle por artículo</h3>
            <button className="btn-secondary" style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => setVerTodas(v => !v)}>{verTodas ? 'Ver menos' : `Ver las ${analisis.filas.length} filas`}</button>
          </div>
          <TablaAnalisis filas={filasVisibles} />
        </div>
      )}
    </ModalBase>
  );
}

function Kpi({ label, valor, destacar }) {
  return (
    <div style={{ background: destacar ? '#FFF4EC' : '#F8F7F2', border: `1px solid ${destacar ? '#E07B39' : '#EEE'}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#9A9684', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: destacar ? '#C0392B' : '#1C3A3E' }}>{valor}</div>
    </div>
  );
}

function TablaAnalisis({ filas }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={theadRow}>
          <th style={thStyle}>Artículo</th><th style={thStyle}>Picks</th><th style={thStyle}>Rotación</th>
          <th style={thStyle}>Clase actual</th><th style={thStyle}>Posición</th><th style={thStyle}>Estado</th><th style={thStyle}>Recomendación</th>
        </tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.articulo} style={{ borderTop: '1px solid #F0EEE5' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo}</td>
              <td style={tdStyle}>{f.cantidad_picks}</td>
              <td style={tdStyle}><span style={{ ...badgeStyle, background: COLOR_ROTACION[f.rotacion] }}>{f.rotacion}</span></td>
              <td style={tdStyle}>{f.claseActual ? <BadgeClase clase={f.claseActual} mostrarCE={false} /> : '—'}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{f.pasilloActual ? formatearPosicion(f.pasilloActual, f.columnaActual) : '—'}</td>
              <td style={tdStyle}>{f.estado}</td>
              <td style={{ ...tdStyle, fontSize: 11.5, color: '#6E7A72', maxWidth: 260 }}>{f.recomendacion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const dropStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, width: 180, minHeight: 74, border: '2px dashed #C8C2B4', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: '#6E7A72' };
const theadRow = { textAlign: 'left', color: '#9A9684', fontSize: 11, textTransform: 'uppercase' };
const thStyle = { padding: '6px 8px', borderBottom: '1px solid #EAECEF' };
const tdStyle = { padding: '7px 8px' };
const h3Style = { fontSize: 14, fontWeight: 700, color: '#1C3A3E' };
const badgeStyle = { display: 'inline-block', minWidth: 22, textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 };
