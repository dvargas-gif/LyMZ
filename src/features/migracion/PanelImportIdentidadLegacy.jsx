import { useState } from 'react';
import * as XLSX from 'xlsx';
import { parsearFilasIdentidad, validarIdentidadLegacy } from './identidadLegacy.service.js';
import { identidadLegacyService } from '../../shared/services/identidadLegacy.service.js';

/**
 * Import de la tabla maestra RCL<->MZ por SUB-POSICIÓN (F1 de la migración
 * de nomenclatura) -- mismo patrón que PanelCargaMasiva.jsx: subir archivo,
 * previsualizar con reporte de rechazadas ANTES de aplicar, aplicar en
 * lote. A diferencia de carga masiva, acá el formato de columnas es fijo
 * (headers "MZ"/"RCL" exactos, sin sinónimos) porque es un archivo que arma
 * una sola persona a mano, no un Excel externo variable -- ver
 * identidadLegacy.service.js.
 *
 * Contenido de una pestaña de PanelImportMigracion.jsx (2026-07-22) -- ya
 * no es su propio modal, no recibe `onCerrar`.
 */
const UNIVERSO_ESPERADO = 1550; // universo total de sub-posiciones del archivo real del cliente -- solo informativo, no bloquea nada

// El archivo real del cliente trae 3 hojas ("Migracion RCL - MZ", "Inventario",
// "Art x RCL" -- las últimas 2 son F1.5-B/C, no se cargan todavía). Se busca
// esta hoja por NOMBRE EXACTO -- nunca "la primera hoja del libro", porque no
// hay garantía de que el cliente la deje primera en su Excel.
const NOMBRE_HOJA_IDENTIDAD = 'Migracion RCL - MZ';

