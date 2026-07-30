import { useEffect, useState } from 'react';
import { inventarioService } from '../../shared/services/inventario.service.js';
import { inventarioRclService } from '../../shared/services/inventarioRcl.service.js';
import { migracionMovimientosService } from '../../shared/services/migracionMovimientos.service.js';
import { migracionBufferService } from '../../shared/services/migracionBuffer.service.js';
import { migracionAuditoriaService } from '../../shared/services/migracionAuditoria.service.js';
import { identidadLegacyService } from '../../shared/services/identidadLegacy.service.js';
import { migracionSlotsService } from '../../shared/services/migracionSlots.service.js';
import { usuariosService } from '../usuarios/usuarios.service.js';
import { posicionesEliminadasService } from '../../shared/services/posicionesEliminadas.service.js';
import { generarMovimientosMigracion } from './generarMovimientos.js';
import { despachoService } from '../../shared/services/despacho.service.js';
import { articuloDimensionesService } from '../../shared/services/articuloDimensiones.service.js';
import { detectarCuerposParaAjustarNiveles } from '../../domain/reglasAsignacionCuerpo.js';
import { detectarSobrecarga } from '../../domain/detectarSobrecargaRacks.js';
import { detectarDestinosDesactualizados } from '../../domain/detectarDestinosDesactualizados.js';
import { detectarPosicionesLibresDeIdentidad, agruparPosicionesLibresPorCuerpo } from '../../domain/detectarPosicionesLibres.js';
import { exportarExcel } from '../../shared/utils/exportExcel.js';
import ModalBase from '../../shared/components/ModalBase.jsx';
import PanelCargando from '../../shared/components/PanelCargando.jsx';

const ESTADOS_ACTIVOS = new Set(['vaciando', 'recolectando']);
// Mismo prefijo fijo que ya usa PanelLimpiarAgotadosRcl.jsx (PREFIJO_MOTIVO) -- no se
// importa desde ahí para no acoplar 2 features por una constante de 1 palabra, pero
// tiene que ser el mismo texto para que este cruce encuentre los mismos artículos.
const PREFIJO_EXILIADO = 'Exiliado';

const rackDe = s => `${s.mzPasillo}-C${String(s.mzColumna).padStart(3, '0')}`;
const nombreDe = (usuarios, id) => (id ? (usuarios.get(id)?.nombre ?? '(usuario eliminado)') : '—');

const COLOR_ESTADO = {
  libre: { fondo: 'var(--verde-tenue, #E6F5E9)', borde: 'var(--green, #1F7A3D)', texto: 'var(--green, #1F7A3D)' },
  aprobacion: { fondo: 'var(--azul-tenue, #E3EEFC)', borde: '#5B8DEF', texto: '#3A66C4' },
  ciclo: { fondo: 'var(--amarillo-tenue, #FDF3D8)', borde: '#D9A72C', texto: '#8A6412' },
};

