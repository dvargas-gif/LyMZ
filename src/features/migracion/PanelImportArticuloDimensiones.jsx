import { useState } from 'react';
import * as XLSX from 'xlsx';
import { parsearFilasDimensiones, validarDimensiones } from './articuloDimensiones.js';
import { articuloDimensionesService } from '../../shared/services/articuloDimensiones.service.js';

/**
 * Import de dimensiones reales por artículo (sesión 2026-07-21) -- mismo
 * patrón que PanelImportIdentidadLegacy.jsx: subir archivo, previsualizar
 * con reporte de rechazadas ANTES de aplicar, aplicar en lote.
 *
 * El volumen NUNCA se sube desde el archivo -- Postgres lo calcula solo
 * (columna generada) a partir de largo/ancho/alto/cantidad máxima, así que
 * no puede volver a quedar desactualizado como pasó con la columna
 * "Volumen" del Excel de referencia.
 *
 * Contenido de una pestaña de PanelImportMigracion.jsx (2026-07-22) -- ya
 * no es su propio modal, no recibe `onCerrar`.
 */
export default function PanelImportArticuloDimensiones({ sesion }) {
  const [previa, setPrevia] = useState(null); // { filas, validas, rechazadas }
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // { aplicados, rechazados }
  const [hojaLeida, setHojaLeida] = useState(null);

  function procesarFilas(filasCrudas) {
    setError('');
    setResultado(null);
    const parsed = parsearFilasDimensiones(filasCrudas);
    if (parsed.length === 0) {
      setError('El archivo no tiene filas de datos (¿le falta el encabezado "Código Articulo" en la primera fila?).');
      return;
    }
    setPrevia(validarDimensiones(parsed));
  }

  function manejarArchivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const lector = new FileReader();
    lector.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const nombreHoja = wb.SheetNames[0];
        setHojaLeida(nombreHoja);
        const hoja = wb.Sheets[nombreHoja];
        procesarFilas(XLSX.utils.sheet_to_json(hoja, { defval: '' }));
      } catch {
        setError('No se pudo leer el archivo. Probá exportarlo de nuevo como .xlsx o .csv.');
      }
    };
    lector.readAsBinaryString(file);
    e.target.value = '';
  }

  async function aplicar() {
    if (!previa || previa.validas.length === 0) return;
    setAplicando(true);
    setError('');
    try {
      await articuloDimensionesService.guardarLote(previa.validas, sesion.usuarioId);
      setResultado({ aplicados: previa.validas.length, rechazados: previa.rechazadas.length });
      setPrevia(null);
    } catch (err) {
      setError(`No se pudo aplicar el import: ${err.message || err}`);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
        Subí el archivo con <b>Código Articulo</b>, <b>Largo</b>, <b>Ancho</b>, <b>Alto</b> (cm) y la cantidad máxima
        real por posición. El volumen se calcula solo, del lado de la base -- no se sube ni se guarda ningún
        "Volumen" del archivo.
      </p>

      {!previa && !resultado && (
        <label style={dropStyle}>
          <i className="ti ti-file-spreadsheet" style={{ fontSize: 22, color: 'var(--accent)' }} />
          <span>Subir Excel / CSV</span>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={manejarArchivo} style={{ display: 'none' }} />
        </label>
      )}

      {hojaLeida && previa && (
        <p style={{ fontSize: 11.5, color: 'var(--texto-placeholder)', marginTop: 8 }}>
          Hoja leída del archivo: <b>{hojaLeida}</b>
        </p>
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{error}</p>}

      {resultado && (
        <div style={{ background: 'var(--verde-tenue)', border: '1px solid var(--green)', borderRadius: 10, padding: 14, marginTop: 14 }}>
          <b style={{ color: 'var(--green)' }}>✓ Se importaron {resultado.aplicados} artículo(s)</b>
          {resultado.rechazados > 0 && (
            <span style={{ color: 'var(--texto-tenue)', fontSize: 12.5 }}>
              {' '}— {resultado.rechazados} fila(s) se dejaron afuera (ver el detalle antes de corregirlas y volver a subir).
            </span>
          )}
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => { setResultado(null); setHojaLeida(null); }}>Importar otro archivo</button>
          </div>
        </div>
      )}

      {previa && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12.5, flexWrap: 'wrap' }}>
            <span>Total en el archivo: <b>{previa.filas.length}</b></span>
            <span>✅ Válidas: <b>{previa.validas.length}</b></span>
            <span>⚠ Rechazadas: <b style={{ color: previa.rechazadas.length ? 'var(--red)' : 'inherit' }}>{previa.rechazadas.length}</b></span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button className="btn-primary" disabled={aplicando || previa.validas.length === 0} onClick={aplicar}>
              {aplicando ? 'Importando…' : `Importar ${previa.validas.length} artículo(s) válido(s)`}
            </button>
            <button className="btn-secondary" disabled={aplicando} onClick={() => { setPrevia(null); setHojaLeida(null); }}>Cancelar</button>
          </div>

          {previa.rechazadas.length > 0 && <TablaRechazadas filas={previa.rechazadas} />}
        </div>
      )}
    </div>
  );
}

function TablaRechazadas({ filas }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--red)', marginBottom: 6 }}>
        Filas rechazadas
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={theadRow}>
          <th style={thStyle}>Fila</th><th style={thStyle}>Artículo</th><th style={thStyle}>Motivo</th>
        </tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.fila} style={{ borderTop: '1px solid var(--borde-sutil)', background: 'var(--rojo-tenue)' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.fila}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo || '—'}</td>
              <td style={{ ...tdStyle, color: 'var(--red)', fontSize: 11.5 }}>{f.motivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const dropStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, width: 200, minHeight: 74, border: '2px dashed var(--borde-medio)', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, color: 'var(--texto-tenue)' };
const theadRow = { textAlign: 'left', color: 'var(--texto-placeholder)', fontSize: 11, textTransform: 'uppercase' };
const thStyle = { padding: '6px 8px', borderBottom: '1px solid var(--line)' };
const tdStyle = { padding: '7px 8px' };
