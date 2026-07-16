import { useState } from 'react';
import * as XLSX from 'xlsx';
import { parsearFilasInventario, validarInventarioRcl } from './inventarioRcl.service.js';
import { inventarioRclService } from '../../shared/services/inventarioRcl.service.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

/**
 * Import del inventario ACTUAL por sub-posición RCL (F1.5-B, hoja
 * "Inventario") -- mismo patrón que PanelImportIdentidadLegacy.jsx: subir
 * archivo, previsualizar con reporte de rechazadas, aplicar en lote. A
 * diferencia de esa pantalla, acá NO se compara contra "lo que ya existe"
 * (re-importar la misma sub-posición actualiza su cantidad -- es un
 * snapshot que se recarga periódicamente, "actualizarlo" en palabras del
 * usuario, no una tabla que se arma una sola vez).
 */
export default function PanelImportInventarioRcl({ sesion, onCerrar }) {
  const [previa, setPrevia] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  function procesarFilas(filasCrudas) {
    setError('');
    setResultado(null);
    const parsed = parsearFilasInventario(filasCrudas);
    if (parsed.length === 0) {
      setError('El archivo no tiene filas de datos reconocibles (¿tiene columnas de RCL/posición, artículo y cantidad?).');
      return;
    }
    setPrevia(validarInventarioRcl(parsed));
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

  async function aplicar() {
    if (!previa || previa.validas.length === 0) return;
    setAplicando(true);
    try {
      await inventarioRclService.guardarLote(previa.validas, sesion.usuarioId);
      setResultado({ aplicados: previa.validas.length, rechazados: previa.rechazadas.length });
      setPrevia(null);
    } catch (err) {
      setError(`No se pudo aplicar el import: ${err.message || err}`);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <ModalBase titulo="📦 Importar inventario actual (RCL)" onCerrar={onCerrar} maxWidth={880} maxHeight="88vh" scrollContenido>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
        Subí el archivo de inventario actual por posición RCL — columnas de RCL/posición, artículo y cantidad
        (los nombres de columna son flexibles, no hace falta que coincidan exacto). Podés volver a subirlo cuando
        se actualice: cada sub-posición se actualiza con la cantidad más reciente, nunca se acumula. Si un mismo
        artículo aparece varias veces en la misma sub-posición (varios pallets), se suman automáticamente en una
        sola fila -- no se rechaza.
      </p>

      {!previa && !resultado && (
        <label style={dropStyle}>
          <i className="ti ti-file-spreadsheet" style={{ fontSize: 22, color: 'var(--accent)' }} />
          <span>Subir Excel / CSV</span>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={manejarArchivo} style={{ display: 'none' }} />
        </label>
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{error}</p>}

      {resultado && (
        <div style={{ background: 'var(--verde-tenue)', border: '1px solid var(--green)', borderRadius: 10, padding: 14, marginTop: 14 }}>
          <b style={{ color: 'var(--green)' }}>✓ Se actualizaron {resultado.aplicados} sub-posición(es)</b>
          {resultado.rechazados > 0 && (
            <span style={{ color: 'var(--texto-tenue)', fontSize: 12.5 }}> — {resultado.rechazados} fila(s) se dejaron afuera.</span>
          )}
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => setResultado(null)}>Importar otro archivo</button>
          </div>
        </div>
      )}

      {previa && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12.5 }}>
            <span>✅ Válidas: <b>{previa.validas.length}</b></span>
            <span>⚠ Rechazadas: <b style={{ color: previa.rechazadas.length ? 'var(--red)' : 'inherit' }}>{previa.rechazadas.length}</b></span>
            {previa.validas.some(f => f.pallets > 1) && (
              <span style={{ color: 'var(--texto-tenue)' }}>
                📦 {previa.validas.filter(f => f.pallets > 1).length} sub-posición(es) combinan varios pallets del mismo artículo (cantidad sumada)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button className="btn-primary" disabled={aplicando || previa.validas.length === 0} onClick={aplicar}>
              {aplicando ? 'Actualizando…' : `Actualizar ${previa.validas.length} fila(s) válida(s)`}
            </button>
            <button className="btn-secondary" disabled={aplicando} onClick={() => setPrevia(null)}>Cancelar</button>
          </div>
          {previa.rechazadas.length > 0 && <TablaRechazadas filas={previa.rechazadas} />}
        </div>
      )}
    </ModalBase>
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
          <th style={thStyle}>Fila</th><th style={thStyle}>RCL</th><th style={thStyle}>Artículo</th><th style={thStyle}>Cantidad</th><th style={thStyle}>Motivo</th>
        </tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.fila} style={{ borderTop: '1px solid var(--borde-sutil)', background: 'var(--rojo-tenue)' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.fila}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.rclTexto || '—'}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo || '—'}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.cantidadTexto || '—'}</td>
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