function Tarjeta({ valor, etiqueta, color }) {
  const c = COLOR_ESTADO[color];
  return (
    <div style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c?.borde ?? 'var(--borde-claro)'}`, background: c?.fondo ?? 'transparent', minWidth: 92 }}>
      <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: c?.texto ?? 'inherit', lineHeight: 1.2 }}>{valor}</div>
      <div style={{ fontSize: 10.5, color: 'var(--texto-tenue)' }}>{etiqueta}</div>
    </div>
  );
}

function Fila({ titulo, subtitulo, acciones }) {
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--borde-claro)' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{titulo}</div>
        <div style={{ fontSize: 11, color: 'var(--texto-tenue)' }}>{subtitulo}</div>
      </div>
      {acciones && <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{acciones}</div>}
    </li>
  );
}

function Lista({ items, vacio, render }) {
  if (items === null) return <PanelCargando lineas={2} />;
  if (items.length === 0) return <p style={{ fontSize: 12.5, color: 'var(--texto-tenue)' }}>{vacio}</p>;
  return <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>{items.map(render)}</ul>;
}

/**
 * Panel único de migración (F2) -- fusiona lo que antes eran 2 paneles
 * separados ("Generar plan de recolección" y "Equipos de migración")
 * pedido explícito del usuario: "quiero que ambos estén conectados... que
 * lo vea a nivel de panel el cómo las van resolviendo y de qué avance se
 * lleva". Tres secciones en el mismo scroll:
 *
 * 1. Resumen -- KPIs en vivo (% recolectado, cupo de equipos, sin empezar).
 * 2. Plan -- calcular/aplicar (F1.5-C), la siembra real de `migracion_movimientos`
 *    de la que depende Órdenes de Ejecución para generar cada orden.
 * 3. Equipos -- quién está trabajando ahora y quién espera cupo, para el
 *    flujo manual "Iniciar traslado" (Supervisor/Administrador, todavía
 *    vigente aparte de Órdenes de Ejecución).
 *
 * "Simular mejor orden de movimiento" y la tarjeta "esperando confirmación"
 * ya se habían sacado (2026-07-22). Ahora (mismo día, cierre de la decisión
 * pendiente) se saca también "Bloqueados -- esperando confirmación" y
 * "Confirmados recientemente": confirmado que `migracion_slots.estado`
 * 'bloqueado' y 'confirmado' se tratan IGUAL en todo el resto del código
 * (planificarSecuencia.js, alertasBuffer.js) -- la acción "Confirmar" nunca
 * tuvo ningún efecto real, era un paso de auditoría manual que nadie
 * consumía. "Activos ahora"/"Esperando cupo" SÍ siguen vivos -- son el
 * gate real de cupo para quien inicia un traslado a mano.
 *
 * Todo en un solo `cargar()` que refresca slots+usuarios+resumen juntos, así
 * ninguna sección queda desincronizada de las demás.
 */
export default function PanelMigracion({ sesion, onCerrar }) {
  // -- Plan (F1.5-C) --
  const [paso, setPaso] = useState('calcular'); // 'calcular' | 'previa' | 'resultado'
  const [previa, setPrevia] = useState(null); // {movimientos:[...], sinStock:[...]}
  const [cargandoPlan, setCargandoPlan] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [exiliadosEnAcomodo, setExiliadosEnAcomodo] = useState(null); // [{articulo, pasillo, columna, nivel, eliminadoEn, motivo}] | null
  const [revisandoExiliados, setRevisandoExiliados] = useState(false);
  const [cuerposParaAjustar, setCuerposParaAjustar] = useState(null); // [{pasillo, columna, articulo, volumenArticulo, porcentaje, nivelesRecomendados}] | null
  const [revisandoNiveles, setRevisandoNiveles] = useState(false);
  const [sobrecargas, setSobrecargas] = useState(null); // [{pasillo, columna, nivel, articulos, volumenTotal, capacidad, porcentaje}] | null
  const [revisandoSobrecarga, setRevisandoSobrecarga] = useState(false);
  const [destinosDesactualizados, setDestinosDesactualizados] = useState(null); // [{articulo, rclCodigo, rclNivel, rclSubnivel, destinoImportado, destinoReal}] | null
  const [revisandoDestinos, setRevisandoDestinos] = useState(false);
  const [exportandoLibres, setExportandoLibres] = useState(false);

  // -- Equipos + resumen --
  const [slots, setSlots] = useState(null); // null = cargando
  const [usuarios, setUsuarios] = useState(new Map());
  const [progreso, setProgreso] = useState(null); // {total, recolectados}
  const [destinosPendientes, setDestinosPendientes] = useState(null); // Set("pasillo|columna") con algún movimiento pendiente
  const [hayRespaldo, setHayRespaldo] = useState(false); // ¿hay una aplicación anterior para deshacer?
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [procesando, setProcesando] = useState(null);

  const [error, setError] = useState('');

  async function cargar() {
    try {
      const [mapaSlots, prog, todosPendientes, respaldo] = await Promise.all([
        migracionSlotsService.listar(),
        migracionMovimientosService.contarProgreso(),
        migracionMovimientosService.listarTodos(),
        migracionMovimientosService.hayRespaldoParaDeshacer(),
      ]);
      setSlots([...mapaSlots.entries()].map(([clave, s]) => {
        const [mzPasillo, mzColumnaTxt] = clave.split('|');
        return { ...s, mzPasillo, mzColumna: Number(mzColumnaTxt) };
      }));
      setProgreso(prog);
      setDestinosPendientes(new Set(todosPendientes.map(m => `${m.mzPasillo}|${m.mzColumna}`)));
      setHayRespaldo(respaldo);
    } catch (err) {
      setError(`No se pudo cargar el resumen: ${err.message || err}`);
    }
    try {
      const todos = await usuariosService.listar();
      setUsuarios(new Map(todos.map(u => [u.id, u])));
    } catch {
      // Sin permiso (ej. Supervisor) -- se degrada mostrando el id en vez de un nombre legible, no rompe el panel.
    }
  }

  useEffect(() => { cargar(); }, []);

  // ---- Plan ----
  async function calcular() {
    setCargandoPlan(true);
    setError('');
    try {
      const [inventarioSlotting, inventarioRclActual] = await Promise.all([
        inventarioService.listar(),
        inventarioRclService.listar(),
      ]);
      setPrevia(generarMovimientosMigracion(inventarioSlotting, inventarioRclActual));
      setPaso('previa');
    } catch (err) {
      setError(`No se pudo calcular el plan: ${err.message || err}`);
    } finally {
      setCargandoPlan(false);
    }
  }

  /**
   * Cruza `inventario_slotting` (el acomodo MZ de fábrica, nunca se toca)
   * contra los artículos ya marcados "Exiliado" en `posiciones_eliminadas`
   * -- pedido explícito del usuario: SOLO avisar, nunca borrar nada del
   * acomodo (podría ser un quiebre temporal, no necesariamente
   * descontinuado para siempre). Es informativo -- no afecta qué se le
   * asigna a un operador (eso ya lo filtra el "sin stock" del cálculo del
   * plan, por otro camino completamente aparte).
   */
  async function revisarExiliadosEnAcomodo() {
    setRevisandoExiliados(true);
    setError('');
    try {
      const [acomodo, exiliados] = await Promise.all([
        inventarioService.listar(),
        posicionesEliminadasService.listarPorMotivoPrefijo(PREFIJO_EXILIADO),
      ]);
      const exiliadoPorArticulo = new Map(exiliados.map(e => [e.articulo, e]));
      const encontrados = acomodo
        .filter(a => exiliadoPorArticulo.has(a.articulo))
        .map(a => ({ ...a, ...exiliadoPorArticulo.get(a.articulo) }));
      setExiliadosEnAcomodo(encontrados);
    } catch (err) {
      setError(`No se pudo revisar los artículos exiliados: ${err.message || err}`);
    } finally {
      setRevisandoExiliados(false);
    }
  }

  /**
   * Cuerpos (5 niveles) dedicados a UN SOLO artículo que, según su volumen,
   * convendría pasar a menos niveles (2026-07-24, pedido explícito, tabla
   * confirmada con el usuario) -- ver src/domain/reglasAsignacionCuerpo.js
   * para la regla completa. Mismo espíritu que revisarExiliadosEnAcomodo():
   * SOLO informa, nunca cambia nada de inventario_slotting.
   */
  async function revisarCuerposParaAjustar() {
    setRevisandoNiveles(true);
    setError('');
    try {
      const [slotting, dimensiones] = await Promise.all([
        inventarioService.listar(),
        articuloDimensionesService.listar(),
      ]);
      setCuerposParaAjustar(detectarCuerposParaAjustarNiveles(slotting, dimensiones));
    } catch (err) {
      setError(`No se pudo revisar los cuerpos: ${err.message || err}`);
    } finally {
      setRevisandoNiveles(false);
    }
  }

  /**
   * Fase 1 de verificación de espacios (2026-07-27, pedido explícito) --
   * contraparte de revisarCuerposParaAjustar(): en vez de subutilización,
   * detecta huecos (un cuerpo entero o un nivel individual) donde el
   * volumen de TODO lo asignado ahí supera la capacidad física real -- ver
   * src/domain/detectarSobrecargaRacks.js. Mismo espíritu: SOLO informa.
   */
  async function revisarSobrecarga() {
    setRevisandoSobrecarga(true);
    setError('');
    try {
      const [slotting, dimensiones] = await Promise.all([
        inventarioService.listar(),
        articuloDimensionesService.listar(),
      ]);
      setSobrecargas(detectarSobrecarga(slotting, dimensiones));
    } catch (err) {
      setError(`No se pudo revisar la sobrecarga: ${err.message || err}`);
    } finally {
      setRevisandoSobrecarga(false);
    }
  }

  /**
   * Auditoría de Vista RCL (2026-07-28, pedido explícito tras un caso real
   * en piso): identidad_legacy es un import de una sola vez que nunca se
   * vuelve a tocar -- puede quedar apuntando a una posición MZ que ya no es
   * donde el artículo realmente vive según inventario_slotting (el plan
   * real). Ver src/domain/detectarDestinosDesactualizados.js.
   */
  async function revisarDestinosDesactualizados() {
    setRevisandoDestinos(true);
    setError('');
    try {
      const [identidad, inventarioRcl, slotting] = await Promise.all([
        identidadLegacyService.listar(),
        inventarioRclService.listar(),
        inventarioService.listar(),
      ]);
      setDestinosDesactualizados(detectarDestinosDesactualizados(identidad, inventarioRcl, slotting));
    } catch (err) {
      setError(`No se pudo revisar los destinos: ${err.message || err}`);
    } finally {
      setRevisandoDestinos(false);
    }
  }

  /**
   * "Exportar racks vacíos" (2026-07-30, corregido en vivo por tercera vez,
   * pedido explícito: "no importa que sea mercadería real") -- la
   * mercadería real en inventario_slotting NO descarta una posición. El
   * ÚNICO criterio es identidad_legacy: libre = sin RCL asignado ahí. Ver
   * detectarPosicionesLibresDeIdentidad() en
   * src/domain/detectarPosicionesLibres.js. (detectarPosicionesRealmenteLibres()
   * y detectarPosicionesLibres() quedan en el dominio, con test, por si hace
   * falta el criterio de mercadería real para otra cosa a futuro -- no se
   * usan en este botón.)
   */
  async function exportarPosicionesLibres() {
    setExportandoLibres(true);
    setError('');
    try {
      const identidad = await identidadLegacyService.listar();
      const libres = agruparPosicionesLibresPorCuerpo(detectarPosicionesLibresDeIdentidad(identidad));
      exportarExcel(libres, `MZ_libres_${new Date().toISOString().slice(0, 10)}.xlsx`, 'MZ libres');
    } catch (err) {
      setError(`No se pudo exportar las posiciones libres: ${err.message || err}`);
    } finally {
      setExportandoLibres(false);
    }
  }

  /**
   * Candado real (2026-07-24, pedido explícito) -- "Aplicar" reemplaza
   * TODOS los migracion_movimientos pendientes, sin importar si alguno ya
   * está enganchado a una tarea de despacho_tareas todavía sin confirmar.
   * Con una Orden de Ejecución activa, eso arriesga romper sus tareas
   * "recolectar" (movimiento_id apunta a una fila que este reemplazo puede
   * borrar) -- en el mejor caso, la base lo rechaza por la foreign key; en
   * el peor, deja tareas huérfanas. Antes esto solo se lo avisaba al
   * usuario por chat -- ahora lo frena el código mismo, no la memoria de
   * nadie.
   */
  async function confirmarAplicar() {
    if (!previa || previa.movimientos.length === 0) return;
    const loteActivo = await despachoService.obtenerLoteActivo();
    if (loteActivo) {
      setError(`No se puede aplicar el plan mientras la Orden de Ejecución #${loteActivo.id} sigue abierta -- reemplazar los movimientos pendientes arriesga romper sus tareas de recolección todavía sin confirmar. Cerrala, cancelala o deshacela primero desde Órdenes de Ejecución.`);
      return;
    }
    if (!confirm(`Vas a reemplazar el plan de recolección PENDIENTE con ${previa.movimientos.length} movimiento(s) nuevo(s). Lo que ya esté marcado "recolectado" no se toca. ¿Confirmás?`)) return;
    setAplicando(true);
    setError('');
    try {
      await migracionMovimientosService.reemplazarPendientes(previa.movimientos, sesion.usuarioId);
      const revinculados = await migracionBufferService.revincularConPlan();
      setResultado({ aplicados: previa.movimientos.length, sinStock: previa.sinStock.length, revinculados });
      setPaso('resultado');
      await cargar(); // el resumen (progreso/destinos pendientes) cambió -- se refresca junto con el resto
    } catch (err) {
      setError(`No se pudo aplicar el plan: ${err.message || err}`);
    } finally {
      setAplicando(false);
    }
  }

  function reiniciarPlan() {
    setPaso('calcular'); setPrevia(null); setResultado(null); setError('');
  }

  /**
   * "Deshacer última aplicación" -- pedido explícito del usuario ("cómo
   * hago las pruebas sin desordenar todo"). Restaura el pendiente al
   * estado justo antes del último "Aplicar". Un solo nivel -- después de
   * usarlo, no queda otra aplicación más vieja para deshacer.
   */
  async function deshacerAplicacion() {
    if (!confirm('¿Deshacer la última aplicación? El plan pendiente vuelve a como estaba antes de esa aplicación. Lo ya recolectado no se toca.')) return;
    setDeshaciendo(true);
    setError('');
    try {
      const restaurados = await migracionMovimientosService.deshacerUltimaAplicacion(sesion.usuarioId);
      await migracionBufferService.revincularConPlan();
      setResultado({ aplicados: restaurados, sinStock: 0, revinculados: 0, esDeshacer: true });
      setPaso('resultado');
      await cargar();
    } catch (err) {
      setError(`No se pudo deshacer: ${err.message || err}`);
    } finally {
      setDeshaciendo(false);
    }
  }

  /**
   * "Reiniciar migración desde cero" -- distinto de "Deshacer última
   * aplicación": borra TODO `migracion_movimientos` (no solo vuelve un
   * paso atrás), pero el servicio mismo se niega a hacerlo si ya hay
   * trabajo real (cualquier slot con progreso, algo en el buffer, o algo
   * recolectado) -- pedido explícito del usuario: "que la borre solo
   * cuando no hay nada aún cambiado", nunca a costa de perder trabajo.
   */
  async function reiniciarDesdeCero() {
    if (!confirm('¿Reiniciar la migración desde cero? Se borra TODO el plan de recolección actual. Esto se rechaza solo si ya hay algún equipo trabajando -- si no hay nada en curso, no se puede deshacer después.')) return;
    setDeshaciendo(true);
    setError('');
    try {
      await migracionMovimientosService.reiniciarDesdeCeroSiEsSeguro();
      setResultado(null);
      setPrevia(null);
      setPaso('calcular');
      await cargar();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeshaciendo(false);
    }
  }

  // ---- Equipos ----
  async function aprobar(id) {
    setProcesando(id);
    setError('');
    try { await migracionSlotsService.aprobar(id, sesion.usuarioId); await cargar(); }
    catch (err) { setError(`No se pudo aprobar: ${err.message || err}`); }
    finally { setProcesando(null); }
  }

  async function rechazar(id) {
    if (!confirm('¿Rechazar esta solicitud de traslado?')) return;
    setProcesando(id);
    setError('');
    try { await migracionSlotsService.rechazar(id); await cargar(); }
    catch (err) { setError(`No se pudo rechazar: ${err.message || err}`); }
    finally { setProcesando(null); }
  }

  /**
   * Bug real encontrado 2026-07-23 (mismo que en PanelDespacho.jsx, que
   * copió este mismo patrón): el registro de auditoría iba ANTES de
   * refrescar la lista -- si esa llamada fallaba, el catch agarraba el
   * error y `cargar()` nunca corría, aunque el buffer y el slot YA se
   * hubieran borrado de verdad. La pantalla seguía mostrando el rack como
   * activo, dando la sensación de que "Eliminar" no hacía nada. Ahora el
   * refresco es lo primero que pasa apenas se confirma el borrado real --
   * la auditoría queda como best-effort después, sin bloquear nada.
   */
  async function eliminar(s) {
    if (!confirm(`¿Eliminar el traslado de ${rackDe(s)}? Esto libera su cupo y su buffer -- no se puede deshacer.`)) return;
    setProcesando(s.id);
    setError('');
    try {
      await migracionBufferService.eliminarPorSlot(s.id);
      await migracionSlotsService.cancelar(s.id);
      await cargar();
      migracionAuditoriaService.registrar({
        mzPasillo: s.mzPasillo, mzColumna: s.mzColumna, evento: 'traslado_eliminado_admin',
        detalle: `Eliminado por un administrador (estaba en "${s.estado}").`, usuarioId: sesion.usuarioId,
      }).catch(err => console.error('No se pudo registrar en auditoría (el borrado sí se aplicó de verdad):', err));
    } catch (err) {
      setError(`No se pudo eliminar: ${err.message || err}`);
    } finally {
      setProcesando(null);
    }
  }

  const activos = slots?.filter(s => ESTADOS_ACTIVOS.has(s.estado)) ?? null;
  const esperandoAprobacion = slots?.filter(s => s.estado === 'esperando_aprobacion') ?? null;

  const racksSinEmpezar = (slots && destinosPendientes)
    ? [...destinosPendientes].filter(clave => !slots.some(s => `${s.mzPasillo}|${s.mzColumna}` === clave)).length
    : null;
  const porcentajeRecolectado = progreso && progreso.total > 0 ? Math.round((progreso.recolectados / progreso.total) * 100) : null;

  return (
    <ModalBase titulo="🧭 Panel de Migración (RCL → MZ)" onCerrar={onCerrar} maxWidth={960} maxHeight="88vh" scrollContenido>
      {/* minWidth:0 -- ver nota de la vez pasada: sin esto, la tabla del simulador empuja todo el modal hacia afuera en vez de scrollear puertas adentro (ModalBase con scrollContenido deja el card en flex-column SIN overflow propio). */}
      <div style={{ overflowY: 'auto', overflowX: 'hidden', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && <p style={{ color: 'var(--red)', fontSize: 12.5, margin: 0 }}>{error}</p>}

        {/* ---------------------------------------------------------------- */}
        {/* 1) RESUMEN -- de un vistazo, sin abrir nada más. */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h3 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--texto-tenue)', margin: '0 0 8px' }}>Resumen</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Tarjeta valor={porcentajeRecolectado != null ? `${porcentajeRecolectado}%` : '—'} etiqueta={progreso ? `recolectado (${progreso.recolectados}/${progreso.total})` : 'recolectado'} />
            <Tarjeta valor={activos ? `${activos.length}/3` : '—'} etiqueta="equipos activos" color={activos?.length ? 'libre' : undefined} />
            <Tarjeta valor={esperandoAprobacion?.length ?? '—'} etiqueta="esperando cupo" color={esperandoAprobacion?.length ? 'aprobacion' : undefined} />
            <Tarjeta valor={racksSinEmpezar ?? '—'} etiqueta="racks sin empezar" />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 2) PLAN -- calcular/aplicar + simular mejor orden. */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <h3 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--texto-tenue)', margin: 0 }}>Plan de recolección</h3>
            {hayRespaldo && (
              <button className="btn-secondary" disabled={deshaciendo} onClick={deshacerAplicacion} style={{ fontSize: 12 }}>
                {deshaciendo ? 'Deshaciendo…' : '↺ Deshacer última aplicación'}
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
            Cruza el plan de slotting (destino MZ + origen RCL por artículo) contra el inventario RCL más reciente para
            armar la lista de pick de cada posición MZ -- no sube ningún archivo, se calcula con lo que ya está cargado.
            Reemplaza solo el plan <b>pendiente</b>; lo ya recolectado no se toca.
          </p>

          {paso === 'calcular' && (
            <button className="btn-primary" disabled={cargandoPlan} onClick={calcular}>
              {cargandoPlan ? 'Calculando…' : 'Calcular plan de recolección'}
            </button>
          )}

          {paso === 'previa' && previa && (
            <div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 14, fontSize: 12.5 }}>
                <span>✅ Movimientos a generar: <b>{previa.movimientos.length}</b></span>
                <span style={{ color: 'var(--texto-tenue)' }}>⚠ {previa.sinStock.length} artículo(s) del plan sin stock real -- se excluyen (ver "Limpiar artículos sin stock real")</span>
              </div>

              {previa.movimientos.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--texto-tenue)' }}>No se generó ningún movimiento -- revisá que el inventario RCL esté importado.</p>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button className="btn-primary" disabled={aplicando} onClick={confirmarAplicar}>
                    {aplicando ? 'Aplicando…' : `Aplicar ${previa.movimientos.length} movimiento(s)`}
                  </button>
                  <button className="btn-secondary" disabled={aplicando} onClick={reiniciarPlan}>Cancelar</button>
                </div>
              )}
            </div>
          )}

          {paso === 'resultado' && resultado && (
            <div style={{ background: 'var(--verde-tenue)', border: '1px solid var(--green)', borderRadius: 10, padding: 14 }}>
              <b style={{ color: 'var(--green)' }}>
                {resultado.esDeshacer
                  ? `✓ Aplicación deshecha -- ${resultado.aplicados} movimiento(s) restaurado(s)`
                  : `✓ Plan de recolección actualizado -- ${resultado.aplicados} movimiento(s)`}
              </b>
              {resultado.sinStock > 0 && <span style={{ color: 'var(--texto-tenue)', fontSize: 12.5 }}> — {resultado.sinStock} artículo(s) quedaron afuera por no tener stock real.</span>}
              {resultado.revinculados > 0 && <p style={{ color: 'var(--texto-tenue)', fontSize: 12.5, margin: '8px 0 0' }}>{resultado.revinculados} artículo(s) que ya estaban en el buffer ahora resolvieron su destino real.</p>}
              <button className="btn-secondary" onClick={reiniciarPlan} style={{ marginTop: 10, fontSize: 12 }}>Calcular otro plan</button>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--borde-claro)', marginTop: 18, paddingTop: 14 }}>
            <button className="btn-secondary" disabled={revisandoExiliados} onClick={revisarExiliadosEnAcomodo} style={{ fontSize: 12 }}>
              {revisandoExiliados ? 'Revisando…' : 'Revisar artículos exiliados en el acomodo MZ'}
            </button>
            <p className="info-secundaria">
              Solo informa -- nunca borra nada de <code>inventario_slotting</code>. Un artículo exiliado puede ser un quiebre temporal, no necesariamente descontinuado para siempre.
            </p>

            {exiliadosEnAcomodo && (
              exiliadosEnAcomodo.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--green)', margin: '10px 0 0' }}>✓ Ningún artículo exiliado sigue planificado en el acomodo MZ.</p>
              ) : (
                <div style={{ marginTop: 10, overflowX: 'auto', maxWidth: '100%' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ambar, #8A6412)', margin: '0 0 8px' }}>
                    ⚠ {exiliadosEnAcomodo.length} artículo(s) siguen planificados en el acomodo MZ, pero ya están exiliados (sin stock real):
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--texto-tenue)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                        <th style={{ padding: '6px 8px' }}>Artículo</th>
                        <th style={{ padding: '6px 8px' }}>Posición planificada</th>
                        <th style={{ padding: '6px 8px' }}>Exiliado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exiliadosEnAcomodo.map((e, i) => (
                        <tr key={`${e.articulo}-${i}`} style={{ borderTop: '1px solid var(--borde-claro)' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{e.articulo}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{e.pasillo}-C{String(e.columna).padStart(3, '0')}{e.nivel ? `-${e.nivel}` : ''}</td>
                          <td style={{ padding: '8px', color: 'var(--texto-tenue)' }}>{e.motivo} -- {new Date(e.eliminado_en).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--borde-claro)', marginTop: 18, paddingTop: 14 }}>
            <button className="btn-secondary" disabled={revisandoNiveles} onClick={revisarCuerposParaAjustar} style={{ fontSize: 12 }}>
              {revisandoNiveles ? 'Revisando…' : 'Revisar cuerpos para ajustar niveles'}
            </button>
            <p className="info-secundaria">
              Solo informa -- nunca cambia nada de <code>inventario_slotting</code>. Un cuerpo entero (5 niveles) dedicado a un solo artículo: menos del 30% de volumen ya está bien con 5 niveles; 30-40% conviene 3; 40-50% conviene 2; 50% o más conviene 1 solo.
            </p>

            {cuerposParaAjustar && (
              cuerposParaAjustar.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--green)', margin: '10px 0 0' }}>✓ Ningún cuerpo de un solo artículo necesita ajustar su cantidad de niveles.</p>
              ) : (
                <div style={{ marginTop: 10, overflowX: 'auto', maxWidth: '100%' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ambar, #8A6412)', margin: '0 0 8px' }}>
                    ⚠ {cuerposParaAjustar.length} cuerpo(s) de un solo artículo convendría pasarlos a menos niveles:
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--texto-tenue)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                        <th style={{ padding: '6px 8px' }}>Rack</th>
                        <th style={{ padding: '6px 8px' }}>Artículo</th>
                        <th style={{ padding: '6px 8px' }}>Volumen artículo</th>
                        <th style={{ padding: '6px 8px' }}>% del cuerpo</th>
                        <th style={{ padding: '6px 8px' }}>Niveles recomendados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuerposParaAjustar.map((c, i) => (
                        <tr key={`${c.pasillo}-${c.columna}-${i}`} style={{ borderTop: '1px solid var(--borde-claro)' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.pasillo}-C{String(c.columna).padStart(3, '0')}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{c.articulo}</td>
                          <td style={{ padding: '8px' }}>{c.volumenArticulo.toFixed(3)} m³</td>
                          <td style={{ padding: '8px' }}>{(c.porcentaje * 100).toFixed(1)}%</td>
                          <td style={{ padding: '8px', color: 'var(--red)', fontWeight: 700 }}>{c.nivelesRecomendados}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--borde-claro)', marginTop: 18, paddingTop: 14 }}>
            <button className="btn-secondary" disabled={revisandoSobrecarga} onClick={revisarSobrecarga} style={{ fontSize: 12 }}>
              {revisandoSobrecarga ? 'Revisando…' : 'Revisar espacios sobrecargados'}
            </button>
            <p className="info-secundaria">
              Solo informa -- nunca cambia nada de <code>inventario_slotting</code>. Detecta cuerpos o niveles individuales donde el volumen de TODO lo asignado ahí (uno o varios artículos) supera la capacidad física real (0,432 m³ por nivel, 2,16 m³ por cuerpo entero).
            </p>

            {sobrecargas && (
              sobrecargas.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--green)', margin: '10px 0 0' }}>✓ Ningún rack tiene más volumen asignado del que entra físicamente.</p>
              ) : (
                <div style={{ marginTop: 10, overflowX: 'auto', maxWidth: '100%' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red)', margin: '0 0 8px' }}>
                    ⚠ {sobrecargas.length} hueco(s) con más volumen asignado del que entra:
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--texto-tenue)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                        <th style={{ padding: '6px 8px' }}>Rack</th>
                        <th style={{ padding: '6px 8px' }}>Nivel</th>
                        <th style={{ padding: '6px 8px' }}>Artículo(s)</th>
                        <th style={{ padding: '6px 8px' }}>Volumen asignado</th>
                        <th style={{ padding: '6px 8px' }}>Capacidad</th>
                        <th style={{ padding: '6px 8px' }}>% sobre capacidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sobrecargas.map((s, i) => (
                        <tr key={`${s.pasillo}-${s.columna}-${s.nivel}-${i}`} style={{ borderTop: '1px solid var(--borde-claro)' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{s.pasillo}-C{String(s.columna).padStart(3, '0')}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{s.nivel}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{s.articulos.join(', ')}</td>
                          <td style={{ padding: '8px' }}>{s.volumenTotal.toFixed(3)} m³</td>
                          <td style={{ padding: '8px' }}>{s.capacidad.toFixed(3)} m³</td>
                          <td style={{ padding: '8px', color: 'var(--red)', fontWeight: 700 }}>{(s.porcentaje * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--borde-claro)', marginTop: 18, paddingTop: 14 }}>
            <button className="btn-secondary" disabled={revisandoDestinos} onClick={revisarDestinosDesactualizados} style={{ fontSize: 12 }}>
              {revisandoDestinos ? 'Revisando…' : 'Revisar destinos desactualizados (Vista RCL)'}
            </button>
            <p className="info-secundaria">
              Solo informa -- nunca cambia nada. Compara el destino MZ que quedó importado en <code>identidad_legacy</code> (Vista RCL, se carga una sola vez y nunca se actualiza) contra el destino real de cada artículo en <code>inventario_slotting</code> (el plan que usa el resto de la app). Si no coinciden, la Vista RCL está mostrando una ubicación vieja.
            </p>

            {destinosDesactualizados && (
              destinosDesactualizados.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--green)', margin: '10px 0 0' }}>✓ Todos los destinos de Vista RCL coinciden con el plan real.</p>
              ) : (
                <div style={{ marginTop: 10, overflowX: 'auto', maxWidth: '100%' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red)', margin: '0 0 8px' }}>
                    ⚠ {destinosDesactualizados.length} artículo(s) con destino desactualizado en Vista RCL:
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--texto-tenue)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                        <th style={{ padding: '6px 8px' }}>Artículo</th>
                        <th style={{ padding: '6px 8px' }}>Origen RCL</th>
                        <th style={{ padding: '6px 8px' }}>Vista RCL dice</th>
                        <th style={{ padding: '6px 8px' }}>Destino real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {destinosDesactualizados.map((d, i) => (
                        <tr key={`${d.rclCodigo}-${d.rclSubnivel}-${d.articulo}-${i}`} style={{ borderTop: '1px solid var(--borde-claro)' }}>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{d.articulo}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{d.rclCodigo}-C{String(d.rclSubnivel).padStart(3, '0')}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{d.destinoImportado.pasillo}-C{String(d.destinoImportado.columna).padStart(3, '0')}-{d.destinoImportado.nivel}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: d.destinoReal ? 'var(--ink)' : 'var(--red)', fontWeight: d.destinoReal ? 400 : 700 }}>
                            {d.destinoReal ? `${d.destinoReal.pasillo}-C${String(d.destinoReal.columna).padStart(3, '0')}-${d.destinoReal.nivel}` : 'sin lugar reservado'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--borde-claro)', marginTop: 18, paddingTop: 14 }}>
            <button className="btn-secondary" disabled={exportandoLibres} onClick={exportarPosicionesLibres} style={{ fontSize: 12 }}>
              <i className="ti ti-file-export" /> {exportandoLibres ? 'Exportando…' : 'Exportar MZ libres'}
            </button>
            <p className="info-secundaria">
              Descarga un Excel con todos los cuerpos MZ01-MZ08 que tienen algún nivel SIN un RCL asignado en <code>identidad_legacy</code> (no importa si hay mercadería real puesta ahí en <code>inventario_slotting</code>) -- una fila por cuerpo, con las nomenclaturas de sus 5 niveles (N01-N05) en columnas separadas, vacío el nivel que no está libre.
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--borde-claro)', marginTop: 18, paddingTop: 14 }}>
            <button className="btn-danger" disabled={deshaciendo} onClick={reiniciarDesdeCero} style={{ fontSize: 12 }}>
              {deshaciendo ? 'Reiniciando…' : '⚠ Reiniciar migración desde cero'}
            </button>
            <p className="info-secundaria">
              Borra TODO el plan de recolección actual -- se rechaza solo si ya hay algún equipo trabajando, algo en el buffer o algo recolectado (nunca a costa de perder trabajo real).
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 3) EQUIPOS -- quién está trabajando y en qué paso, ahora mismo. */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h3 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--texto-tenue)', margin: '0 0 8px' }}>Equipos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--texto-tenue)', margin: '0 0 8px' }}>Activos ahora {activos && `(${activos.length}/3 de cupo)`}</p>
              <Lista
                items={activos}
                vacio="Ningún equipo trabajando ahora mismo."
                render={s => (
                  <Fila
                    key={s.id}
                    titulo={`${rackDe(s)} -- ${s.estado === 'vaciando' ? 'Vaciando' : 'Recolectando'}`}
                    subtitulo={`Iniciado por ${nombreDe(usuarios, s.iniciadoPor)}, ${new Date(s.iniciadoEn).toLocaleString()}`}
                    acciones={<button className="btn-danger" disabled={procesando === s.id} onClick={() => eliminar(s)} style={{ fontSize: 12 }}>Eliminar</button>}
                  />
                )}
              />
            </div>

            <div>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--texto-tenue)', margin: '0 0 8px' }}>Esperando cupo</p>
              <Lista
                items={esperandoAprobacion}
                vacio="Nadie esperando cupo ahora mismo."
                render={s => (
                  <Fila
                    key={s.id}
                    titulo={rackDe(s)}
                    subtitulo={`Solicitado por ${nombreDe(usuarios, s.iniciadoPor)}, ${new Date(s.iniciadoEn).toLocaleString()}`}
                    acciones={<>
                      <button className="btn-success" disabled={procesando === s.id} onClick={() => aprobar(s.id)} style={{ fontSize: 12 }}>Aprobar</button>
                      <button className="btn-danger" disabled={procesando === s.id} onClick={() => rechazar(s.id)} style={{ fontSize: 12 }}>Rechazar</button>
                    </>}
                  />
                )}
              />
            </div>
          </div>
        </section>
      </div>
    </ModalBase>
  );
}
