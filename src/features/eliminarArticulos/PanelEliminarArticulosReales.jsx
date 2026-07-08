import { useState } from 'react';
import * as XLSX from 'xlsx';
import { reporteService } from '../reportes/reporte.service.js';
import { posicionesEliminadasService } from '../../shared/services/posicionesEliminadas.service.js';
import { auditService } from '../auditoria/audit.service.js';
import { ACCIONES } from '../auditoria/audit.schema.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

/** Busca la primera columna cuyo encabezado (sin espacios/mayúsculas) empiece con el prefijo dado -- tolera "Articulo ", "Derscripcion " (typo real del archivo), etc. sin acoplarse a un encabezado exacto. */
function valorPorPrefijo(fila, prefijo) {
  for (const [clave, valor] of Object.entries(fila)) {
    if (clave.trim().toLowerCase().startsWith(prefijo)) return valor != null ? String(valor).trim() : '';
  }
  return '';
}

/**
 * Panel admin (Administrador únicamente, ver roles.js) para sacar del mapa
 * REAL un lote de artículos que se reubican a otra área -- hasta ahora esto
 * solo existía para salas de simulación (escenarioEliminados.service.js).
 * Mismo patrón de 3 pasos que PanelCargaMasiva (subir Excel -> previsualizar
 * contra el estado actual -> confirmar), pero para ELIMINAR en vez de mover:
 * el cruce usa reporteService.obtener(null) para saber qué artículos del
 * Excel existen hoy en el mapa real antes de tocar nada.
 */