export default function PanelImportIdentidadLegacy({ sesion }) {
  const [previa, setPrevia] = useState(null); // { filas, validas, rechazadas }
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // { aplicados, rechazados }
  const [hojaLeida, setHojaLeida] = useState(null); // nombre real de la hoja que se terminó leyendo -- transparencia, no un dato funcional

  async function procesarFilas(filasCrudas) {
    setError('');
    setResultado(null);
    const parsed = parsearFilasIdentidad(filasCrudas);
    if (parsed.length === 0) {
      setError('El archivo no tiene filas de datos (¿le faltan los headers "MZ" y "RCL" en la primera fila?).');
      return;
    }
    setCargando(true);
    try {
      const existentes = await identidadLegacyService.listar();
      setPrevia(validarIdentidadLegacy(parsed, existentes));
    } catch (err) {
      setError(`No se pudo comparar contra la base: ${err.message || err}`);
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
        // Preferí la hoja "Migracion RCL - MZ" si existe (caso real, libro con
        // varias hojas) -- si no (ej. un CSV de una sola hoja, o el nombre no
        // calzó), caé a la primera hoja del libro como antes.
        const nombreHoja = wb.SheetNames.includes(NOMBRE_HOJA_IDENTIDAD) ? NOMBRE_HOJA_IDENTIDAD : wb.SheetNames[0];
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
    try {
      await identidadLegacyService.guardarLote(previa.validas, sesion.usuarioId);
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
        Subí el archivo con dos columnas — headers exactos <b>MZ</b> y <b>RCL</b> — con el formato de sub-posición
        <code style={{ margin: '0 4px' }}>MZ01-C001-N01-1</code> / <code>RCL112-C001-N01-1</code>. Podés volver a
        subir el mismo archivo corregido las veces que haga falta: re-importar la misma sub-posición actualiza su
        RCL en vez de rechazarla.
      </p>

      {!previa && !resultado && (
        <label style={dropStyle}>
          <i className="ti ti-file-spreadsheet" style={{ fontSize: 22, color: 'var(--accent)' }} />
          <span>Subir Excel / CSV</span>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={manejarArchivo} style={{ display: 'none' }} />
        </label>
      )}

      {hojaLeida && (previa || cargando) && (
        <p style={{ fontSize: 11.5, color: 'var(--texto-placeholder)', marginTop: 8 }}>
          Hoja leída del archivo: <b>{hojaLeida}</b>
        </p>
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{error}</p>}
      {cargando && <p style={{ textAlign: 'center', color: 'var(--texto-placeholder)', padding: 20 }}>Comparando contra la base…</p>}

      {resultado && (
        <div style={{ background: 'var(--verde-tenue)', border: '1px solid var(--green)', borderRadius: 10, padding: 14, marginTop: 14 }}>
          <b style={{ color: 'var(--green)' }}>✓ Se importaron {resultado.aplicados} posición(es)</b>
          {resultado.rechazados > 0 && (
            <span style={{ color: 'var(--texto-tenue)', fontSize: 12.5 }}>
              {' '}— {resultado.rechazados} fila(s) se dejaron afuera (ver el detalle en el archivo antes de corregirlo y volver a subirlo).
            </span>
          )}
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => { setResultado(null); setHojaLeida(null); }}>Importar otro archivo</button>
          </div>
        </div>
      )}

      {previa && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 11.5, color: 'var(--texto-placeholder)', marginBottom: 8 }}>
            Total en el archivo: {previa.filas.length} / esperadas: {UNIVERSO_ESPERADO}
            {previa.filas.length !== UNIVERSO_ESPERADO && ' (no bloquea el import, solo es informativo)'}
          </p>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12.5, flexWrap: 'wrap' }}>
            <span>✅ Asignadas con RCL: <b>{previa.validas.filter(f => f.estadoRcl === 'asignado').length}</b></span>
            <span>⏳ Pendiente de asignar (*): <b>{previa.validas.filter(f => f.estadoRcl === 'pendiente_asignar').length}</b></span>
            <span>— Sin RCL (N/A o vacío): <b>{previa.validas.filter(f => f.estadoRcl === 'sin_rcl').length}</b></span>
            <span>⚠ Rechazadas: <b style={{ color: previa.rechazadas.length ? 'var(--red)' : 'inherit' }}>{previa.rechazadas.length}</b></span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button className="btn-primary" disabled={aplicando || previa.validas.length === 0} onClick={aplicar}>
              {aplicando ? 'Importando…' : `Importar ${previa.validas.length} fila(s) válida(s)`}
            </button>
            <button className="btn-secondary" disabled={aplicando} onClick={() => { setPrevia(null); setHojaLeida(null); }}>Cancelar</button>
          </div>

          {previa.rechazadas.length > 0 && (
            <TablaRechazadas filas={previa.rechazadas} />
          )}
          {previa.validas.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--texto-tenue)' }}>
                Ver las {previa.validas.length} fila(s) válida(s)
              </summary>
              <TablaValidas filas={previa.validas} />
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/** El reporte que más se va a usar mientras se arma la tabla a mano -- fila de Excel + valor crudo + motivo exacto del rechazo, para corregir sin adivinar. */
function TablaRechazadas({ filas }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--red)', marginBottom: 6 }}>
        Filas rechazadas
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={theadRow}>
          <th style={thStyle}>Fila</th><th style={thStyle}>MZ</th><th style={thStyle}>RCL</th><th style={thStyle}>Motivo</th>
        </tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.fila} style={{ borderTop: '1px solid var(--borde-sutil)', background: 'var(--rojo-tenue)' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.fila}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.mzTexto || '—'}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.rclTexto || '—'}</td>
              <td style={{ ...tdStyle, color: 'var(--red)', fontSize: 11.5 }}>{f.motivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ETIQUETA_ESTADO = {
  asignado: 'Asignado',
  pendiente_asignar: 'Pendiente de asignar (*)',
  sin_rcl: 'Sin RCL',
};

function TablaValidas({ filas }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={theadRow}>
          <th style={thStyle}>Fila</th><th style={thStyle}>MZ</th><th style={thStyle}>RCL</th><th style={thStyle}>Estado</th>
        </tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.fila} style={{ borderTop: '1px solid var(--borde-sutil)' }}>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.fila}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.mzPasillo}-C{String(f.mzColumna).padStart(3, '0')}-N{String(f.mzNivel).padStart(2, '0')}-{f.mzSubnivel}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.rclCodigo ? `${f.rclCodigo}-N${String(f.rclNivel).padStart(2, '0')}-${f.rclSubnivel}` : '—'}</td>
              <td style={tdStyle}>{ETIQUETA_ESTADO[f.estadoRcl]}</td>
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
