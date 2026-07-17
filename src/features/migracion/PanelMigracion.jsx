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
import { planificarSecuencia } from './planificarSecuencia.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

const ESTADOS_ACTIVOS = new Set(['vaciando', 'recolectando']);
// Mismo prefijo fijo que ya usa PanelLimpiarAgotadosRcl.jsx (PREFIJO_MOTIVO) -- no se
// importa desde ahí para no acoplar 2 features por una constante de 1 palabra, pero
// tiene que ser el mismo texto para que este cruce encuentre los mismos artículos.
const PREFIJO_EXILIADO = 'Exiliado';

const rackDe = s => `${s.mzPasillo}-C${String(s.mzColumna).padStart(3, '0')}`;
const nombreDe = (usuarios, id) => (id ? (usuarios.get(id)?.nombre ?? '(usuario eliminado)') : '—');

/** Motivo en lenguaje llano de por qué ESTE rack conviene (o hay que forzarlo) -- la razón real, no solo el rótulo del estado. */
function motivoDe(s) {
  if (s.rompeCiclo) {
    return `Forma parte de un grupo de racks que se necesitan entre sí -- hay que forzarlo para destrabar el resto (va a mantener ${s.nivelesPropios} nivel(es) en el buffer más tiempo del normal).`;
  }
  if (s.libera > 0) {
    return `No depende de ningún otro rack -- libera ${s.libera} rack${s.libera === 1 ? '' : 's'} más apenas se vacíe.`;
  }
  return 'No depende de ningún otro rack -- listo para arrancar cuando quieras.';
}

const COLOR_ESTADO = {
  libre: { fondo: 'var(--verde-tenue, #E6F5E9)', borde: 'var(--green, #1F7A3D)', texto: 'var(--green, #1F7A3D)' },
  aprobacion: { fondo: 'var(--azul-tenue, #E3EEFC)', borde: '#5B8DEF', texto: '#3A66C4' },
  ciclo: { fondo: 'var(--amarillo-tenue, #FDF3D8)', borde: '#D9A72C', texto: '#8A6412' },
};

function EstadoBadge({ slot }) {
  const c = slot.rompeCiclo ? COLOR_ESTADO.ciclo : (slot.requiereAprobacion ? COLOR_ESTADO.aprobacion : COLOR_ESTADO.libre);
  const texto = slot.rompeCiclo ? 'Rompe ciclo' : (slot.requiereAprobacion ? 'Requiere aprobación' : 'Libre');
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', background: c.fondo, border: `1px solid ${c.borde}`, color: c.texto }}>
      {texto}
    </span>
  );
}

/** Qué significa cada color -- pedido explícito del usuario ("qué simbolizan los azules y los verdes"), enumerado para no tener que explicarlo de nuevo cada vez. */
const LEYENDA_ESTADOS = [
  { color: 'libre', titulo: 'Libre', detalle: 'No depende de ningún otro rack todavía sin vaciar. Podés arrancarlo ya, sin pedirle nada a nadie.' },
  { color: 'aprobacion', titulo: 'Requiere aprobación', detalle: 'Sería el 2do o 3er equipo trabajando al mismo tiempo (el cupo base es 1 libre, hasta 3 en total). Un Supervisor o Administrador lo tiene que autorizar antes de que arranque.' },
  { color: 'ciclo', titulo: 'Rompe ciclo', detalle: 'Este rack y otro(s) se necesitan mutuamente -- lo que le falta a uno está en el otro, y viceversa. Hay que forzar el inicio acá para destrabar la cadena; su contenido va a quedar más tiempo del normal en el buffer.' },
];