export default function PanelEliminarArticulosReales({ sesion, onCerrar }) {
  const [paso, setPaso] = useState('subir'); // 'subir' | 'previa' | 'resultado'
  const [motivo, setMotivo] = useState('Reubicación a otra área (reducir sobresaturación del Mezzanine)');
  const [previa, setPrevia] = useState(null); // {encontrados:[...], noEncontrados:[...]}
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function manejarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    const lector = new FileReader();
    lector.onload = async ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
        const articulos = [...new Set(
          filas.map(f => valorPorPrefijo(f, 'articul')).filter(Boolean)
        )];
        if (articulos.length === 0) {
          setError('No se encontró ninguna columna "Artículo" reconocible en el archivo.');
          return;
        }
        await cruzarContraElMapa(articulos, filas);
      } catch {
        setError('No se pudo leer el archivo. Probá exportarlo de nuevo como .xlsx o .csv.');
      }
    };
    lector.readAsBinaryString(file);
    e.target.value = '';
  }

  async function cruzarContraElMapa(articulos, filasCrudas) {
    setCargando(true);
    try {
      const descripcionPorArticulo = new Map(filasCrudas.map(f => [valorPorPrefijo(f, 'articul'), valorPorPrefijo(f, 'desc') || valorPorPrefijo(f, 'derscrip')]));
      const estadoActual = await reporteService.obtener(null); // mapa real, nunca una sala
      const porArticulo = new Map(estadoActual.map(r => [r.articulo, r]));

      const encontrados = [];
      const noEncontrados = [];
      for (const articulo of articulos) {
        const actual = porArticulo.get(articulo);
        if (actual) {
          encontrados.push({ articulo, descripcionExcel: descripcionPorArticulo.get(articulo) || '', pasillo: actual.pasillo, columna: actual.columna, nivel: actual.nivel, descripcionSistema: actual.descripcion });
        } else {
          noEncontrados.push({ articulo, descripcionExcel: descripcionPorArticulo.get(articulo) || '' });
        }
      }
      setPrevia({ encontrados, noEncontrados });
      setPaso('previa');
    } catch (err) {
      setError(`No se pudo cruzar contra el mapa real: ${err.message || err}`);
    } finally {
      setCargando(false);
    }
  }

  async function confirmarEliminacion() {
    if (!previa || previa.encontrados.length === 0) return;
    if (!motivo.trim()) { setError('Escribí un motivo -- queda en la auditoría de cada artículo.'); return; }
    if (!confirm(`Vas a sacar ${previa.encontrados.length} artículo(s) del MAPA REAL. Esto no tiene un "deshacer" con un solo click (hay que revertirlo a mano en Supabase). ¿Confirmás?`)) return;

    setAplicando(true);
    setError('');
    try {
      const articulos = previa.encontrados.map(f => f.articulo);
      await posicionesEliminadasService.marcarEliminados(articulos, sesion.usuarioId, motivo.trim());
      await Promise.all(previa.encontrados.map(f => auditService.registrar({
        usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
        accion: ACCIONES.ADMIN, articulo: f.articulo,
        rackOrigen: `${f.pasillo}-C${String(f.columna).padStart(3, '0')}`, nivelOrigen: f.nivel,
        observaciones: `Eliminado del mapa real -- ${motivo.trim()}`,
      })));
      setResultado({ aplicados: previa.encontrados.length, noEncontrados: previa.noEncontrados.length });
      setPaso('resultado');
    } catch (err) {
      setError(`No se pudo aplicar la eliminación: ${err.message || err}`);
    } finally {
      setAplicando(false);
    }
  }

  function descargarReporte() {
    const filasEliminados = [['Articulo', 'Descripcion', 'Pasillo', 'Columna', 'Nivel', 'Motivo']];
    previa.encontrados.forEach(f => filasEliminados.push([f.articulo, f.descripcionSistema || f.descripcionExcel, f.pasillo, f.columna, f.nivel, motivo.trim()]));
    const filasNoEncontrados = [['Articulo', 'Descripcion (Excel)']];
    previa.noEncontrados.forEach(f => filasNoEncontrados.push([f.articulo, f.descripcionExcel]));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasEliminados), 'Eliminados');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasNoEncontrados), 'No encontrados');
    XLSX.writeFile(wb, 'Reporte_eliminacion_mezzanine.xlsx');
  }

  function reiniciar() {
    setPaso('subir'); setPrevia(null); setResultado(null); setError('');
  }

  return (
    <ModalBase titulo="🗑️ Eliminar artículos del mapa real" onCerrar={onCerrar} maxWidth={900} maxHeight="88vh" scrollContenido>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
        Para artículos que se reubican FUERA del Mezzanine (a otra área no controlada por este sistema).
        Subí un Excel/CSV con una columna de artículo -- se cruza contra el mapa real antes de tocar nada.
      </p>

      {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

      {paso === 'subir' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={dropStyle}>
            <i className="ti ti-file-spreadsheet" style={{ fontSize: 22, color: 'var(--accent)' }} />
            <span>{cargando ? 'Cruzando contra el mapa real…' : 'Subir Excel / CSV'}</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={manejarArchivo} disabled={cargando} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {paso === 'previa' && previa && (
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12.5 }}>
            <span>✅ Se van a eliminar: <b>{previa.encontrados.length}</b></span>
            <span>⚠ No encontrados en el mapa real: <b style={{ color: previa.noEncontrados.length ? 'var(--red)' : 'inherit' }}>{previa.noEncontrados.length}</b></span>
          </div>

          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-oscuro)', display: 'block', marginBottom: 6 }}>Motivo (queda en auditoría)</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...selectStyle, marginBottom: 14 }} />

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button className="btn-primary" disabled={aplicando || previa.encontrados.length === 0} onClick={confirmarEliminacion}>
              {aplicando ? 'Aplicando…' : `Eliminar ${previa.encontrados.length} artículo(s)`}
            </button>
            <button className="btn-secondary" disabled={aplicando} onClick={reiniciar}>Cancelar</button>
          </div>

          <TablaPrevia titulo={`A eliminar (${previa.encontrados.length})`} filas={previa.encontrados} columnas={['articulo', 'descripcionSistema', 'pasillo', 'columna', 'nivel']} />
          {previa.noEncontrados.length > 0 && (
            <TablaPrevia titulo={`No encontrados en el mapa real (${previa.noEncontrados.length}) -- no se tocan`} filas={previa.noEncontrados} columnas={['articulo', 'descripcionExcel']} />
          )}
        </div>
      )}

      {paso === 'resultado' && resultado && (
        <div>
          <div style={{ background: 'var(--verde-tenue)', border: '1px solid var(--green)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <b style={{ color: 'var(--green)' }}>✓ Se eliminaron {resultado.aplicados} artículo(s) del mapa real</b>
            {resultado.noEncontrados > 0 && <span style={{ color: 'var(--texto-tenue)', fontSize: 12.5 }}> — {resultado.noEncontrados} no estaban en el mapa real y se dejaron sin tocar.</span>}
          </div>
          <button className="btn-primary" onClick={descargarReporte}><i className="ti ti-download" /> Descargar reporte (.xlsx)</button>
        </div>
      )}
    </ModalBase>
  );
}

function TablaPrevia({ titulo, filas, columnas }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-placeholder)', marginBottom: 6 }}>{titulo}</div>
      <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={theadRow}>{columnas.map(c => <th key={c} style={thStyle}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--borde-sutil)' }}>
                {columnas.map(c => <td key={c} style={{ ...tdStyle, fontFamily: c === 'articulo' ? 'monospace' : 'inherit' }}>{f[c] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const dropStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, width: 220, minHeight: 74, border: '2px dashed var(--borde-medio)', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: 'var(--texto-tenue)' };
const selectStyle = { fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--borde-input)', fontFamily: 'inherit', width: '100%' };
const theadRow = { textAlign: 'left', color: 'var(--texto-placeholder)', fontSize: 11, textTransform: 'uppercase' };
const thStyle = { padding: '6px 8px', borderBottom: '1px solid var(--line)' };
const tdStyle = { padding: '7px 8px' };
