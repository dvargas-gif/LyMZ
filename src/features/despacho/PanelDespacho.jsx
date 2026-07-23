import { useEffect, useState } from 'react';
import { despachoService } from '../../shared/services/despacho.service.js';
import { migracionSlotsService } from '../../shared/services/migracionSlots.service.js';
import { migracionBufferService } from '../../shared/services/migracionBuffer.service.js';
import { migracionAuditoriaService } from '../../shared/services/migracionAuditoria.service.js';
import { puede } from '../auth/roles.js';
import ChecklistTrabajador from './ChecklistTrabajador.jsx';
import HojaTrabajo from './HojaTrabajo.jsx';
import HojaVerificacionCabecilla from './HojaVerificacionCabecilla.jsx';

const CANTIDAD_DEFECTO = 6;
const ESTADOS_CUENTAN_COMO_ACTIVO = new Set(['vaciando', 'recolectando']);

function rackTexto(mzPasillo, mzColumna) {
  return `${mzPasillo}-C${String(mzColumna).padStart(3, '0')}`;
}

/**
 * Módulo de Órdenes de Ejecución (sesión 2026-07-21, renombrado 2026-07-22
 * -- "Despacho" quedó solo como nombre interno de archivos/tablas, ver
 * DECISIONES.md) -- genera y gestiona hojas de trabajo por oleada para
 * trabajadores de piso NUMERADOS (no tienen cuenta ni PIN). Solo puede
 * haber una orden activa a la vez (reforzado en la base, ver
 * 2026-07-21_despacho_lotes_tareas.sql) -- la próxima oleada se genera
 * recién después de cerrar la actual, con el estado REAL de la migración
 * en ese momento, nunca con un plan cacheado.
 */
