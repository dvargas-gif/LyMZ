import { useState } from 'react';
import * as XLSX from 'xlsx';
import { parsearFilasInventario, validarInventarioRcl, resolverEstadoYaMigrado } from './inventarioRcl.service.js';
import { inventarioRclService } from '../../shared/services/inventarioRcl.service.js';
import { migracionMovimientosService } from '../../shared/services/migracionMovimientos.service.js';
import { migracionYaMigradoService } from '../../shared/services/migracionYaMigrado.service.js';

/**
 * Import del inventario ACTUAL por sub-posición RCL (F1.5-B, hoja
 * "Inventario") -- mismo patrón que PanelImportIdentidadLegacy.jsx: subir
 * archivo, previsualizar con reporte de rechazadas, aplicar en lote. A
 * diferencia de esa pantalla, acá NO se compara contra "lo que ya existe"
 * (re-importar la misma sub-posición actualiza su cantidad -- es un
 * snapshot que se recarga periódicamente, "actualizarlo" en palabras del
 * usuario, no una tabla que se arma una sola vez).
 *
 * Contenido de una pestaña de PanelImportMigracion.jsx (2026-07-22) -- ya
 * no es su propio modal, no recibe `onCerrar`.
 */
export default function PanelImportInventarioRcl({ sesion }) {
  const [previa, setPrevia] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [yaMigrado, setYaMigrado] = useState(null); // null = no hay filas "ya migrado" en este archivo o todavía no se resolvió
  const [cargandoYaMigrado, setCargandoYaMigrado] = useState(false);
  const [aplicandoYaMigrado, setAplicandoYaMigrado] = useState(false);
  const [yaMigradoAplicado, setYaMigradoAplicado] = useState(null);

  async function procesarFilas(filasCrudas) {
    setError('');
    setResultado(null);
    setYaMigrado(null);
    setYaMigradoAplicado(null);
    const parsed = parsearFilasInventario(filasCrudas);
    if (parsed.length === 0) {
      setError('El archivo no tiene filas de datos reconocibles (¿tiene columnas de RCL/posición, artículo y cantidad?).');
      return;
    }
    const validado = validarInventarioRcl(parsed);
    setPrevia(validado);

    // Check "ya migrado" (2026-08-25, permanente en cada carga, pedido explícito):
    // filas cuya ubicación viene en formato MZ en vez de RCL -- el artículo ya se
    // movió físicamente, se cruza contra migracion_movimientos para saber si el
    // sistema ya lo tiene confirmado o no.
    if (validado.yaMigrado.length > 0) {
      setCargandoYaMigrado(true);
      try {
        const estados = await migracionMovimientosService.buscarEstadoPorDestinoYArticulo(
          validado.yaMigrado.map(f => ({ mzPasillo: f.mzPasillo, mzColumna: f.mzColumna, articulo: f.articulo }))
        );
        setYaMigrado(resolverEstadoYaMigrado(validado.yaMigrado, estados));
      } catch (err) {
        setError(`No se pudo cruzar las filas "ya migrado" contra el sistema: ${err.message || err}`);
      } finally {
        setCargandoYaMigrado(false);
      }
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

  /**
   * Reconciliación "ya migrado" (2026-08-25, decisión de negocio confirmada
   * con David -- ver PROTOCOLO-GOBERNANZA.md Regla 2, dos veredictos, dos
   * acciones distintas):
   * - 'pendiente_para_confirmar': ya existía un movimiento planeado -- se
   *   marca 'recolectado' con el mismo método que usa el flujo guiado
   *   normal (marcarRecolectado), no se inventa un camino nuevo.
   * - 'confirmado' / 'requiere_revision_manual' / 'sin_registro': NUNCA se
   *   toca `migracion_movimientos` -- solo queda registrado como hallazgo.
   * Todo caso, sin excepción, deja su rastro en migracion_ya_migrado
   * (tabla de auditoría aparte, ver migracionYaMigrado.service.js).
   */
  async function aplicarYaMigrado() {
    if (!yaMigrado || yaMigrado.length === 0) return;
    setAplicandoYaMigrado(true);
    setError('');
    try {
      const paraConfirmar = yaMigrado.filter(f => f.veredicto === 'pendiente_para_confirmar' && f.movimientoId);
      await Promise.all(paraConfirmar.map(f => migracionMovimientosService.marcarRecolectado(f.movimientoId, sesion.usuarioId)));

      const filasConAccion = yaMigrado.map(f => ({
        ...f,
        accionTomada: f.veredicto === 'pendiente_para_confirmar' ? 'marcado_recolectado' : 'ninguna_solo_hallazgo',
      }));
      await migracionYaMigradoService.registrarLote(filasConAccion, sesion.usuarioId);

      setYaMigradoAplicado({
        marcadosRecolectado: paraConfirmar.length,
        hallazgos: yaMigrado.length - paraConfirmar.length,
      });
    } catch (err) {
      setError(`No se pudo aplicar la reconciliación "ya migrado": ${err.message || err}`);
    } finally {
      setAplicandoYaMigrado(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
        Subí el archivo de inventario actual por posición RCL — columnas de RCL/posición, artículo y cantidad
        (los nombres de columna son flexibles, no hace falta que coincidan exacto). Podés volver a subirlo cuando
        se actualice: cada sub-posición se actualiza con la cantidad más reciente, nunca se acumula. Si un mismo
        artículo aparece varias veces en la misma sub-posición (varios pallets), se suman automáticamente en una
        sola fila -- no se rechaza.
      </p>

      {!previa && !resultado && (
        <label className="zona-carga" style={{ width: 200 }}>
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
            {previa.yaMigrado.length > 0 && (
              <span>🚚 Ya migrado: <b style={{ color: 'var(--amber, #b98900)' }}>{previa.yaMigrado.length}</b></span>
            )}
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
            <button className="btn-secondary" disabled={aplicando} onClick={() => { setPrevia(null); setYaMigrado(null); setYaMigradoAplicado(null); }}>Cancelar</button>
          </div>
          {previa.yaMigrado.length > 0 && (
            <TablaYaMigrado
              filas={previa.yaMigrado}
              resuelto={yaMigrado}
              cargando={cargandoYaMigrado}
              aplicando={aplicandoYaMigrado}
              aplicado={yaMigradoAplicado}
              onAplicar={aplicarYaMigrado}
            />
          )}
          {previa.rechazadas.filter(f => !f.yaMigrado).length > 0 && <TablaRechazadas filas={previa.rechazadas.filter(f => !f.yaMigrado)} />}
        </div>
      )}
    </div>
  );
}

const VEREDICTO_INFO = {
  confirmado: { icono: '✓', texto: 'Confirmado, ya recolectado', color: 'var(--green)' },
  pendiente_para_confirmar: { icono: '⚠', texto: 'Planeado, sin confirmar -- se marca recolectado al aplicar', color: 'var(--amber, #b98900)' },
  requiere_revision_manual: { icono: '⚠', texto: 'Ambiguo -- revisar a mano (no se toca solo)', color: 'var(--red)' },
  sin_registro: { icono: '⚠', texto: 'Sin ningún movimiento planeado -- queda como hallazgo', color: 'var(--red)' },
};

/**
 * Filas rechazadas por venir con ubicación en formato MZ en vez de RCL --
 * señal de que el artículo ya se movió físicamente (2026-08-25, pedido
 * explícito: "esto con cada carga de inventario nuevo"). Se cruzan contra
 * migracion_movimientos (ver PanelImportInventarioRcl/procesarFilas) para
 * decir si el sistema ya sabe esto o no -- nunca se aplican como sub-posición
 * RCL (no lo son), solo informan.
 *
 * "Aplicar reconciliación" es una acción APARTE del import principal (decisión
 * de negocio 2026-08-25, ver aplicarYaMigrado en el componente padre): solo
 * marca 'recolectado' los casos 'pendiente_para_confirmar' -- el resto queda
 * como hallazgo en migracion_ya_migrado, nunca se toca migracion_movimientos.
 */
function TablaYaMigrado({ filas, resuelto, cargando, aplicando, aplicado, onAplicar }) {
  const porFila = new Map((resuelto ?? []).map(r => [r.fila, r]));
  const paraConfirmar = (resuelto ?? []).filter(r => r.veredicto === 'pendiente_para_confirmar').length;
  return (
    <div style={{ overflowX: 'auto', marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--amber, #b98900)', marginBottom: 6 }}>
        🚚 Ya migrado -- ubicación en formato MZ, no RCL
      </div>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 8 }}>
        Estas filas no se pueden aplicar como sub-posición RCL (ya no lo son), pero indican que el artículo ya
        está físicamente en el MZ nuevo. {cargando ? 'Cruzando contra el sistema…' : 'Estado según lo que el sistema tiene registrado:'}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={theadRow}>
          <th style={thStyle}>Fila</th><th style={thStyle}>Ubicación MZ</th><th style={thStyle}>Artículo</th><th style={thStyle}>Cantidad</th><th style={thStyle}>Estado</th>
        </tr></thead>
        <tbody>
          {filas.map(f => {
            const info = cargando ? null : VEREDICTO_INFO[porFila.get(f.fila)?.veredicto];
            return (
              <tr key={f.fila} style={{ borderTop: '1px solid var(--borde-sutil)', background: 'var(--amarillo-tenue, #fff8e6)' }}>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.fila}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.rclTexto}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo || '—'}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.cantidadTexto || '—'}</td>
                <td style={{ ...tdStyle, color: info?.color, fontSize: 11.5, fontWeight: 600 }}>
                  {cargando ? '…' : `${info.icono} ${info.texto}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!cargando && !aplicado && (
        <div style={{ marginTop: 10 }}>
          <button className="btn-secondary" disabled={aplicando || !resuelto} onClick={onAplicar}>
            {aplicando ? 'Aplicando…' : `Aplicar reconciliación (${paraConfirmar} para marcar recolectado, resto queda como hallazgo)`}
          </button>
        </div>
      )}
      {aplicado && (
        <p style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 10 }}>
          ✓ {aplicado.marcadosRecolectado} movimiento(s) marcado(s) recolectado, {aplicado.hallazgos} fila(s) registrada(s) solo como hallazgo.
        </p>
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

const theadRow = { textAlign: 'left', color: 'var(--texto-placeholder)', fontSize: 11, textTransform: 'uppercase' };
const thStyle = { padding: '6px 8px', borderBottom: '1px solid var(--line)' };
const tdStyle = { padding: '7px 8px' };
