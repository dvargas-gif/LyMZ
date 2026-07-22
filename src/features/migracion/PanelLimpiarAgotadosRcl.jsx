import { useState } from 'react';
import * as XLSX from 'xlsx';
import { reporteService } from '../reportes/reporte.service.js';
import { inventarioRclService } from '../../shared/services/inventarioRcl.service.js';
import { posicionesEliminadasService } from '../../shared/services/posicionesEliminadas.service.js';
import { migracionBufferService } from '../../shared/services/migracionBuffer.service.js';
import { auditService } from '../auditoria/audit.service.js';
import { ACCIONES } from '../auditoria/audit.schema.js';
import { detectarArticulosAgotados, detectarBufferSinStock } from './articulosAgotados.js';

// "Exiliado" es un prefijo FIJO, no editable (ver PREFIJO_MOTIVO abajo) --
// el conteo corrido de "van X artículo(s) exiliados en total" cuenta por
// ese prefijo exacto (contarPorMotivoPrefijo('Exiliado')). Si el campo
// fuera 100% libre, un admin podía reescribir el motivo entero y el
// contador quedaría mal para siempre sin que nada lo avisara -- bug real
// encontrado en la revisión previa al commit.
const PREFIJO_MOTIVO = 'Exiliado';
const DETALLE_DEFAULT = 'sin stock real en el sistema viejo (consumido antes del movimiento físico)';

/** Clave estable por fila -- para el Set de seleccionados, no para identidad de React (eso ya lo maneja `key` en el .map()). */
function claveMapa(f) { return `mapa:${f.articulo}|${f.pasillo}|${f.columna}|${f.nivel}`; }
function claveBuffer(f) { return `buffer:${f.id}`; }

/**
 * Administrador únicamente (mismo permiso `eliminar_articulos` que
 * PanelEliminarArticulosReales.jsx -- misma acción de fondo, distinta forma
 * de detectar candidatos). Cruza DOS fuentes contra el inventario RCL
 * recién importado:
 *  - el mapa MZ real (`rack_actual`, todavía asignado a una posición), y
 *  - el buffer de migración (artículos ya vaciados, sin destino resuelto).
 * Un artículo cuyo origen RCL ya no tiene stock real hoy se OFRECE como
 * candidato a "exiliado" -- sacado DEL TODO del mezanine (no una
 * reubicación interna, una salida real que libera espacio). Preventivo, no
 * automático (pedido explícito del usuario): la vista previa trae TODO
 * marcado por defecto, pero cada fila tiene su propio checkbox -- se puede
 * destildar una por una para dejarla, o aplicar todo de una sola vez. Si
 * venía del buffer, además se purga esa fila (soft-delete, conserva
 * historial). Nunca se aplica solo: previsualiza, se elige, se confirma.
 *
 * Contenido de una pestaña de PanelEliminarArticulos.jsx (2026-07-22) --
 * ya no es su propio modal, no recibe `onCerrar`.
 */