function Leyenda() {
  return (
    <ol style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {LEYENDA_ESTADOS.map((l, i) => {
        const c = COLOR_ESTADO[l.color];
        return (
          <li key={l.color} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
            <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, background: c.fondo, border: `1px solid ${c.borde}`, color: c.texto, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i + 1}
            </span>
            <span><b>{l.titulo}</b> — <span style={{ color: 'var(--texto-tenue)' }}>{l.detalle}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

function Tarjeta({ valor, etiqueta, color }) {
  const c = COLOR_ESTADO[color];
  return (
    <div style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c?.borde ?? 'var(--borde-claro)'}`, background: c?.fondo ?? 'transparent', minWidth: 92 }}>
      <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: c?.texto ?? 'inherit', lineHeight: 1.2 }}>{valor}</div>
      <div style={{ fontSize: 10.5, color: 'var(--texto-tenue)' }}>{etiqueta}</div>
    </div>
  );
}

/**
 * Resultado de "Simular mejor orden de movimiento" -- pensado para un plan
 * real (cientos de racks). Tarjetas de resumen, una tabla con el TOP 10 y
 * el motivo concreto de cada uno, y el resto agrupado por oleada detrás de
 * un <details> (no se oculta información, solo no se vuelca todo de entrada).
 */
function SimulacionResultado({ simulacion }) {
  const { oleadas, advertencias } = simulacion;
  const todos = oleadas.flat();

  if (todos.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--texto-tenue)' }}>
        {advertencias.map((a, i) => <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0' }}>{a}</p>)}
        {advertencias.length === 0 && <p style={{ margin: 0 }}>No hay ningún rack para sugerir empezar ahora mismo.</p>}
      </div>
    );
  }

  const libres = todos.filter(s => !s.requiereAprobacion && !s.rompeCiclo).length;
  const conAprobacion = todos.filter(s => s.requiereAprobacion).length;
  const rompenCiclo = todos.filter(s => s.rompeCiclo).length;
  const top10 = todos.slice(0, 10);

  return (
    <div style={{ minWidth: 0 }}>
      <Leyenda />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Tarjeta valor={todos.length} etiqueta="racks sugeridos" />
        <Tarjeta valor={oleadas.length} etiqueta="oleadas" />
        <Tarjeta valor={libres} etiqueta="listos ya" color="libre" />
        <Tarjeta valor={conAprobacion} etiqueta="con aprobación" color="aprobacion" />
        <Tarjeta valor={rompenCiclo} etiqueta="rompen ciclo" color="ciclo" />
      </div>

      {advertencias.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--texto-tenue)', border: '1px solid var(--borde-claro)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
          {advertencias.map((a, i) => <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0' }}>{a}</p>)}
        </div>
      )}

      <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Top {top10.length} para empezar</h4>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--texto-tenue)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
              <th style={{ padding: '6px 8px' }}>#</th>
              <th style={{ padding: '6px 8px' }}>Rack</th>
              <th style={{ padding: '6px 8px' }}>Motivo</th>
              <th style={{ padding: '6px 8px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((s, i) => (
              <tr key={rackDe(s)} style={{ borderTop: '1px solid var(--borde-claro)' }}>
                <td style={{ padding: '8px', color: 'var(--texto-tenue)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{rackDe(s)}</td>
                <td style={{ padding: '8px', color: 'var(--texto-tenue)' }}>{motivoDe(s)}</td>
                <td style={{ padding: '8px' }}><EstadoBadge slot={s} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {todos.length > 10 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--green)' }}>
            Ver las {todos.length - 10} posiciones restantes, agrupadas por oleada
          </summary>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {oleadas.map((oleada, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--texto-tenue)', marginBottom: 4 }}>Oleada {i + 1}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {oleada.map(s => {
                    const c = s.rompeCiclo ? COLOR_ESTADO.ciclo : (s.requiereAprobacion ? COLOR_ESTADO.aprobacion : COLOR_ESTADO.libre);
                    return (
                      <span key={rackDe(s)} title={motivoDe(s)} style={{ fontFamily: 'monospace', fontSize: 12, padding: '3px 8px', borderRadius: 6, background: c.fondo, border: `1px solid ${c.borde}` }}>
                        {rackDe(s)}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
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
  if (items === null) return <p style={{ fontSize: 12.5, color: 'var(--texto-tenue)' }}>Cargando…</p>;
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
 * 2. Plan -- calcular/aplicar (F1.5-C) + simular mejor orden (el motor de
 *    planificarSecuencia.js).
 * 3. Equipos -- quién está trabajando, quién espera cupo/confirmación, y
 *    el historial de confirmados (ex "Equipos de migración").
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
  const [simulacion, setSimulacion] = useState(null);
  const [simulando, setSimulando] = useState(false);
  const [exiliadosEnAcomodo, setExiliadosEnAcomodo] = useState(null); // [{articulo, pasillo, columna, nivel, eliminadoEn, motivo}] | null
  const [revisandoExiliados, setRevisandoExiliados] = useState(false);

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
      setSimulacion(null);
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

  async function simular() {
    if (!previa || previa.movimientos.length === 0) return;
    setSimulando(true);
    setError('');
    try {
      const [identidadLegacy, slotsActuales] = await Promise.all([
        identidadLegacyService.listar(),
        migracionSlotsService.listar(),
      ]);
      setSimulacion(planificarSecuencia(previa.movimientos, identidadLegacy, slotsActuales));
    } catch (err) {
      setError(`No se pudo simular el orden: ${err.message || err}`);
    } finally {
      setSimulando(false);
    }
  }

  async function confirmarAplicar() {
    if (!previa || previa.movimientos.length === 0) return;
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
    setPaso('calcular'); setPrevia(null); setResultado(null); setSimulacion(null); setError('');
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
      setSimulacion(null);
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

  async function confirmar(id) {
    if (!confirm('¿Confirmar este traslado como finalizado?')) return;
    setProcesando(id);
    setError('');
    try { await migracionSlotsService.confirmar(id, sesion.usuarioId); await cargar(); }
    catch (err) { setError(`No se pudo confirmar: ${err.message || err}`); }
    finally { setProcesando(null); }
  }

  async function eliminar(s) {
    if (!confirm(`¿Eliminar el traslado de ${rackDe(s)}? Esto libera su cupo y su buffer -- no se puede deshacer.`)) return;
    setProcesando(s.id);
    setError('');
    try {
      await migracionBufferService.eliminarPorSlot(s.id);
      await migracionSlotsService.cancelar(s.id);
      await migracionAuditoriaService.registrar({
        mzPasillo: s.mzPasillo, mzColumna: s.mzColumna, evento: 'traslado_eliminado_admin',
        detalle: `Eliminado por un administrador (estaba en "${s.estado}").`, usuarioId: sesion.usuarioId,
      });
      await cargar();
    } catch (err) {
      setError(`No se pudo eliminar: ${err.message || err}`);
    } finally {
      setProcesando(null);
    }
  }

  async function desaprobar(id) {
    if (!confirm('¿Deshacer esta confirmación? Vuelve a "Bloqueado", esperando confirmación de nuevo.')) return;
    setProcesando(id);
    setError('');
    try { await migracionSlotsService.desconfirmar(id); await cargar(); }
    catch (err) { setError(`No se pudo deshacer la confirmación: ${err.message || err}`); }
    finally { setProcesando(null); }
  }

  const activos = slots?.filter(s => ESTADOS_ACTIVOS.has(s.estado)) ?? null;
  const esperandoAprobacion = slots?.filter(s => s.estado === 'esperando_aprobacion') ?? null;
  const bloqueados = slots?.filter(s => s.estado === 'bloqueado') ?? null;
  const confirmadosRecientes = slots
    ?.filter(s => s.estado === 'confirmado')
    .sort((a, b) => new Date(b.confirmadoEn) - new Date(a.confirmadoEn))
    .slice(0, 20) ?? null;

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
            <Tarjeta valor={bloqueados?.length ?? '—'} etiqueta="esperando confirmación" />
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

              {previa.movimientos.length > 0 && (
                <div style={{ borderTop: '1px solid var(--borde-claro)', paddingTop: 14 }}>
                  <button className="btn-secondary" disabled={simulando} onClick={simular} style={{ marginBottom: 10 }}>
                    {simulando ? 'Simulando…' : 'Simular mejor orden de movimiento'}
                  </button>
                  <p style={{ fontSize: 11.5, color: 'var(--texto-tenue)', margin: '0 0 10px' }}>
                    Calcula en qué orden conviene vaciar los racks -- respeta que vaciar uno puede depender de que OTRO se
                    vacíe antes, y el cupo real de equipos trabajando a la vez (2 cuerpos = 10 niveles c/u, máximo 3).
                  </p>

                  {simulacion && <SimulacionResultado simulacion={simulacion} />}
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
            <p style={{ fontSize: 11, color: 'var(--texto-tenue)', margin: '6px 0 0 0' }}>
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
            <button className="btn-secondary" disabled={deshaciendo} onClick={reiniciarDesdeCero} style={{ fontSize: 12, color: 'var(--red)' }}>
              {deshaciendo ? 'Reiniciando…' : '⚠ Reiniciar migración desde cero'}
            </button>
            <p style={{ fontSize: 11, color: 'var(--texto-tenue)', margin: '6px 0 0' }}>
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
                    acciones={<button className="btn-secondary" disabled={procesando === s.id} onClick={() => eliminar(s)} style={{ fontSize: 12, color: 'var(--red)' }}>Eliminar</button>}
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
                      <button className="btn-primary" disabled={procesando === s.id} onClick={() => aprobar(s.id)} style={{ fontSize: 12 }}>Aprobar</button>
                      <button className="btn-secondary" disabled={procesando === s.id} onClick={() => rechazar(s.id)} style={{ fontSize: 12, color: 'var(--red)' }}>Rechazar</button>
                    </>}
                  />
                )}
              />
            </div>

            <div>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--texto-tenue)', margin: '0 0 8px' }}>Bloqueados -- esperando confirmación</p>
              <Lista
                items={bloqueados}
                vacio="Nada esperando confirmación ahora mismo."
                render={s => (
                  <Fila
                    key={s.id}
                    titulo={rackDe(s)}
                    subtitulo={`Iniciado por ${nombreDe(usuarios, s.iniciadoPor)}`}
                    acciones={<>
                      <button className="btn-primary" disabled={procesando === s.id} onClick={() => confirmar(s.id)} style={{ fontSize: 12 }}>Confirmar</button>
                      <button className="btn-secondary" disabled={procesando === s.id} onClick={() => eliminar(s)} style={{ fontSize: 12, color: 'var(--red)' }}>Eliminar</button>
                    </>}
                  />
                )}
              />
            </div>

            <div>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--texto-tenue)', margin: '0 0 8px' }}>Confirmados recientemente (últimos {confirmadosRecientes?.length ?? 0})</p>
              <Lista
                items={confirmadosRecientes}
                vacio="Todavía no hay ningún traslado confirmado."
                render={s => (
                  <Fila
                    key={s.id}
                    titulo={rackDe(s)}
                    subtitulo={`Iniciado por ${nombreDe(usuarios, s.iniciadoPor)} -- Confirmado por ${nombreDe(usuarios, s.confirmadoPor)}, ${new Date(s.confirmadoEn).toLocaleString()}`}
                    acciones={<>
                      <button className="btn-secondary" disabled={procesando === s.id} onClick={() => desaprobar(s.id)} style={{ fontSize: 12 }}>Desaprobar</button>
                      <button className="btn-secondary" disabled={procesando === s.id} onClick={() => eliminar(s)} style={{ fontSize: 12, color: 'var(--red)' }}>Eliminar</button>
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