export default function PanelDespacho({ sesion }) {
  const [lote, setLote] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cantidadOperadores, setCantidadOperadores] = useState(CANTIDAD_DEFECTO);
  const [generando, setGenerando] = useState(false);
  const [procesando, setProcesando] = useState(null); // id de la tarea en vuelo
  const [cerrando, setCerrando] = useState(false);
  const [cancelandoLote, setCancelandoLote] = useState(false);
  const [deshaciendoLote, setDeshaciendoLote] = useState(false);
  const [historial, setHistorial] = useState(null); // null hasta que se pide -- órdenes CERRADAS (canceladas o auditadas), para poder deshacer una que ya no está activa
  const [deshaciendoHistorialId, setDeshaciendoHistorialId] = useState(null);
  const [slotsActivos, setSlotsActivos] = useState(null); // racks que cuentan para el cupo de equipos AHORA MISMO -- ver "equipos activos", 2026-07-23: "por qué sigue en 7 si ya deshice 8 órdenes"
  const [eliminandoSlotId, setEliminandoSlotId] = useState(null);
  // Un solo estado para las 3 hojas imprimibles (nunca 3 booleans/valores
  // independientes) -- bug real reportado con captura: HojaTrabajo.jsx y
  // HojaVerificacionCabecilla.jsx comparten el mismo truco de impresión
  // (".hoja-trabajo-contenedor" con position:absolute) -- si dos quedaban
  // montadas a la vez (ej. abrís la hoja de un trabajador y después "las 6
  // hojas" sin cerrar la primera), las dos se posicionan en el mismo lugar
  // y el papel sale con el contenido de ambas superpuesto, ilegible. Con un
  // solo valor (`null` o `{tipo, ...}`), es estructuralmente imposible tener
  // más de una montada al mismo tiempo.
  const [modalImpresion, setModalImpresion] = useState(null); // null | {tipo:'trabajador', trabajador} | {tipo:'todos'} | {tipo:'verificacion'}
  const [advertenciasGeneracion, setAdvertenciasGeneracion] = useState([]);

  const puedeCerrarOCancelar = puede(sesion.rol, 'cerrar_lote_despacho');

  async function cargar() {
    try {
      const [loteActivo, slots] = await Promise.all([despachoService.obtenerLoteActivo(), migracionSlotsService.listar()]);
      setLote(loteActivo);
      const activos = [...slots.entries()]
        .filter(([, s]) => ESTADOS_CUENTAN_COMO_ACTIVO.has(s.estado))
        .map(([clave, s]) => {
          const [mzPasillo, mzColumnaTxt] = clave.split('|');
          return { ...s, mzPasillo, mzColumna: Number(mzColumnaTxt) };
        });
      setSlotsActivos(activos);
    } catch (err) {
      setError(`No se pudo cargar la orden activa: ${err.message || err}`);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function generar() {
    setGenerando(true);
    setError('');
    setAdvertenciasGeneracion([]);
    try {
      const { advertencias } = await despachoService.generarLote({ cantidadOperadores, generadoPor: sesion.usuarioId });
      setAdvertenciasGeneracion(advertencias ?? []);
      await cargar();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setGenerando(false);
    }
  }

  async function confirmar(tareaId) {
    setProcesando(tareaId);
    setError('');
    try {
      await despachoService.confirmarTarea(tareaId);
      await cargar();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setProcesando(null);
    }
  }

  async function cancelar(tareaId) {
    setProcesando(tareaId);
    setError('');
    try {
      await despachoService.cancelarTarea(tareaId);
      await cargar();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setProcesando(null);
    }
  }

  async function cerrarLote() {
    if (!lote) return;
    setCerrando(true);
    setError('');
    try {
      await despachoService.cerrarLote(lote.id);
      await cargar();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCerrando(false);
    }
  }

  async function cancelarLoteCompleto() {
    if (!lote) return;
    if (!confirm('¿Cancelar TODO lo que quede pendiente de esta orden? Lo ya confirmado no se toca.')) return;
    setCancelandoLote(true);
    setError('');
    try {
      await despachoService.cancelarLote(lote.id);
      await cargar();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCancelandoLote(false);
    }
  }

  /** Para limpiar órdenes de PRUEBA -- a diferencia de cancelar, esto revierte también lo ya confirmado de verdad (migracion_movimientos/buffer/slots) y borra la orden entera. */
  async function deshacerLoteCompleto() {
    if (!lote) return;
    if (!confirm(`¿Deshacer la orden #${lote.id} por completo? Esto revierte también lo que YA se confirmó (artículos recolectados vuelven a pendiente, lo depositado en el buffer se borra, el traslado del rack se borra) y elimina la orden entera. Pensado para limpiar pruebas -- no se puede deshacer esto último.`)) return;
    setDeshaciendoLote(true);
    setError('');
    try {
      await despachoService.deshacerLote(lote.id);
      await cargar();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeshaciendoLote(false);
    }
  }

  async function cargarHistorial() {
    setError('');
    try {
      setHistorial(await despachoService.listarHistorial());
    } catch (err) {
      setError(`No se pudo cargar el historial: ${err.message || err}`);
    }
  }

  /**
   * Deshacer una orden que YA quedó cerrada (cancelada o auditada) -- pedido
   * explícito 2026-07-23: "cancelé estas órdenes y aun así me sigue
   * apareciendo como si hubieran equipos activos". `cancelar_lote_despacho`
   * a propósito no toca migracion_slots (trata "iniciar" como algo ya real,
   * igual que el mapa) -- así que una orden de PRUEBA cancelada deja sus
   * racks contando para siempre como "equipos activos" si nadie la
   * deshace. El botón de arriba (`deshacerLoteCompleto`) solo existe
   * mientras la orden sigue ACTIVA -- una vez cerrada, este es el único
   * camino que queda para liberarla.
   */
  async function deshacerDesdeHistorial(loteHist) {
    if (!confirm(`¿Deshacer la orden #${loteHist.id} (ya cerrada) por completo? Revierte lo confirmado y libera los racks que hayan quedado como "equipo activo" por esta orden.`)) return;
    setDeshaciendoHistorialId(loteHist.id);
    setError('');
    try {
      await despachoService.deshacerLote(loteHist.id);
      await Promise.all([cargar(), cargarHistorial()]);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeshaciendoHistorialId(null);
    }
  }

  /**
   * Elimina un rack "activo" que no pertenece a ninguna orden (o cuya orden
   * ya no existe) -- pedido explícito 2026-07-23: "necesito reversar estos
   * procesos cuando hay pruebas". Mismo camino EXACTO que ya usa el botón
   * "Eliminar" de PanelMigracion.jsx (nunca se reimplementa esta lógica):
   * primero se libera el buffer del slot (migracion_buffer.slot_origen_id
   * no tiene ON DELETE CASCADE, el borrado del slot fallaría si queda algo
   * ahí), después se borra el slot en sí, y se dejar constancia en la
   * auditoría de que fue un borrado administrativo, no un paso real del flujo.
   */
  async function eliminarSlotActivo(s) {
    if (!confirm(`¿Eliminar el traslado de ${rackTexto(s.mzPasillo, s.mzColumna)}? Esto libera su cupo y su buffer -- no se puede deshacer.`)) return;
    setEliminandoSlotId(s.id);
    setError('');
    try {
      await migracionBufferService.eliminarPorSlot(s.id);
      await migracionSlotsService.cancelar(s.id);
      await migracionAuditoriaService.registrar({
        mzPasillo: s.mzPasillo, mzColumna: s.mzColumna, evento: 'traslado_eliminado_admin',
        detalle: `Eliminado desde Órdenes de Ejecución por un administrador (estaba en "${s.estado}").`, usuarioId: sesion.usuarioId,
      });
      await cargar();
    } catch (err) {
      setError(`No se pudo eliminar: ${err.message || err}`);
    } finally {
      setEliminandoSlotId(null);
    }
  }

  if (cargando) return <p className="muted" style={{ textAlign: 'center', padding: 40 }}>Cargando…</p>;

  const totalTareas = lote?.trabajadores.reduce((acc, t) => acc + t.tareas.length, 0) ?? 0;
  const totalResueltas = lote?.trabajadores.reduce((acc, t) => acc + t.tareas.filter(x => x.estado !== 'pendiente').length, 0) ?? 0;
  const listoParaCerrar = !!lote && totalTareas > 0 && totalResueltas === totalTareas;

  return (
    <div className="panel">
      <h2>Órdenes de Ejecución</h2>
      <p className="muted">Generá hojas de trabajo por oleada para los trabajadores de piso, y confirmá su avance a medida que reportan.</p>

      {error && <p style={{ color: 'var(--red)', fontSize: 12.5, margin: '0 0 14px' }}>{error}</p>}

      {advertenciasGeneracion.length > 0 && (
        <div style={{ border: '1px solid #D9A72C', background: 'var(--amarillo-tenue, #FDF3D8)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#8A6412' }}>
          <b style={{ display: 'block', marginBottom: 4 }}>Por qué esta oleada trajo lo que trajo:</b>
          {advertenciasGeneracion.map((a, i) => <p key={i} style={{ margin: i === 0 ? 0 : '4px 0 0' }}>{a}</p>)}
        </div>
      )}

      {/* Diagnóstico de "equipos activos" (2026-07-23, pedido explícito:
          "deshice 8 órdenes y me sigue apareciendo como si hubieran equipos
          activos") -- el cupo cuenta TODO migracion_slots en vaciando/
          recolectando, no solo lo que pasó por Despacho -- un rack iniciado
          a mano desde el Mapa cuenta igual, y "Deshacer orden" solo libera
          los racks de ESA orden puntual. Este listado muestra cuáles son
          los racks reales detrás del número, para saber si pertenecen a
          alguna orden (y cuál) o si hay que resolverlos desde el Mapa. */}
      {puedeCerrarOCancelar && slotsActivos && slotsActivos.length > 0 && (
        <div style={{ border: '1px solid var(--borde-claro)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
          <b style={{ display: 'block', marginBottom: 6, fontSize: 12.5 }}>
            Racks que cuentan como "equipo activo" ahora mismo ({slotsActivos.length}):
          </b>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slotsActivos.map(s => (
              <div key={`${s.mzPasillo}|${s.mzColumna}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{ flex: 1 }}>
                  {rackTexto(s.mzPasillo, s.mzColumna)} -- {s.estado}
                  {s.iniciadoEn && ` -- iniciado ${new Date(s.iniciadoEn).toLocaleString()}`}
                </span>
                <button
                  className="btn-secondary" style={{ fontSize: 11, color: 'var(--red)' }}
                  disabled={eliminandoSlotId === s.id}
                  onClick={() => eliminarSlotActivo(s)}
                >
                  {eliminandoSlotId === s.id ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!lote && (
        <div style={{ border: '1px solid var(--borde-claro)', borderRadius: 12, padding: 16, maxWidth: 420 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }} htmlFor="ordenes-ejecucion-cantidad-operadores">
            Cantidad de operadores disponibles
          </label>
          <input
            id="ordenes-ejecucion-cantidad-operadores"
            type="number" min={1} max={20} value={cantidadOperadores}
            onChange={e => setCantidadOperadores(Number(e.target.value))}
            style={{ width: 80, padding: '6px 8px', border: '1px solid var(--borde-claro)', borderRadius: 8, marginRight: 10 }}
          />
          <button className="btn-primary" disabled={generando} onClick={generar}>
            {generando ? 'Generando…' : 'Generar orden de ejecución'}
          </button>
          <p style={{ fontSize: 11.5, color: 'var(--texto-tenue)', marginTop: 10 }}>
            Se arma con la próxima oleada lista según el plan de migración -- si no hay ninguna, no se genera nada.
          </p>
        </div>
      )}

      {lote && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--texto-tenue)' }}>
              Orden #{lote.id} -- {lote.cantidadOperadores} operador(es) -- {totalResueltas}/{totalTareas} tarea(s) resueltas
            </span>
            <button className="btn-secondary" onClick={() => setModalImpresion({ tipo: 'todos' })}>
              Imprimir las {lote.trabajadores.length} hoja(s) de trabajo
            </button>
            <button className="btn-secondary" onClick={() => setModalImpresion({ tipo: 'verificacion' })}>
              <i className="ti ti-map-pin-check" /> Hoja de verificación del cabecilla
            </button>
            {puedeCerrarOCancelar && (
              <button
                className="btn-primary" disabled={!listoParaCerrar || cerrando} onClick={cerrarLote}
                title={listoParaCerrar ? undefined : 'Quedan tareas sin confirmar o cancelar'}
              >
                {cerrando ? 'Cerrando…' : 'Cerrar orden (auditoría)'}
              </button>
            )}
            {puedeCerrarOCancelar && (
              <button
                className="btn-secondary" style={{ color: 'var(--red)' }} disabled={cancelandoLote} onClick={cancelarLoteCompleto}
                title="Cancela todo lo pendiente y cierra la orden -- lo ya confirmado no se toca"
              >
                {cancelandoLote ? 'Cancelando…' : 'Cancelar orden completa'}
              </button>
            )}
            {puedeCerrarOCancelar && (
              <button
                className="btn-secondary" style={{ color: 'var(--red)' }} disabled={deshaciendoLote} onClick={deshacerLoteCompleto}
                title="Para pruebas: revierte TODO -- incluso lo ya confirmado -- y borra la orden entera"
              >
                {deshaciendoLote ? 'Deshaciendo…' : '↺ Deshacer orden (prueba)'}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {lote.trabajadores.map(t => (
              <div key={t.numero} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ChecklistTrabajador
                  trabajador={t}
                  puedeCancelar={puedeCerrarOCancelar}
                  procesando={procesando}
                  onConfirmar={confirmar}
                  onCancelar={cancelar}
                />
                <button className="btn-secondary" style={{ fontSize: 11.5, alignSelf: 'flex-start' }} onClick={() => setModalImpresion({ tipo: 'trabajador', trabajador: t })}>
                  Ver / imprimir hoja de trabajo
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {puedeCerrarOCancelar && (
        <div style={{ marginTop: 28 }}>
          {historial === null ? (
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={cargarHistorial}>
              Ver órdenes cerradas recientes (para deshacer una ya cancelada)
            </button>
          ) : (
            <>
              <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>Órdenes cerradas recientes</h3>
              {historial.length === 0 ? (
                <p className="muted" style={{ fontSize: 12 }}>Todavía no hay ninguna.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {historial.map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '6px 10px', border: '1px solid var(--borde-sutil)', borderRadius: 8 }}>
                      <span style={{ flex: 1 }}>
                        Orden #{h.id} -- {h.cantidadOperadores} operador(es) -- cerrada {new Date(h.cerradoEn).toLocaleString()}
                      </span>
                      <button
                        className="btn-secondary" style={{ fontSize: 11, color: 'var(--red)' }}
                        disabled={deshaciendoHistorialId === h.id}
                        onClick={() => deshacerDesdeHistorial(h)}
                      >
                        {deshaciendoHistorialId === h.id ? 'Deshaciendo…' : '↺ Deshacer'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {modalImpresion?.tipo === 'trabajador' && (
        <HojaTrabajo trabajador={modalImpresion.trabajador} onCerrar={() => setModalImpresion(null)} />
      )}
      {modalImpresion?.tipo === 'todos' && lote && (
        <HojaTrabajo trabajadores={lote.trabajadores} onCerrar={() => setModalImpresion(null)} />
      )}
      {modalImpresion?.tipo === 'verificacion' && lote && (
        <HojaVerificacionCabecilla lote={lote} onCerrar={() => setModalImpresion(null)} />
      )}
    </div>
  );
}