export default function PanelLimpiarAgotadosRcl({ sesion }) {
  const [paso, setPaso] = useState('detectar'); // 'detectar' | 'previa' | 'resultado'
  const [modo, setModo] = useState('accion'); // 'accion' (checkboxes + exiliar) | 'consulta' (solo mirar, sin tocar nada)
  const [detalleMotivo, setDetalleMotivo] = useState(DETALLE_DEFAULT);
  const motivo = `${PREFIJO_MOTIVO} -- ${detalleMotivo.trim()}`;
  const [previa, setPrevia] = useState(null); // {agotadosMapa:[...], agotadosBuffer:[...], sinOrigenRcl:[...]}
  const [seleccionados, setSeleccionados] = useState(new Set()); // claves (ver claveMapa/claveBuffer) marcadas para exiliar
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function detectar(modoElegido = 'accion') {
    setModo(modoElegido);
    setCargando(true);
    setError('');
    try {
      const [articulosMapa, inventarioRcl, bufferItems] = await Promise.all([
        reporteService.obtener(null), // mapa real, nunca una sala
        inventarioRclService.listar(),
        migracionBufferService.listarTodo(),
      ]);
      const { agotados, sinOrigenRcl } = detectarArticulosAgotados(articulosMapa, inventarioRcl);
      const agotadosBuffer = detectarBufferSinStock(bufferItems, inventarioRcl);
      setPrevia({ agotadosMapa: agotados, agotadosBuffer, sinOrigenRcl });
      // Todo marcado por defecto -- el usuario destilda lo que quiere dejar, en vez de tener que tildar uno a uno.
      setSeleccionados(new Set([...agotados.map(claveMapa), ...agotadosBuffer.map(claveBuffer)]));
      setPaso('previa');
    } catch (err) {
      setError(`No se pudo cruzar contra el inventario RCL: ${err.message || err}`);
    } finally {
      setCargando(false);
    }
  }

  function toggleSeleccion(clave) {
    setSeleccionados(actuales => {
      const s = new Set(actuales);
      if (s.has(clave)) s.delete(clave); else s.add(clave);
      return s;
    });
  }

  function seleccionarTodos() {
    if (!previa) return;
    setSeleccionados(new Set([...previa.agotadosMapa.map(claveMapa), ...previa.agotadosBuffer.map(claveBuffer)]));
  }

  function deseleccionarTodos() {
    setSeleccionados(new Set());
  }

  const totalCandidatos = previa ? previa.agotadosMapa.length + previa.agotadosBuffer.length : 0;
  const mapaSeleccionado = previa ? previa.agotadosMapa.filter(f => seleccionados.has(claveMapa(f))) : [];
  const bufferSeleccionado = previa ? previa.agotadosBuffer.filter(f => seleccionados.has(claveBuffer(f))) : [];
  const totalSeleccionado = mapaSeleccionado.length + bufferSeleccionado.length;

  async function confirmarEliminacion() {
    if (totalSeleccionado === 0) return;
    if (!detalleMotivo.trim()) { setError('Escribí un motivo -- queda en la auditoría de cada artículo.'); return; }
    if (!confirm(`Vas a marcar ${totalSeleccionado} artículo(s) como exiliados (${mapaSeleccionado.length} del mapa, ${bufferSeleccionado.length} del buffer). Esto no tiene un "deshacer" con un solo click. ¿Confirmás?`)) return;

    setAplicando(true);
    setError('');
    try {
      const articulosUnicos = [...new Set([...mapaSeleccionado.map(f => f.articulo), ...bufferSeleccionado.map(f => f.articulo)])];
      await posicionesEliminadasService.marcarEliminados(articulosUnicos, sesion.usuarioId, motivo.trim());

      if (bufferSeleccionado.length > 0) {
        await migracionBufferService.purgarSinStock(bufferSeleccionado.map(f => f.id));
      }

      await Promise.all([
        ...mapaSeleccionado.map(f => auditService.registrar({
          usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
          accion: ACCIONES.ADMIN, articulo: f.articulo,
          rackOrigen: `${f.pasillo}-C${String(f.columna).padStart(3, '0')}`, nivelOrigen: f.nivel,
          observaciones: `Exiliado (mapa) -- ${detalleMotivo.trim()} (origen ${f.rclCodigo}-N${String(f.rclNivel).padStart(2, '0')}-${f.rclSubnivel})`,
        })),
        ...bufferSeleccionado.map(f => auditService.registrar({
          usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
          accion: ACCIONES.ADMIN, articulo: f.articulo,
          observaciones: `Exiliado (purgado del buffer) -- ${detalleMotivo.trim()} (origen ${f.origenRclCodigo}-${f.origenNivel})`,
        })),
      ]);

      const totalExiliados = await posicionesEliminadasService.contarPorMotivoPrefijo('Exiliado');
      setResultado({ aplicados: articulosUnicos.length, totalExiliados });
      setPaso('resultado');
    } catch (err) {
      setError(`No se pudo aplicar la limpieza: ${err.message || err}`);
    } finally {
      setAplicando(false);
    }
  }

  function descargarReporte() {
    const filas = [['Fuente', 'Articulo', 'Ubicacion', 'RCL_origen', 'Motivo']];
    mapaSeleccionado.forEach(f => filas.push([
      'Mapa', f.articulo, `${f.pasillo}-C${String(f.columna).padStart(3, '0')}-${f.nivel}`,
      `${f.rclCodigo}-N${String(f.rclNivel).padStart(2, '0')}-${f.rclSubnivel}`, motivo.trim(),
    ]));
    bufferSeleccionado.forEach(f => filas.push(['Buffer', f.articulo, '—', `${f.origenRclCodigo}-${f.origenNivel}`, motivo.trim()]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Exiliados');
    XLSX.writeFile(wb, 'Reporte_articulos_exiliados_rcl.xlsx');
  }

  function reiniciar() {
    setPaso('detectar'); setModo('accion'); setPrevia(null); setSeleccionados(new Set()); setResultado(null); setError('');
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
        Cruza el mapa MZ real Y el buffer de migración contra el inventario RCL importado más reciente: un artículo
        cuyo origen RCL ya no tiene stock real hoy se OFRECE como candidato a <b>exiliado</b> -- sacado del mezanine
        para liberar espacio. Nada se aplica solo: revisá la lista, destildá lo que querés dejar, y confirmá.
      </p>

      {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

      {paso === 'detectar' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" disabled={cargando} onClick={() => detectar('accion')}>
            {cargando && modo === 'accion' ? 'Cruzando…' : 'Detectar artículos sin stock real'}
          </button>
          <button className="btn-secondary" disabled={cargando} onClick={() => detectar('consulta')}>
            <i className="ti ti-eye" /> {cargando && modo === 'consulta' ? 'Cruzando…' : 'Solo ver (sin aplicar nada)'}
          </button>
        </div>
      )}

      {paso === 'previa' && previa && (
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12.5, flexWrap: 'wrap' }}>
            <span>⚠ Sin stock real -- mapa: <b style={{ color: previa.agotadosMapa.length ? 'var(--red)' : 'inherit' }}>{previa.agotadosMapa.length}</b></span>
            <span>⚠ Sin stock real -- buffer: <b style={{ color: previa.agotadosBuffer.length ? 'var(--red)' : 'inherit' }}>{previa.agotadosBuffer.length}</b></span>
            <span style={{ color: 'var(--texto-tenue)' }}>{previa.sinOrigenRcl.length} artículo(s) del mapa sin origen RCL registrado -- no se tocan</span>
          </div>

          {totalCandidatos === 0 ? (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--texto-tenue)', marginBottom: 12 }}>No se encontró ningún artículo sin stock real -- nada que limpiar por ahora.</p>
              <button className="btn-secondary" onClick={reiniciar}>Salir</button>
            </>
          ) : modo === 'consulta' ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <button className="btn-secondary" onClick={reiniciar}>← Salir</button>
              </div>
              {previa.agotadosMapa.length > 0 && (
                <TablaMapa titulo={`Del mapa (${previa.agotadosMapa.length})`} filas={previa.agotadosMapa} soloLectura />
              )}
              {previa.agotadosBuffer.length > 0 && (
                <TablaBuffer titulo={`Del buffer (${previa.agotadosBuffer.length})`} filas={previa.agotadosBuffer} soloLectura />
              )}
              <button className="btn-secondary" onClick={reiniciar} style={{ marginTop: 4 }}>Salir</button>
            </>
          ) : (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-oscuro)', display: 'block', marginBottom: 6 }}>Motivo (queda en auditoría)</label>
              {/* "Exiliado -- " es un prefijo fijo, no editable -- así el
                  conteo corrido de abajo (contarPorMotivoPrefijo('Exiliado'))
                  nunca queda desincronizado por reescribir el motivo entero. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-oscuro)', whiteSpace: 'nowrap' }}>{PREFIJO_MOTIVO} --</span>
                <input value={detalleMotivo} onChange={e => setDetalleMotivo(e.target.value)} style={{ ...selectStyle, flex: 1 }} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <button className="btn-primary" disabled={aplicando || totalSeleccionado === 0} onClick={confirmarEliminacion}>
                  {aplicando ? 'Aplicando…' : `Exiliar ${totalSeleccionado} de ${totalCandidatos} seleccionado(s)`}
                </button>
                <button className="btn-secondary" disabled={aplicando} onClick={reiniciar}>Cancelar</button>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12 }}>
                  <a href="#" onClick={e => { e.preventDefault(); seleccionarTodos(); }}>Seleccionar todos</a>
                  <a href="#" onClick={e => { e.preventDefault(); deseleccionarTodos(); }}>Ninguno</a>
                </span>
              </div>

              <p style={{ fontSize: 11, color: 'var(--texto-tenue)', margin: '0 0 12px' }}>
                Todo viene marcado por defecto -- destildá uno por uno lo que querés DEJAR, o dejá todo marcado para exiliarlo de una sola vez.
              </p>

              {previa.agotadosMapa.length > 0 && (
                <TablaMapa titulo={`Del mapa (${previa.agotadosMapa.length})`} filas={previa.agotadosMapa} seleccionados={seleccionados} onToggle={toggleSeleccion} />
              )}
              {previa.agotadosBuffer.length > 0 && (
                <TablaBuffer titulo={`Del buffer (${previa.agotadosBuffer.length})`} filas={previa.agotadosBuffer} seleccionados={seleccionados} onToggle={toggleSeleccion} />
              )}
            </>
          )}
        </div>
      )}

      {paso === 'resultado' && resultado && (
        <div>
          <div style={{ background: 'var(--verde-tenue)', border: '1px solid var(--green)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <b style={{ color: 'var(--green)' }}>✓ Se exiliaron {resultado.aplicados} artículo(s)</b>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--texto-tenue)' }}>
              Van {resultado.totalExiliados} artículo(s) exiliados en total hasta ahora.
            </p>
          </div>
          <button className="btn-primary" onClick={descargarReporte}><i className="ti ti-download" /> Descargar reporte (.xlsx)</button>
        </div>
      )}
    </div>
  );
}

function TablaMapa({ titulo, filas, seleccionados, onToggle, soloLectura = false }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-placeholder)', marginBottom: 6 }}>{titulo}</div>
      <div style={{ overflowX: 'auto', maxHeight: 240, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={theadRow}>
            {!soloLectura && <th style={{ ...thStyle, width: 28 }}></th>}
            <th style={thStyle}>Artículo</th><th style={thStyle}>Posición MZ</th><th style={thStyle}>Origen RCL</th>
          </tr></thead>
          <tbody>
            {filas.map(f => {
              const clave = claveMapa(f);
              const marcado = soloLectura || seleccionados.has(clave);
              return (
                <tr key={clave} style={{ borderTop: '1px solid var(--borde-sutil)', opacity: marcado ? 1 : 0.5 }}>
                  {!soloLectura && <td style={tdStyle}><input type="checkbox" checked={marcado} onChange={() => onToggle(clave)} /></td>}
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.pasillo}-C{String(f.columna).padStart(3, '0')}-{f.nivel}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.rclCodigo}-N{String(f.rclNivel).padStart(2, '0')}-{f.rclSubnivel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TablaBuffer({ titulo, filas, seleccionados, onToggle, soloLectura = false }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-placeholder)', marginBottom: 6 }}>{titulo}</div>
      <div style={{ overflowX: 'auto', maxHeight: 240, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={theadRow}>
            {!soloLectura && <th style={{ ...thStyle, width: 28 }}></th>}
            <th style={thStyle}>Artículo</th><th style={thStyle}>Origen RCL</th>
          </tr></thead>
          <tbody>
            {filas.map(f => {
              const clave = claveBuffer(f);
              const marcado = soloLectura || seleccionados.has(clave);
              return (
                <tr key={clave} style={{ borderTop: '1px solid var(--borde-sutil)', opacity: marcado ? 1 : 0.5 }}>
                  {!soloLectura && <td style={tdStyle}><input type="checkbox" checked={marcado} onChange={() => onToggle(clave)} /></td>}
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.origenRclCodigo}-{f.origenNivel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const selectStyle = { fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--borde-input)', fontFamily: 'inherit', width: '100%' };
const theadRow = { textAlign: 'left', color: 'var(--texto-placeholder)', fontSize: 11, textTransform: 'uppercase' };
const thStyle = { padding: '6px 8px', borderBottom: '1px solid var(--line)' };
const tdStyle = { padding: '7px 8px' };
