import { Fragment, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Circle, Group } from 'react-konva';
import * as XLSX from 'xlsx';
import { obtenerWarehouseModel } from '../../../domain/crearWarehouseModel.js';
import { nArts, consumoTotal, llenura, colorLlenura } from '../../../domain/formulasOcupacion.js';
import { colorDeClase } from '../../../shared/constants/coloresArticulo.js';
import { calcularLayoutEsquematico, calcularEtiquetas, calcularDivisoresGrupo, calcularCortesPasillo, PASILLOS_VERTICALES, xInicioFilas } from './posicionesEsquematicas.js';
import { calcularVistaAjustada, calcularVistaCentradaEnCelda, interpolarVista, DURACION_ANIMACION_MS, DURACION_ZOOM_BOTON_MS } from './vistaMapa.js';
import { aplicarMovimientosLocales, invertirLote, quitarArticuloLocal } from './movimientosLocales.js';
import { NEGRO_GRAFITO, NEGRO_GRAFITO_CLARO, GRIS_MAPA, GRIS_MAPA_CLARO, VERDE_ESTRUCTURA_CLARO, CAFE_CENIZA, CAFE_CENIZA_CLARO, BLANCO_CALIDO, BLANCO_CALIDO_TENUE, ESTADOS } from './paleta.js';
import BarraPestanas from './BarraPestanas.jsx';
import PanelDetalle from './PanelDetalle.jsx';
import MapaToolbar from './MapaToolbar.jsx';
import BarraMovimiento from './BarraMovimiento.jsx';
import { posicionesService } from '../../../shared/services/posiciones.service.js';
import { escenarioPosicionesService } from '../../salas/escenarioPosiciones.service.js';
import { bloqueosService } from '../../../shared/services/bloqueos.service.js';
import { escenarioBloqueosService } from '../../salas/escenarioBloqueos.service.js';
import { escenarioEliminadosService } from '../../salas/escenarioEliminados.service.js';
import { auditService } from '../../auditoria/audit.service.js';
import { migracionSlotsService } from '../../../shared/services/migracionSlots.service.js';
import { migracionBufferService } from '../../../shared/services/migracionBuffer.service.js';
import { migracionMovimientosService } from '../../../shared/services/migracionMovimientos.service.js';
import { migracionAuditoriaService } from '../../../shared/services/migracionAuditoria.service.js';
import { identidadLegacyService } from '../../../shared/services/identidadLegacy.service.js';
import { inventarioRclService } from '../../../shared/services/inventarioRcl.service.js';
import { construirVistaRcl } from '../../migracion/vistaRcl.js';
import { puedeDevolverDelBuffer } from '../../migracion/flujoMigracionSlot.js';
import { evaluarListoParaIniciar, planificarSecuencia } from '../../migracion/planificarSecuencia.js';
import { detectarDestinosListos, ESTADOS_LISTO_PARA_RECIBIR } from '../../migracion/alertasBuffer.js';
import { puede, ROLES } from '../../auth/roles.js';
import './canvas.css';

const NIVELES_ESTANDAR = ['N01', 'N02', 'N03', 'N04', 'N05'];

const FONDO = GRIS_MAPA;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_PASO = 1.05;
const ZOOM_PASO_BOTON = 1.4; // salto más grande que la rueda -- son clicks deliberados, no scroll continuo
const ESCALA_BUSQUEDA_MIN = 1; // si el usuario está muy alejado, Buscar acerca hasta acá como mínimo

/**
 * Canvas del mapa (react-konva) -- reemplazo visual del iframe legacy con
 * la MISMA capacidad operativa (mover individual/cuerpo completo, bloquear,
 * deshacer, buscar, exportar), restaurada acá con comunicación directa
 * React↔React en vez del puente postMessage que usa el iframe (ver
 * SlottingFrame.jsx). Detrás de MAPA_CANVAS_HABILITADO -- el iframe legacy
 * sigue existiendo intacto, sin tocar, mientras este flag esté apagado.
 *
 * `sesion`/`onCambio` llegan igual que a SlottingFrame -- se usan acá
 * directo (usuarioId para persistir/auditar, onCambio para avisar a una
 * sala que algo cambió), sin pasar por window.postMessage.
 *
 * `forwardRef` expone {activarModoBloqueo, activarModoSeleccion,
 * limpiarSeleccion} -- mismos 3 comandos que la barra de acciones de una
 * sala (SalasView.jsx) ya manda hoy, ahora resueltos DIRECTO acá en vez de
 * un postMessage al iframe (ver SlottingFrame.jsx).
 */
const MapaCanvas = forwardRef(function MapaCanvas({ escenarioId = null, sesion, onCambio, onSeleccionCambia, onSolicitarAddRack, soloLectura = false, mostrarAnadirRack = false }, ref) {
  const [racks, setRacks] = useState(null); // null = cargando
  const [configuracionOcupacion, setConfiguracionOcupacion] = useState(null);
  const [descripcionDe, setDescripcionDe] = useState(() => () => 'Sin descripción disponible');
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 40, y: 40 });
  const [hover, setHover] = useState(null); // {x, y, texto} en coordenadas de pantalla
  const [pestanasAbiertas, setPestanasAbiertas] = useState([]); // ["pasillo|columna", ...] -- orden de apertura, como pestañas de navegador
  const [pestanaActiva, setPestanaActiva] = useState(null);
  const [panelMinimizado, setPanelMinimizado] = useState(false); // minimizado: solo la barra de pestañas, sin tapar el mapa
  const [cerrando, setCerrando] = useState(new Set()); // claves con la animación de cierre en curso (ver cerrarPestana)
  const [tamano, setTamano] = useState({ ancho: 800, alto: 600 });
  const [busqueda, setBusqueda] = useState('');
  const [resultadoBusqueda, setResultadoBusqueda] = useState(null);
  const [celdaResaltada, setCeldaResaltada] = useState(null); // clave "pasillo|columna" con flash momentáneo (ver buscarArticulo)
  const [cambios, setCambios] = useState([]); // pila de LOTES {entradas, articuloEtiqueta, desde, hacia, tipoMovimiento, timestamp} -- alimenta Deshacer, Exportar Y la Terminal de cambios, misma fuente para que no puedan desincronizarse
  const [modoEdicion, setModoEdicion] = useState(false); // arrastrar para mover un cuerpo completo (mismo nombre que "Modo edición" del mapa legacy)
  const [modoBloqueo, setModoBloqueo] = useState(false);
  const [bloqueadas, setBloqueadas] = useState(new Set()); // claves "pasillo|columna" bloqueadas -- no admiten ser origen ni destino de un movimiento
  const [moviendo, setMoviendo] = useState(null); // null | {modo:'cuerpo', origen:{pasillo,columna}} | {modo:'individual', articulo, nivel, clase, tipo, origen:{pasillo,columna,nivel}, destino:null|{pasillo,columna}}
  const [guardando, setGuardando] = useState(false); // evita doble-click mientras un movimiento persiste
  const [errorAccion, setErrorAccion] = useState(null); // mensaje transitorio (destino ocupado/bloqueado/mismo origen, error de guardado)
  const [modoSeleccionArea, setModoSeleccionArea] = useState(false); // SOLO sala -- activado externamente por la barra de acciones (ver useImperativeHandle)
  const [seleccionArea, setSeleccionArea] = useState(new Set());
  const [migracionSlots, setMigracionSlots] = useState(new Map()); // "pasillo|columna" -> {id, estado, ...} -- F2, SOLO mapa real (nunca en sala)
  const [bufferDelSlotActivo, setBufferDelSlotActivo] = useState([]); // contenido del buffer del slot de la pestaña abierta -- ver FlujoMigracionSlot.jsx
  const [movimientosPendientesSlot, setMovimientosPendientesSlot] = useState([]); // lista de pick (F1.5-C) de la pestaña abierta -- ver FlujoMigracionSlot.jsx
  const [movimientosDestinoPorId, setMovimientosDestinoPorId] = useState([]); // TODOS los movimientos pendientes, livianos (id+destino) -- para resolver el destino real de cada artículo del buffer, ver bufferGlobalConEtiquetas
  const [movimientosParaSecuencia, setMovimientosParaSecuencia] = useState([]); // TODOS los movimientos pendientes CON origen RCL (id+destino+rcl) -- para evaluarListoParaIniciar, ver iniciarTraslado
  const [bufferGlobal, setBufferGlobal] = useState([]); // TODO el buffer, sin filtrar por slot -- ver PanelBufferGlobal.jsx
  const [cambiosMigracion, setCambiosMigracion] = useState([]); // eventos de migración para la Terminal -- separado de `cambios` a propósito (ver MapaToolbar.jsx), nunca alimenta Deshacer/Excel
  const [vistaContenido, setVistaContenido] = useState('mz'); // 'mz' | 'rcl' -- F4, toggle de CONTENIDO (no solo etiqueta, ver DECISIONES.md)
  const [identidadLegacy, setIdentidadLegacy] = useState([]);
  const [inventarioRcl, setInventarioRcl] = useState([]);
  const stageRef = useRef(null);
  const contenedorRef = useRef(null);
  const vistaActualRef = useRef({ x: 40, y: 40, escala: 1 }); // última cámara conocida, para animar SIN depender de closures viejas de pos/escala
  const animacionRafRef = useRef(null);
  const resaltadoTimeoutRef = useRef(null);
  const arrastrandoRef = useRef(false); // true durante un drag de Konva -- evita que el hover de OTRAS celdas dispare setHover (y por lo tanto un re-render completo) mientras el puntero pasa por encima al arrastrar, que es lo que hacía sentir el arrastre "pegado"

  useEffect(() => { vistaActualRef.current = { x: pos.x, y: pos.y, escala }; }, [pos, escala]);
  useEffect(() => () => { cancelAnimationFrame(animacionRafRef.current); clearTimeout(resaltadoTimeoutRef.current); }, []);

  // Se apaga sola cuando modoSeleccionArea pasa a false, sin importar quién
  // la apagó (el botón externo de SalasView, o limpiarAreaSeleccionada() al
  // terminar) -- un solo lugar que garantiza que la selección nunca quede
  // "colgada" con el modo ya apagado.
  useEffect(() => {
    if (!modoSeleccionArea) { setSeleccionArea(new Set()); onSeleccionCambia?.(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr cuando el modo cambia de estado, no en cada identidad nueva de onSeleccionCambia
  }, [modoSeleccionArea]);

  /** Comandos externos (SalasView -- ver SlottingFrame.jsx): mismos 3 que el mapa legacy resolvía por postMessage, ahora directo. Sin deps -- siempre se recrea con los closures más frescos, más simple y más seguro que perseguir cada dependencia real. */
  useImperativeHandle(ref, () => ({
    activarModoBloqueo() { setModoBloqueo(v => !v); setModoEdicion(false); setModoSeleccionArea(false); setMoviendo(null); },
    activarModoSeleccion() {
      if (!escenarioId) return; // selección de área es SOLO de sala, igual que en legacy
      setModoSeleccionArea(v => !v); setModoBloqueo(false); setModoEdicion(false); setMoviendo(null);
    },
    limpiarSeleccion() { limpiarAreaSeleccionada(); },
  }));

  const celdas = useMemo(() => calcularLayoutEsquematico(), []);
  const etiquetas = useMemo(() => calcularEtiquetas(), []);
  const divisores = useMemo(() => calcularDivisoresGrupo(), []);
  const cortes = useMemo(() => calcularCortesPasillo(), []);

  const limites = useMemo(() => {
    const maxX = Math.max(...celdas.map(c => c.x + c.ancho));
    const maxY = Math.max(...celdas.map(c => c.y + c.alto));
    return { ancho: maxX, alto: maxY };
  }, [celdas]);

  // Casi toda la pantalla, no el 100% -- deja el margen normal de .app-main
  // (mismo criterio que .slotting-frame en el mapa legacy). Se mide el
  // contenedor real en vez de un tamaño fijo, para que se adapte a
  // cualquier ancho de ventana.
  //
  // Se re-ajusta a pantalla en CADA resize real del contenedor, no solo en
  // el primero -- antes (`inicializadoRef`, solo una vez) un resize
  // posterior (scrollbar que aparece, ventana redimensionada, DevTools) NO
  // recalculaba la cámara: el Stage cambiaba de tamaño pero el encuadre
  // seguía siendo el viejo, dejando contenido cortado en el borde (bug
  // reportado por el usuario). `interactuadoRef` es la salvedad: en cuanto
  // el usuario paneó o hizo zoom a mano (rueda, botones, drag del Stage),
  // se congela -- un resize no debe pisarle un encuadre elegido a propósito.
  // "Restablecer vista" vuelve a poner `interactuadoRef` en `false` (ver
  // restablecerVista()): volver a modo automático es justo lo que ese botón
  // promete.
  const interactuadoRef = useRef(false);
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const nuevoTamano = { ancho: Math.round(width), alto: Math.round(height) };
      setTamano(nuevoTamano);
      if (!interactuadoRef.current) {
        const vista = calcularVistaAjustada(limites, nuevoTamano);
        setPos({ x: vista.x, y: vista.y });
        setEscala(vista.escala);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [limites]);

  useEffect(() => {
    let activo = true;
    (async () => {
      const modelo = await obtenerWarehouseModel(escenarioId).cargar();
      if (!activo) return;
      setRacks(modelo.racks());
      setConfiguracionOcupacion(modelo.configuracionOcupacion);
      setDescripcionDe(() => modelo.descripcion);
      setBloqueadas(new Set(modelo.bloqueos()));
      // F2/F4 -- migración RCL->MZ: SOLO mapa real (ninguna de estas tablas tiene escenario_id).
      if (!escenarioId) {
        const [slots, identidad, inventario, buffer, movimientosDestinos, movimientosSecuencia] = await Promise.all([
          migracionSlotsService.listar(),
          identidadLegacyService.listar(),
          inventarioRclService.listar(),
          migracionBufferService.listarTodo(),
          migracionMovimientosService.listarTodos(),
          migracionMovimientosService.listarPendientesParaSecuencia(),
        ]);
        if (activo) {
          setMigracionSlots(slots); setIdentidadLegacy(identidad); setInventarioRcl(inventario); setBufferGlobal(buffer);
          setMovimientosDestinoPorId(movimientosDestinos); setMovimientosParaSecuencia(movimientosSecuencia);
        }
      }
    })();
    return () => { activo = false; };
  }, [escenarioId]);

  /** Vista RCL (F4) -- misma forma que racks(), pero con el inventario actual por RCL en vez del acomodo MZ. Se recalcula solo si cambia la data cruda (identidad_legacy/inventario_rcl_actual), no en cada render. */
  const vistaRclRacks = useMemo(() => construirVistaRcl(identidadLegacy, inventarioRcl), [identidadLegacy, inventarioRcl]);
  /** Qué Map de racks se MUESTRA -- las mutaciones (mover/bloquear/buffer) siempre operan sobre `racks` (el real), nunca sobre esta vista derivada. */
  const racksVisibles = (!escenarioId && vistaContenido === 'rcl') ? vistaRclRacks : racks;

  /** Código(s) RCL únicos asignados a una posición MZ (una fila por nivel en identidad_legacy, normalmente todas del mismo rack RCL) -- pedido explícito del usuario: mientras dure la migración quiere leer la ficha/pestaña en nomenclatura RCL, no MZ, en la vista RCL. Nunca inventa un código si la posición no tiene ninguno asignado todavía (pendiente_asignar/sin_rcl). */
  const rclPorPosicion = useMemo(() => {
    const mapa = new Map();
    for (const id of identidadLegacy) {
      if (id.estadoRcl !== 'asignado') continue;
      const clave = `${id.mzPasillo}|${id.mzColumna}`;
      const lista = mapa.get(clave) ?? [];
      if (!lista.includes(id.rclCodigo)) lista.push(id.rclCodigo);
      mapa.set(clave, lista);
    }
    return mapa;
  }, [identidadLegacy]);

  /** Etiqueta RCL de una posición para pestañas/ficha -- null si no aplica (vista MZ, o esta posición sigue sin RCL real asignado), para que cada llamador use su propio formato de fallback MZ. */
  function etiquetaRclDe(clave) {
    if (vistaContenido !== 'rcl') return null;
    const codigos = rclPorPosicion.get(clave);
    return codigos && codigos.length > 0 ? codigos.join(' / ') : null;
  }

  const puedeMigrar = !escenarioId && puede(sesion?.rol, 'migrar_slot');
  const puedeConfirmarMigracion = !escenarioId && puede(sesion?.rol, 'confirmar_migracion');
  // Pedido explícito del usuario: Operador ya no elige libremente qué rack
  // empezar (eso generaba variación frente al plan que ya se pensó de
  // antemano) -- solo tiene "Generar movimiento" (ver más abajo). Supervisor
  // y Administrador conservan el botón libre por rack para una intervención
  // manual excepcional.
  const puedeElegirLibremente = sesion?.rol !== ROLES.OPERADOR;

  /** slot.id -> {clave, pasillo, columna, estado} -- resuelve tanto la etiqueta legible ("MZ03-C005") como el estado actual del slot, para el panel de buffer global (que no conoce pasillo/columna, solo slot_origen_id) sin otro round-trip a Supabase. */
  const slotPorId = useMemo(() => {
    const mapa = new Map();
    for (const [clave, slot] of migracionSlots) {
      const [p, c] = clave.split('|');
      mapa.set(slot.id, { clave, pasillo: p, columna: Number(c), estado: slot.estado });
    }
    return mapa;
  }, [migracionSlots]);

  /** movimiento_id -> {mzPasillo, mzColumna} -- resuelve el destino REAL de un artículo del buffer sin otro round-trip por artículo. */
  const destinoPorMovimientoId = useMemo(() => new Map(movimientosDestinoPorId.map(m => [m.id, { mzPasillo: m.mzPasillo, mzColumna: m.mzColumna }])), [movimientosDestinoPorId]);

  /**
   * Buffer global + etiquetas legibles de origen/destino -- honesto sobre lo
   * que no sabe todavía (ver el reclamo del usuario: "no me dice dónde
   * poner lo que dejé"). Ahora que migracion_movimientos tiene datos reales
   * (F1.5-C), `destinoMzPasillo/destinoMzColumna` resuelven el destino real,
   * y `listoParaColocar` dice si ESE destino ya terminó su propio vaciado
   * (ver alertasBuffer.js) -- la cadena de "lo que sale de un RCL, otro
   * destino lo necesita" se vuelve visible acá, artículo por artículo.
   * `puedeDevolver` habilita "devolver" SOLO mientras el slot de origen
   * sigue en vaciando/recolectando -- una vez bloqueado ya está esperando
   * al supervisor, no se vuelve atrás.
   */
  const bufferGlobalConEtiquetas = useMemo(() => bufferGlobal.map(b => {
    const slot = slotPorId.get(b.slotOrigenId);
    const etiqueta = slot ? `${slot.pasillo}-C${String(slot.columna).padStart(3, '0')}` : '?';
    const destino = b.movimientoId ? destinoPorMovimientoId.get(b.movimientoId) : null;
    const slotDestino = destino ? migracionSlots.get(`${destino.mzPasillo}|${destino.mzColumna}`) : null;
    const listoParaColocar = destino && ESTADOS_LISTO_PARA_RECIBIR.includes(slotDestino?.estado);
    return {
      ...b,
      origen: `${etiqueta}-${b.origenNivel}`,
      destinoMzPasillo: destino?.mzPasillo ?? null,
      destinoMzColumna: destino?.mzColumna ?? null,
      listoParaColocar,
      destino: destino
        ? `${destino.mzPasillo}-C${String(destino.mzColumna).padStart(3, '0')}${listoParaColocar ? ' -- listo, ya podés colocarlo' : ' -- todavía vaciando ese destino'}`
        : 'Sin destino resuelto -- puede ser que el plan de recolección no cubra este artículo (sin stock real en su origen, o falta generarlo/actualizarlo)',
      puedeDevolver: puedeMigrar && puedeDevolverDelBuffer(slot?.estado),
    };
  }), [bufferGlobal, slotPorId, puedeMigrar, destinoPorMovimientoId, migracionSlots]);

  /** Destinos que ya juntaron suficiente en el buffer y están listos para recibir -- ver alertasBuffer.js. Se recalcula solo (derivado, nunca persistido), sigue la cadena real sin importar en qué orden trabajen los operadores. */
  const alertasDestinoListo = useMemo(() => detectarDestinosListos(bufferGlobalConEtiquetas, migracionSlots), [bufferGlobalConEtiquetas, migracionSlots]);

  async function refrescarBufferGlobal() {
    setBufferGlobal(await migracionBufferService.listarTodo());
  }

  /** Contenido del buffer del slot de la pestaña abierta -- se recarga cada vez que cambia de pestaña o el estado del slot avanza (ver depositarEnBuffer/marcarVaciadoCompleto, que también lo refrescan directo tras cada acción). */
  useEffect(() => {
    let activo = true;
    (async () => {
      const slot = pestanaActiva ? migracionSlots.get(pestanaActiva) : null;
      if (!slot || (slot.estado !== 'vaciando' && slot.estado !== 'recolectando')) { setBufferDelSlotActivo([]); return; }
      const buffer = await migracionBufferService.listarPorSlot(slot.id);
      if (activo) setBufferDelSlotActivo(buffer);
    })();
    return () => { activo = false; };
  }, [pestanaActiva, migracionSlots]);

  /**
   * Ruta activa de migración (pedido explícito del usuario: "alumbrar" el
   * origen que se está vaciando y hacia dónde van esos artículos) -- SOLO
   * mientras la pestaña abierta está vaciando/recolectando, nunca en reposo
   * (mismo criterio del spec original: nada dibujado si no hay un traslado
   * activo). Resuelve el destino real de cada artículo del buffer de ESTE
   * slot con el mismo mapa que ya arma bufferGlobalConEtiquetas.
   */
  const rutaMigracionActiva = useMemo(() => {
    if (!pestanaActiva) return null;
    const slot = migracionSlots.get(pestanaActiva);
    if (!slot || (slot.estado !== 'vaciando' && slot.estado !== 'recolectando')) return null;
    const [pasillo, columna] = pestanaActiva.split('|');
    const destinos = new Map();
    for (const b of bufferDelSlotActivo) {
      const destino = b.movimientoId ? destinoPorMovimientoId.get(b.movimientoId) : null;
      if (!destino) continue;
      const claveDestino = `${destino.mzPasillo}|${destino.mzColumna}`;
      if (claveDestino === pestanaActiva) continue; // el propio origen no se resalta dos veces como destino
      destinos.set(claveDestino, { pasillo: destino.mzPasillo, columna: destino.mzColumna });
    }
    if (destinos.size === 0) return null;
    return { origen: { pasillo, columna: Number(columna) }, destinos: [...destinos.values()] };
  }, [pestanaActiva, migracionSlots, bufferDelSlotActivo, destinoPorMovimientoId]);

  /** Lista de pick (F1.5-C) del destino MZ de la pestaña abierta -- independiente del estado del slot (la ficha decide cuándo mostrarla, ver FlujoMigracionSlot.jsx). Vacía si escenarioId (sala) o si no hay pestaña abierta. */
  useEffect(() => {
    let activo = true;
    (async () => {
      if (escenarioId || !pestanaActiva) { setMovimientosPendientesSlot([]); return; }
      const [p, c] = pestanaActiva.split('|');
      const movimientos = await migracionMovimientosService.listarPorDestino(p, Number(c));
      if (activo) setMovimientosPendientesSlot(movimientos);
    })();
    return () => { activo = false; };
  }, [pestanaActiva, escenarioId]);

  /** Marca UN artículo de la lista de pick como ya recolectado -- refresca la lista de esta pestaña para reflejarlo al toque. */
  async function marcarRecolectadoMovimiento(id) {
    try {
      await migracionMovimientosService.marcarRecolectado(id, sesion?.usuarioId);
      setMovimientosPendientesSlot(actuales => actuales.map(m => (m.id === id ? { ...m, estado: 'recolectado' } : m)));
    } catch {
      mostrarError('No se pudo marcar como recolectado. Revisá tu conexión e intentá de nuevo.');
    }
  }

  function manejarRueda(e) {
    e.evt.preventDefault();
    interactuadoRef.current = true;
    const stage = stageRef.current;
    if (!stage) return;
    const puntero = stage.getPointerPosition();
    const escalaAnterior = escala;
    const puntoReal = { x: (puntero.x - pos.x) / escalaAnterior, y: (puntero.y - pos.y) / escalaAnterior };
    const nuevaEscala = e.evt.deltaY < 0 ? escalaAnterior * ZOOM_PASO : escalaAnterior / ZOOM_PASO;
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nuevaEscala));
    setEscala(clamped);
    setPos({ x: puntero.x - puntoReal.x * clamped, y: puntero.y - puntoReal.y * clamped });
  }

  function celdaEnPantalla(c) {
    return { x: c.x * escala + pos.x, y: c.y * escala + pos.y, ancho: c.ancho * escala, alto: c.alto * escala };
  }

  /** Anima la cámara (pos+escala) hacia `destino` -- usado por Restablecer vista, Buscar y los botones de zoom. Nunca un salto (pedido explícito: "similar a Google Maps o AutoCAD"). */
  function animarVistaA(destino, duracion = DURACION_ANIMACION_MS) {
    cancelAnimationFrame(animacionRafRef.current);
    const desde = vistaActualRef.current;
    const inicio = performance.now();
    function cuadro(ahora) {
      const progreso = (ahora - inicio) / duracion;
      const vista = interpolarVista(desde, destino, progreso);
      setPos({ x: vista.x, y: vista.y });
      setEscala(vista.escala);
      if (progreso < 1) animacionRafRef.current = requestAnimationFrame(cuadro);
    }
    animacionRafRef.current = requestAnimationFrame(cuadro);
  }

  /** "Restablecer vista" (Reset View): centra TODO el layout y ajusta el zoom para que entre completo -- fit to screen. Vuelve a modo automático (ver interactuadoRef arriba): un resize posterior vuelve a reajustar solo. */
  function restablecerVista() {
    interactuadoRef.current = false;
    animarVistaA(calcularVistaAjustada(limites, tamano));
  }

  function zoomBoton(factor) {
    interactuadoRef.current = true;
    const centro = { x: tamano.ancho / 2, y: tamano.alto / 2 };
    const actual = vistaActualRef.current;
    const puntoReal = { x: (centro.x - actual.x) / actual.escala, y: (centro.y - actual.y) / actual.escala };
    const nuevaEscala = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, actual.escala * factor));
    animarVistaA({ x: centro.x - puntoReal.x * nuevaEscala, y: centro.y - puntoReal.y * nuevaEscala, escala: nuevaEscala }, DURACION_ZOOM_BOTON_MS);
  }

  /** Mismo criterio que buscar() del mapa legacy (substring, primer match) -- pero en vez de scrollIntoView anima la cámara y abre la pestaña del rack encontrado, para que "nunca te sientas perdido" también aplique al resultado de una búsqueda. */
  function buscarArticulo(texto) {
    setBusqueda(texto);
    const q = texto.trim().toLowerCase();
    if (!q) { setResultadoBusqueda(null); return; }
    for (const celda of celdas) {
      const rack = racksVisibles.get(`${celda.pasillo}|${celda.columna}`);
      if (!rack) continue;
      for (const nivel in rack.niveles) {
        const encontrado = rack.niveles[nivel].find(a => a.articulo.toLowerCase().includes(q));
        if (encontrado) {
          const escalaDestino = Math.max(vistaActualRef.current.escala, ESCALA_BUSQUEDA_MIN);
          animarVistaA(calcularVistaCentradaEnCelda(celda, tamano, escalaDestino));
          abrirPestana(`${celda.pasillo}|${celda.columna}`);
          const clave = `${celda.pasillo}|${celda.columna}`;
          setResultadoBusqueda(`✓ ${encontrado.articulo} → ${celda.pasillo}-C${String(celda.columna).padStart(3, '0')}`);
          setCeldaResaltada(clave);
          clearTimeout(resaltadoTimeoutRef.current);
          resaltadoTimeoutRef.current = setTimeout(() => setCeldaResaltada(null), 1400);
          return;
        }
      }
    }
    setResultadoBusqueda('No encontrado.');
  }

  /** Misma lógica de 2 hojas que exportar() del mapa legacy (11-buscar-exportar.js): estado completo + hoja "Cambios" -- lee de `cambios`, la MISMA pila que alimenta Deshacer, para que nunca puedan desincronizarse. */
  function exportarExcel() {
    const filas = [['Articulo', 'Ubicacion_nueva', 'Pasillo', 'Columna', 'Nivel', 'Clase', 'Tipo', 'Picks', 'Consumo', 'Rack_actual', 'Niveles_a_armar']];
    for (const celda of celdas) {
      const rack = racks.get(`${celda.pasillo}|${celda.columna}`);
      if (!rack) continue;
      const col = String(celda.columna).padStart(3, '0');
      for (const nivel in rack.niveles) {
        for (const a of rack.niveles[nivel]) {
          const ubic = nivel === 'CUERPO' ? `${celda.pasillo}-C${col}-CUERPO ENTERO (N01-N05)` : `${celda.pasillo}-C${col}-${nivel}-1`;
          filas.push([a.articulo, ubic, celda.pasillo, `C${col}`, nivel, a.clase, a.tipo, a.picks, a.consumo, a.rackActual, a.nivelesAArmar]);
        }
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Slotting');
    if (cambios.length > 0) {
      const filasCambios = [['Articulo', 'DESDE (slot original)', 'HACIA (editado)']];
      cambios.forEach(lote => filasCambios.push([lote.articuloEtiqueta, lote.desde, lote.hacia]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasCambios), 'Cambios');
    }
    XLSX.writeFile(wb, 'Slotting_editado.xlsx');
  }

  function formatoUbicacion(pasillo, columna, nivel) {
    const col = String(columna).padStart(3, '0');
    return nivel === 'CUERPO' ? `${pasillo}-C${col}-CUERPO ENTERO (N01-N05)` : `${pasillo}-C${col}-${nivel}`;
  }

  function mostrarError(mensaje) {
    setErrorAccion(mensaje);
    setTimeout(() => setErrorAccion(m => (m === mensaje ? null : m)), 3000);
  }

  /**
   * Persiste un LOTE de posiciones en UNA sola llamada -- mapa real vía
   * posicionesService.guardarLote(), sala vía escenarioPosicionesService.guardarLote()
   * (ambos ya existían para la carga masiva desde Excel, un solo upsert con
   * N filas). Antes esto llamaba a guardar() artículo por artículo dentro
   * de un for/await secuencial: mover un cuerpo con, por ej., 30 artículos
   * hacía 30 round-trips a Supabase UNO DETRÁS DEL OTRO antes de soltar
   * "Guardando…" -- exactamente el retraso que reportó el usuario al mover
   * cuerpos completos en Modo edición.
   */
  async function guardarLotePosiciones(filas) {
    if (escenarioId) {
      await escenarioPosicionesService.guardarLote(escenarioId, filas, sesion?.usuarioId);
    } else {
      await posicionesService.guardarLote(filas, sesion?.usuarioId);
    }
  }

  async function toggleBloqueoServicio(clave, pasillo, columna, actualmenteBloqueada) {
    if (escenarioId) {
      if (actualmenteBloqueada) await escenarioBloqueosService.desbloquear(escenarioId, clave);
      else await escenarioBloqueosService.bloquear({ escenarioId, key: clave, pasillo, columna, usuarioId: sesion?.usuarioId });
    } else {
      if (actualmenteBloqueada) await bloqueosService.desbloquear(clave);
      else await bloqueosService.bloquear({ key: clave, pasillo, columna, usuarioId: sesion?.usuarioId });
    }
  }

  /** Click en una celda con Modo bloqueo activo -- togglea, persiste, y si falla revierte el visual (mismo criterio que toggleBloqueo() legacy, que nunca queda en un estado a medias). */
  async function alternarBloqueo(pasillo, columna) {
    const clave = `${pasillo}|${columna}`;
    const actualmenteBloqueada = bloqueadas.has(clave);
    setBloqueadas(actuales => { const s = new Set(actuales); if (actualmenteBloqueada) s.delete(clave); else s.add(clave); return s; });
    try {
      await toggleBloqueoServicio(clave, pasillo, columna, actualmenteBloqueada);
      if (escenarioId) onCambio?.();
    } catch {
      setBloqueadas(actuales => { const s = new Set(actuales); if (actualmenteBloqueada) s.add(clave); else s.delete(clave); return s; });
      mostrarError('No se pudo guardar el bloqueo. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /** Botón "Mover cuerpo" del panel -- arma el estado, el próximo click en el mapa (ver manejarClickCelda) es el destino. */
  function iniciarMoverCuerpo(pasillo, columna) {
    if (bloqueadas.has(`${pasillo}|${columna}`)) { mostrarError('Esa posición está bloqueada.'); return; }
    setMoviendo({ modo: 'cuerpo', origen: { pasillo, columna } });
  }

  /** Botón "Mover" de un artículo puntual del panel -- primero destino (click en el mapa), después nivel (chips de la barra de movimiento). */
  function iniciarMoverArticulo(clave, articulo, nivel, clase, tipo) {
    const [pasillo, columna] = clave.split('|');
    if (bloqueadas.has(clave)) { mostrarError('Esa posición está bloqueada.'); return; }
    setMoviendo({ modo: 'individual', articulo, clase, tipo, origen: { pasillo, columna: Number(columna), nivel }, destino: null });
  }

  function cancelarMovimiento() {
    setMoviendo(null);
  }

  /**
   * Aplica un lote de movimientos: estado local PRIMERO (de verdad optimista
   * -- se pinta en el mismo instante en que Konva devuelve el nodo a su
   * lugar, ver manejarFinDrag) y la persistencia/auditoría corren después,
   * en segundo plano. Antes el orden era al revés (esperaba la respuesta de
   * Supabase para recién ahí actualizar `racks`), lo que hacía que el rack
   * "reapareciera" un instante en el origen -- porque el nodo de Konva ya
   * había vuelto a (0,0) -- y recién después saltara al destino. Si falla
   * la persistencia, se revierte el estado local (invertirLote) y se avisa.
   */
  async function aplicarLote(entradas, { articuloEtiqueta, desde, hacia, tipoMovimiento }) {
    setGuardando(true);
    setRacks(actuales => aplicarMovimientosLocales(actuales, entradas));
    // Se guarda el LOTE completo (no solo `entradas`) -- desde/hacia/timestamp
    // alimentan la Terminal de cambios Y la hoja "Cambios" del Excel, misma
    // fuente que Deshacer, nunca pueden desincronizarse. Antes solo se
    // guardaba `entradas` (sin desde/hacia): exportarExcel() leía `c.desde`/
    // `c.hacia` de ahí, que nunca existieron -- la hoja "Cambios" siempre
    // salía con esas columnas vacías, bug real corregido acá de paso.
    const lote = { entradas, articuloEtiqueta, desde, hacia, tipoMovimiento, timestamp: Date.now() };
    setCambios(actuales => [...actuales, lote]);
    try {
      await guardarLotePosiciones(entradas.map(entrada => ({
        articulo: entrada.articulo, pasillo: entrada.destino.pasillo, columna: entrada.destino.columna,
        nivel: entrada.destino.nivel, clase: entrada.clase, tipo: entrada.tipo,
      })));
      if (!escenarioId) {
        await auditService.registrarMovimiento({
          usuarioId: sesion?.usuarioId, usuarioNombre: sesion?.nombre, ip: sesion?.ip,
          articulo: articuloEtiqueta, desde, hacia, tipoMovimiento,
        });
      } else {
        onCambio?.();
      }
    } catch {
      setRacks(actuales => aplicarMovimientosLocales(actuales, invertirLote(entradas)));
      setCambios(actuales => actuales.slice(0, -1));
      mostrarError('No se pudo guardar el movimiento. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setGuardando(false);
      setMoviendo(null);
    }
  }

  /** Nivel elegido en la barra de movimiento (mover individual) -- último paso del flujo iniciado por iniciarMoverArticulo(). */
  function confirmarNivelIndividual(nivelDestino) {
    if (!moviendo?.destino) return;
    const { articulo, clase, tipo, origen, destino } = moviendo;
    const entrada = { articulo, clase, tipo, origen, destino: { ...destino, nivel: nivelDestino } };
    aplicarLote([entrada], {
      articuloEtiqueta: articulo,
      desde: formatoUbicacion(origen.pasillo, origen.columna, origen.nivel),
      hacia: formatoUbicacion(destino.pasillo, destino.columna, nivelDestino),
      tipoMovimiento: 'individual',
    });
  }

  /** Mover TODO un cuerpo -- mismas validaciones que soltarCuerpoEn() legacy: no al mismo origen, destino vacío, destino no bloqueado. Un solo camino para el botón del panel y el drag-and-drop de Modo edición. */
  function ejecutarMoverCuerpo(origenPasillo, origenColumna, destinoPasillo, destinoColumna) {
    const claveOrigen = `${origenPasillo}|${origenColumna}`;
    const claveDestino = `${destinoPasillo}|${destinoColumna}`;
    if (claveOrigen === claveDestino) { mostrarError('Es el mismo rack de origen.'); return; }
    if (bloqueadas.has(claveDestino)) { mostrarError(`${destinoPasillo}-C${String(destinoColumna).padStart(3, '0')} está bloqueado.`); return; }
    const rackOrigen = racks.get(claveOrigen);
    if (!rackOrigen || nArts(rackOrigen) === 0) return;
    const rackDestino = racks.get(claveDestino);
    if (rackDestino && nArts(rackDestino) > 0) { mostrarError(`${destinoPasillo}-C${String(destinoColumna).padStart(3, '0')} no está vacío.`); return; }

    const entradas = [];
    for (const nivel in rackOrigen.niveles) {
      for (const a of rackOrigen.niveles[nivel]) {
        entradas.push({
          articulo: a.articulo, clase: a.clase, tipo: a.tipo,
          origen: { pasillo: origenPasillo, columna: origenColumna, nivel },
          destino: { pasillo: destinoPasillo, columna: destinoColumna, nivel },
        });
      }
    }
    aplicarLote(entradas, {
      articuloEtiqueta: `cuerpo completo (${entradas.length} art)`,
      desde: `${origenPasillo}-C${String(origenColumna).padStart(3, '0')}`,
      hacia: `${destinoPasillo}-C${String(destinoColumna).padStart(3, '0')}`,
      tipoMovimiento: 'cuerpo',
    });
  }

  /**
   * Deshacer el último lote -- mismo criterio que deshacer() legacy: si fue
   * un cuerpo completo (N artículos), los N vuelven juntos en un solo click,
   * no uno por uno. Optimista igual que aplicarLote(): el estado local se
   * revierte YA, la persistencia corre después; si falla, se vuelve a
   * aplicar el lote original (queda como si nunca se hubiera deshecho).
   */
  function deshacerUltimo() {
    if (cambios.length === 0) return;
    const ultimoLote = cambios[cambios.length - 1];
    setGuardando(true);
    setRacks(actuales => aplicarMovimientosLocales(actuales, invertirLote(ultimoLote.entradas)));
    setCambios(actuales => actuales.slice(0, -1));
    guardarLotePosiciones(ultimoLote.entradas.map(entrada => ({
      articulo: entrada.articulo, pasillo: entrada.origen.pasillo, columna: entrada.origen.columna,
      nivel: entrada.origen.nivel, clase: entrada.clase, tipo: entrada.tipo,
    })))
      .then(async () => {
        if (!escenarioId) {
          // Auditoría del deshecho: misma etiqueta que el movimiento original,
          // desde/hacia invertidos (se está volviendo de "hacia" a "desde").
          await auditService.registrarDeshecho({
            usuarioId: sesion?.usuarioId, usuarioNombre: sesion?.nombre, ip: sesion?.ip,
            articulo: ultimoLote.articuloEtiqueta, desde: ultimoLote.hacia, hacia: ultimoLote.desde,
          });
        } else {
          onCambio?.();
        }
      })
      .catch(() => {
        setRacks(actuales => aplicarMovimientosLocales(actuales, ultimoLote.entradas));
        setCambios(actuales => [...actuales, ultimoLote]);
        mostrarError('No se pudo deshacer. Revisá tu conexión e intentá de nuevo.');
      })
      .finally(() => setGuardando(false));
  }

  /** Click en una celda con Selección de área activa (SOLO sala) -- togglea, avisa el conteo a React (ver onSeleccionCambia, igual que notificarSeleccionArea() legacy). */
  function alternarSeleccionArea(clave) {
    setSeleccionArea(actuales => {
      const s = new Set(actuales);
      if (s.has(clave)) s.delete(clave); else s.add(clave);
      onSeleccionCambia?.(s.size);
      return s;
    });
  }

  /** Vacía un conjunto de posiciones (SOLO sala) -- vía escenarioEliminadosService, nunca toca el mapa real. Compartido por limpiarAreaSeleccionada() (multi-selección) y limpiarSlotIndividual() (un solo rack, desde el panel de detalle). */
  async function vaciarPosiciones(claves) {
    const articulos = [];
    for (const clave of claves) {
      const rack = racks.get(clave);
      if (!rack) continue;
      for (const nivel in rack.niveles) for (const a of rack.niveles[nivel]) articulos.push(a.articulo);
    }
    await Promise.all(articulos.map(articulo => escenarioEliminadosService.marcarEliminado({ escenarioId, articulo, usuarioId: sesion?.usuarioId })));
    setRacks(actuales => { const copia = new Map(actuales); claves.forEach(c => copia.delete(c)); return copia; });
    onCambio?.();
  }

  /** "Limpiar área" -- SOLO sala, invocado externamente (ver useImperativeHandle). Misma confirmación y mismo efecto que limpiarAreaSeleccionada() legacy: vacía TODOS los artículos de las posiciones seleccionadas. */
  async function limpiarAreaSeleccionada() {
    if (!escenarioId) return;
    if (seleccionArea.size === 0) { mostrarError('Primero tocá "Seleccionar área" y elegí al menos una posición.'); return; }
    if (!confirm(`¿Vaciar ${seleccionArea.size} posición(es) seleccionada(s) en esta sala? Esta acción no se puede deshacer.`)) return;
    try {
      await vaciarPosiciones([...seleccionArea]);
      setSeleccionArea(new Set());
      setModoSeleccionArea(false);
    } catch {
      mostrarError('No se pudo limpiar el área. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /** "🧹 Limpiar slot" -- SOLO sala, vacía UN rack puntual desde el botón del panel de detalle (distinto de "Limpiar área", que es multi-selección). Mismo criterio que limpiarSlot() del mapa legacy (07-render.js/08-interacciones.js): solo visible con artículos, con la misma confirmación. */
  async function limpiarSlotIndividual(pasillo, columna) {
    if (!escenarioId) return;
    if (!confirm(`¿Vaciar la posición ${pasillo}-C${String(columna).padStart(3, '0')} en esta sala? Esta acción no se puede deshacer.`)) return;
    try {
      await vaciarPosiciones([`${pasillo}|${columna}`]);
    } catch {
      mostrarError('No se pudo vaciar el slot. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /** Entradas de migración para la Terminal (F2) -- lista APARTE de `cambios` (ver MapaToolbar.jsx), nunca alimenta Deshacer ni el Excel. */
  function registrarCambioMigracion(articuloEtiqueta, desde, hacia, tipoMovimiento) {
    setCambiosMigracion(actuales => [...actuales, { articuloEtiqueta, desde, hacia, tipoMovimiento, timestamp: Date.now() }]);
  }

  /**
   * Paso 1 del flujo guiado (F2) -- "Iniciar traslado": intenta crear el
   * slot en 'vaciando'. El cupo de equipos activos (2 cuerpos = 10 niveles
   * c/u, máximo 3 concurrentes) lo decide un trigger de la base -- si ya
   * hay 1 o 2 equipos activos, la fila vuelve en 'esperando_aprobacion' en
   * vez de 'vaciando' aunque acá se haya pedido lo segundo; si ya hay 3, el
   * insert lanza una excepción ("cupo lleno"). Por eso se lee el `estado`
   * REAL devuelto, nunca se asume 'vaciando'.
   *
   * ANTES de eso: chequea si este rack está listo (mismo motor de
   * dependencias que "Simular mejor orden de movimiento", ver
   * evaluarListoParaIniciar en planificarSecuencia.js) -- pedido explícito
   * del usuario: dejar que cada equipo elija libremente qué rack empezar,
   * sin este chequeo, permitía que dos equipos trabajando en simultáneo
   * eligieran racks que se necesitan mutuamente en el orden equivocado, y
   * nada lo impedía. Si está bloqueado, ni siquiera se intenta el insert.
   */
  async function iniciarTraslado(pasillo, columna) {
    const etiqueta = `${pasillo}-C${String(columna).padStart(3, '0')}`;
    const { listo, bloqueadoPor } = evaluarListoParaIniciar(pasillo, columna, movimientosParaSecuencia, identidadLegacy, migracionSlots);
    if (!listo) {
      const racks = bloqueadoPor.map(b => `${b.mzPasillo}-C${String(b.mzColumna).padStart(3, '0')}`).join(', ');
      mostrarError(`Todavía no podés iniciar ${etiqueta} -- depende de que se vacíe(n) primero: ${racks}.`);
      return;
    }
    try {
      const { id: slotId, estado } = await migracionSlotsService.iniciar({ mzPasillo: pasillo, mzColumna: columna, usuarioId: sesion?.usuarioId });
      setMigracionSlots(actuales => new Map(actuales).set(`${pasillo}|${columna}`, { id: slotId, estado }));
      if (estado === 'esperando_aprobacion') {
        registrarCambioMigracion(`Traslado ${etiqueta}`, 'Pendiente', 'Esperando aprobación', 'solicitado');
        mostrarError('Ya hay equipos trabajando al máximo de su cupo libre -- se solicitó aprobación a un Supervisor/Administrador.');
      } else {
        registrarCambioMigracion(`Traslado ${etiqueta}`, 'Pendiente', 'Vaciando', 'iniciado');
      }
    } catch (err) {
      // console.error temporal: el mensaje genérico de abajo no distingue un
      // rechazo de RLS (rol real en `profiles` sin `migrar_slot`) de un
      // problema de red -- diagnóstico real reportado por el usuario
      // ("iniciar traslados no he podido").
      console.error('iniciarTraslado', err);
      const cupoLleno = /cupo lleno/i.test(err?.message ?? '');
      mostrarError(cupoLleno
        ? 'Cupo lleno -- ya hay 3 equipos trabajando en simultáneo. Esperá a que se libere uno.'
        : 'No se pudo iniciar el traslado. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /** Navega la cámara al rack + abre su pestaña -- mismo trío que ya usa buscarArticulo() (animarVistaA/calcularVistaCentradaEnCelda/abrirPestana), reutilizado para que "Generar movimiento" deje al operador mirando directo su tarea asignada, sin que tenga que buscarla. */
  function navegarYAbrir(pasillo, columna) {
    const celda = celdas.find(c => c.pasillo === pasillo && c.columna === columna);
    if (celda) {
      const escalaDestino = Math.max(vistaActualRef.current.escala, ESCALA_BUSQUEDA_MIN);
      animarVistaA(calcularVistaCentradaEnCelda(celda, tamano, escalaDestino));
    }
    abrirPestana(`${pasillo}|${columna}`);
  }

  /** Código Postgres de violación de UNIQUE, expuesto por Supabase-JS en err.code -- migracion_slots tiene PK (mz_pasillo, mz_columna), así que dos "Generar movimiento" casi simultáneos que caen en el mismo candidato producen esto en el segundo insert. */
  function esConflictoDeClaveUnica(err) {
    return err?.code === '23505';
  }

  /**
   * "Generar movimiento" (F2) -- pedido explícito del usuario: el Operador
   * ya no elige qué rack empezar (ver `puedeElegirLibremente` más arriba;
   * Supervisor/Administrador siguen usando `iniciarTraslado` libre). El
   * sistema le asigna el próximo según el MISMO motor que ya arma "Simular
   * mejor orden de movimiento" (planificarSecuencia.js) -- la oleada 0 es
   * exactamente "los racks listos para arrancar ahora mismo, ya ordenados".
   * Sin tabla ni cola nueva: `migracion_slots` + ese motor ya alcanzan.
   */
  async function generarMovimiento() {
    // 1) ¿ya tiene una tarea propia sin terminar? No se le asigna una
    // segunda -- se lo lleva de vuelta a la que ya tenía. "Bloqueado" no
    // cuenta acá: ahí ya terminó su parte física, está libre de tomar otra.
    const propia = [...migracionSlots.entries()].find(([, s]) =>
      s.iniciadoPor === sesion?.usuarioId && ['vaciando', 'recolectando', 'esperando_aprobacion'].includes(s.estado)
    );
    if (propia) {
      const [clave] = propia;
      const [p, c] = clave.split('|');
      navegarYAbrir(p, Number(c));
      mostrarError(`Ya tenés una tarea en curso: ${p}-C${String(c).padStart(3, '0')}.`);
      return;
    }

    // 2) candidatos listos AHORA, ya ordenados por el simulador (oleada 0).
    const { oleadas } = planificarSecuencia(movimientosParaSecuencia, identidadLegacy, migracionSlots);
    const candidatos = oleadas[0] ?? [];
    if (candidatos.length === 0) {
      mostrarError('No hay ningún rack disponible para asignar ahora mismo.');
      return;
    }

    // 3) reclamar con reintento -- SOLO ante la carrera esperada (alguien
    // más se adelantó al mismo candidato); cualquier otro error se muestra
    // normal, sin seguir probando el resto de la lista.
    for (const candidato of candidatos) {
      const etiqueta = `${candidato.mzPasillo}-C${String(candidato.mzColumna).padStart(3, '0')}`;
      try {
        const { id: slotId, estado } = await migracionSlotsService.iniciar({ mzPasillo: candidato.mzPasillo, mzColumna: candidato.mzColumna, usuarioId: sesion?.usuarioId });
        setMigracionSlots(actuales => new Map(actuales).set(`${candidato.mzPasillo}|${candidato.mzColumna}`, { id: slotId, estado }));
        navegarYAbrir(candidato.mzPasillo, candidato.mzColumna);
        if (estado === 'esperando_aprobacion') {
          registrarCambioMigracion(`Traslado ${etiqueta}`, 'Pendiente', 'Esperando aprobación', 'solicitado');
          mostrarError(`Tu tarea: ${etiqueta} -- ya hay equipos trabajando al máximo de su cupo libre, se solicitó aprobación a un Supervisor/Administrador.`);
        } else {
          registrarCambioMigracion(`Traslado ${etiqueta}`, 'Pendiente', 'Vaciando', 'iniciado');
          mostrarError(`Tu tarea: ${etiqueta}.`);
        }
        return;
      } catch (err) {
        if (esConflictoDeClaveUnica(err)) continue;
        console.error('generarMovimiento', err);
        const cupoLleno = /cupo lleno/i.test(err?.message ?? '');
        mostrarError(cupoLleno
          ? 'Cupo lleno -- ya hay 3 equipos trabajando en simultáneo. Esperá a que se libere uno.'
          : 'No se pudo asignar el movimiento. Revisá tu conexión e intentá de nuevo.');
        return;
      }
    }
    mostrarError('Los racks disponibles se asignaron justo antes que vos -- probá de nuevo.');
  }

  /**
   * Paso 1 (vaciar): mueve UN artículo al buffer -- persiste en
   * migracion_buffer (con auto-resolución de destino/snapshot de RCL, ver
   * migracionBuffer.service.js) y lo saca del rack EN MEMORIA (optimista,
   * mismo criterio que aplicarLote()). Si el rack queda en 0 artículos,
   * dispara automáticamente la confirmación en lote (ver
   * marcarVaciadoCompleto abajo) -- no es un botón aparte.
   */
  async function depositarEnBuffer(pasillo, columna, articulo, nivel, clase, tipo) {
    const clave = `${pasillo}|${columna}`;
    const slot = migracionSlots.get(clave);
    if (!slot) return;
    try {
      await migracionBufferService.depositar({
        mzPasillo: pasillo, mzColumna: columna, slotId: slot.id,
        articulo, cantidad: 1, origenNivel: nivel, operadorId: sesion?.usuarioId,
      });
      const racksActualizados = quitarArticuloLocal(racks, pasillo, columna, nivel, articulo);
      setRacks(racksActualizados);
      setBufferDelSlotActivo(await migracionBufferService.listarPorSlot(slot.id));
      refrescarBufferGlobal();
      registrarCambioMigracion(articulo, formatoUbicacion(pasillo, columna, nivel), 'Buffer', 'buffer');
      const rackAhora = racksActualizados.get(clave);
      if (!rackAhora || nArts(rackAhora) === 0) {
        await marcarVaciadoCompleto(pasillo, columna, slot.id);
      }
    } catch {
      mostrarError('No se pudo mover el artículo al buffer. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /**
   * "Cancelar traslado" -- deshace un "Iniciar traslado" hecho por error.
   * Si ya hay artículos en el buffer de este slot, avisa cuántos se van a
   * liberar antes de confirmar (ningún artículo tiene su posición REAL
   * tocada -- solo estaban ocultos mientras "en tránsito", ver
   * resolverPosicionesActuales/enBuffer -- liberarlos del buffer alcanza
   * para que vuelvan a verse en todos lados).
   */
  async function cancelarTraslado(pasillo, columna) {
    const clave = `${pasillo}|${columna}`;
    const slot = migracionSlots.get(clave);
    if (!slot) return;
    try {
      const bufferDelSlot = await migracionBufferService.listarPorSlot(slot.id);
      const mensaje = bufferDelSlot.length > 0
        ? `Vas a sacar ${bufferDelSlot.length} artículo(s) que ya moviste al buffer para este slot. ¿Confirmás cancelar el traslado?`
        : '¿Cancelar este traslado?';
      if (!confirm(mensaje)) return;
      await migracionBufferService.eliminarPorSlot(slot.id);
      await migracionSlotsService.cancelar(slot.id);
      await migracionAuditoriaService.registrar({
        mzPasillo: pasillo, mzColumna: columna, evento: 'traslado_cancelado',
        detalle: `Cancelado -- ${bufferDelSlot.length} artículo(s) liberados del buffer.`,
        usuarioId: sesion?.usuarioId,
      });
      setMigracionSlots(actuales => { const copia = new Map(actuales); copia.delete(clave); return copia; });
      setBufferDelSlotActivo([]);
      refrescarBufferGlobal();
      registrarCambioMigracion(
        `Traslado ${pasillo}-C${String(columna).padStart(3, '0')}`,
        'Buffer', `Cancelado (${bufferDelSlot.length} liberado(s))`, 'cancelado'
      );
      // Recarga completa (no optimista): los artículos liberados del buffer
      // vuelven a resolverse en su rack real -- más simple y más seguro que
      // reconstruir a mano el estado local que quitarArticuloLocal() fue sacando.
      const modelo = await obtenerWarehouseModel(escenarioId).recargarTodo();
      setRacks(modelo.racks());
    } catch {
      mostrarError('No se pudo cancelar el traslado. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /**
   * "Devolver" un artículo puntual del buffer -- deshace UN depósito hecho
   * por error, sin cancelar todo el traslado (ver cancelarTraslado, que
   * libera TODO el buffer del slot). El artículo nunca tuvo su posición
   * real tocada al depositarlo (ver migracionBuffer.service.js), así que
   * borrar esta fila alcanza para que reaparezca donde estaba -- misma
   * recarga completa que cancelarTraslado, más simple y más segura que
   * reconstruir a mano el estado local.
   *
   * Si el slot ya había pasado a "recolectando" (el rack llegó a 0 y
   * disparó el auto-avance), devolver un artículo lo vuelve a "vaciando" --
   * el rack ya no está realmente vacío, mismo invariante que dispara el
   * avance automático, acá en reversa.
   */
  async function devolverDelBuffer(slotId, itemId, articulo, origenNivel) {
    const slot = slotPorId.get(slotId);
    if (!slot || !puedeDevolverDelBuffer(slot.estado)) return;
    try {
      await migracionBufferService.eliminarUno(itemId);
      if (slot.estado === 'recolectando') {
        await migracionSlotsService.revertirAVaciando(slotId);
        setMigracionSlots(actuales => new Map(actuales).set(slot.clave, { ...actuales.get(slot.clave), estado: 'vaciando', vaciadoEn: null }));
      }
      await migracionAuditoriaService.registrar({
        mzPasillo: slot.pasillo, mzColumna: slot.columna, evento: 'articulo_devuelto',
        detalle: `Se devolvió ${articulo} del buffer -- depósito deshecho por error.`,
        usuarioId: sesion?.usuarioId,
      });
      refrescarBufferGlobal();
      if (pestanaActiva === slot.clave) setBufferDelSlotActivo(await migracionBufferService.listarPorSlot(slotId));
      registrarCambioMigracion(articulo, 'Buffer', formatoUbicacion(slot.pasillo, slot.columna, origenNivel), 'devuelto');
      const modelo = await obtenerWarehouseModel(escenarioId).recargarTodo();
      setRacks(modelo.racks());
    } catch {
      mostrarError('No se pudo devolver el artículo. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /**
   * vaciando -> recolectando: el rack de origen llegó a 0 artículos. Dispara,
   * en una sola operación, la pieza de orquestación que ADR-015 dejó
   * explícitamente para F2: 1 evento de auditoría + el estado del slot +
   * la confirmación EN LOTE de todo lo que ese vaciado dejó en el buffer.
   */
  async function marcarVaciadoCompleto(pasillo, columna, slotId) {
    try {
      const auditoriaId = await migracionAuditoriaService.registrar({
        mzPasillo: pasillo, mzColumna: columna, evento: 'vaciado_completo',
        detalle: `Rack vaciado por completo -- listo para recolección.`,
        usuarioId: sesion?.usuarioId,
      });
      await migracionSlotsService.marcarVaciadoCompleto(slotId);
      await migracionBufferService.confirmarLotePorSlot(slotId, auditoriaId);
      setMigracionSlots(actuales => new Map(actuales).set(`${pasillo}|${columna}`, { id: slotId, estado: 'recolectando' }));
      refrescarBufferGlobal();
      registrarCambioMigracion(`Traslado ${pasillo}-C${String(columna).padStart(3, '0')}`, 'Vaciando', 'Recolectando', 'vaciado_completo');
    } catch {
      mostrarError('El rack quedó vacío pero no se pudo confirmar el paso -- volvé a intentarlo desde la ficha.');
    }
  }

  /** Paso 3 (operador): recolectando -> bloqueado, habilita "Confirmar finalizado" (paso 4, otro rol). */
  async function marcarListoMigracion(pasillo, columna) {
    const clave = `${pasillo}|${columna}`;
    const slot = migracionSlots.get(clave);
    if (!slot) return;
    try {
      await migracionSlotsService.marcarBloqueado(slot.id, sesion?.usuarioId);
      setMigracionSlots(actuales => new Map(actuales).set(clave, { ...slot, estado: 'bloqueado' }));
      registrarCambioMigracion(`Traslado ${pasillo}-C${String(columna).padStart(3, '0')}`, 'Recolectando', 'Bloqueado', 'bloqueado');
    } catch {
      mostrarError('No se pudo marcar como listo. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /** Paso 4 (supervisor/administrador): bloqueado -> confirmado. El trigger de rol en la base ya lo protege también -- esto solo refleja el resultado. */
  async function confirmarFinalizadoMigracion(pasillo, columna) {
    const clave = `${pasillo}|${columna}`;
    const slot = migracionSlots.get(clave);
    if (!slot) return;
    try {
      await migracionSlotsService.confirmar(slot.id, sesion?.usuarioId);
      setMigracionSlots(actuales => new Map(actuales).set(clave, { ...slot, estado: 'confirmado' }));
      registrarCambioMigracion(`Traslado ${pasillo}-C${String(columna).padStart(3, '0')}`, 'Bloqueado', 'Confirmado', 'confirmado');
    } catch {
      mostrarError('No se pudo confirmar -- revisá tu rol o tu conexión.');
    }
  }

  /** Único punto de entrada para el click en una celda -- decide qué significa según el modo activo (bloqueo, selección de área, mover cuerpo, mover individual eligiendo destino, o abrir el panel normal). Mismo orden de prioridad que 07-render.js legacy. */
  function manejarClickCelda(celda, rack) {
    const clave = `${celda.pasillo}|${celda.columna}`;
    if (soloLectura) { if (rack) abrirPestana(clave); return; }
    if (guardando) return;
    if (modoBloqueo) { alternarBloqueo(celda.pasillo, celda.columna); return; }
    if (modoSeleccionArea) { alternarSeleccionArea(clave); return; }
    if (moviendo?.modo === 'cuerpo') { ejecutarMoverCuerpo(moviendo.origen.pasillo, moviendo.origen.columna, celda.pasillo, celda.columna); return; }
    if (moviendo?.modo === 'individual' && !moviendo.destino) {
      if (bloqueadas.has(clave)) { mostrarError('Esa posición está bloqueada.'); return; }
      setMoviendo(m => ({ ...m, destino: { pasillo: celda.pasillo, columna: celda.columna } }));
      return;
    }
    if (rack) abrirPestana(clave);
  }

  /** Fin del drag-and-drop en Modo edición -- resuelve el destino con la posición del puntero contra `celdas` (NUNCA con hit-testing de shapes de Konva, ver plan), y el shape SIEMPRE vuelve a su lugar (los datos son la fuente de verdad, no el nodo). */
  function manejarFinDrag(e, celdaOrigen) {
    e.target.position({ x: 0, y: 0 }); // el Group parte siempre de (0,0) -- ver CeldaRack
    const stage = stageRef.current;
    const puntero = stage?.getPointerPosition();
    if (!puntero) return;
    const actual = vistaActualRef.current;
    const xMundo = (puntero.x - actual.x) / actual.escala;
    const yMundo = (puntero.y - actual.y) / actual.escala;
    const celdaDestino = celdas.find(c => xMundo >= c.x && xMundo <= c.x + c.ancho && yMundo >= c.y && yMundo <= c.y + c.alto);
    if (!celdaDestino) return;
    ejecutarMoverCuerpo(celdaOrigen.pasillo, celdaOrigen.columna, celdaDestino.pasillo, celdaDestino.columna);
  }

  /** Reenfoca la pestaña si el rack ya está abierto -- nunca la duplica (mismo criterio que un navegador). */
  function abrirPestana(clave) {
    setPestanasAbiertas(actuales => actuales.includes(clave) ? actuales : [...actuales, clave]);
    setPestanaActiva(clave);
  }

  /** Cierra CON animación (ver .mapa-pestana--cerrando en canvas.css) -- la pestaña
   * sigue montada 180ms más (mismo tiempo que la animación CSS) mostrando la
   * clase de salida, recién después se saca de verdad de pestanasAbiertas. */
  function cerrarPestana(clave) {
    setCerrando(actuales => new Set(actuales).add(clave));
    setTimeout(() => {
      setPestanasAbiertas(actuales => {
        const restantes = actuales.filter(c => c !== clave);
        if (pestanaActiva === clave) {
          setPestanaActiva(restantes.length ? restantes[restantes.length - 1] : null);
        }
        return restantes;
      });
      setCerrando(actuales => { const s = new Set(actuales); s.delete(clave); return s; });
    }, 180);
  }

  const nivelesDisponibles = useMemo(() => {
    if (moviendo?.modo !== 'individual' || !moviendo.destino || !racks) return [];
    const rackDestino = racks.get(`${moviendo.destino.pasillo}|${moviendo.destino.columna}`);
    const permiteCuerpo = moviendo.origen.nivel === 'CUERPO' || !!rackDestino?.niveles?.CUERPO;
    return permiteCuerpo ? [...NIVELES_ESTANDAR, 'CUERPO'] : NIVELES_ESTANDAR;
  }, [moviendo, racks]);

  // Wrappers ESTABLES por celda (nunca cambian de referencia mientras vive
  // el componente) -- sin esto, cada celda recibía un onClick/onHover/
  // onDragEnd nuevo en CADA render (aunque nada de esa celda hubiera
  // cambiado), y react-konva tiene que desatar+atar esos listeners en las
  // ~300 celdas del layout cada vez, incluso al solo activar Modo edición o
  // Modo bloqueo (que no cambian nada VISUAL, pero sí disparan un render).
  // Los refs mantienen siempre la versión más fresca de la lógica real
  // (que sí necesita leer el estado más reciente: soloLectura, moviendo,
  // modoBloqueo, etc.) sin que el wrapper en sí tenga que cambiar de
  // identidad -- se recalcula una sola vez (celdas nunca cambia).
  const manejarClickCeldaRef = useRef(null);
  manejarClickCeldaRef.current = manejarClickCelda;
  const manejarFinDragRef = useRef(null);
  manejarFinDragRef.current = manejarFinDrag;
  const celdaEnPantallaRef = useRef(null);
  celdaEnPantallaRef.current = celdaEnPantalla;
  const racksRef = useRef(racks);
  racksRef.current = racksVisibles; // decide si hay algo para abrir con lo que se VE (F4: puede ser la vista RCL), no siempre el acomodo MZ real

  const manejadoresPorCelda = useMemo(() => {
    const mapa = new Map();
    celdas.forEach(c => {
      const clave = `${c.pasillo}|${c.columna}`;
      mapa.set(clave, {
        onClick: () => manejarClickCeldaRef.current(c, racksRef.current.get(clave)),
        onHover: (info) => {
          if (arrastrandoRef.current) return; // ver arrastrandoRef -- ninguna otra celda debe re-renderizar el árbol mientras se arrastra
          if (!info) { setHover(null); return; }
          const pantalla = celdaEnPantallaRef.current(c);
          setHover({ x: pantalla.x + pantalla.ancho / 2, y: pantalla.y, texto: info });
        },
        // cancelBubble: el dragend de Konva BURBUJEA hasta el Stage -- sin
        // esto, el propio onDragEnd del Stage (pensado para el pan del
        // mapa) también se disparaba con este mismo evento, y como acá ya
        // reseteamos la posición del Group a (0,0) ANTES de que burbujee,
        // el Stage terminaba leyendo esa (0,0) y recentrando TODA la cámara
        // ahí -- por eso cualquier rack que se soltara "terminaba siempre
        // en el mismo lugar fijo" (en realidad era el mapa entero el que
        // saltaba a (0,0), no el rack).
        onDragEnd: e => { e.cancelBubble = true; arrastrandoRef.current = false; manejarFinDragRef.current(e, c); },
      });
    });
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- celdas nunca cambia (layout estático), y los refs se mantienen frescos arriba en cada render
  }, [celdas]);

  /** Cell-independiente -- no necesita datos de la celda, así que se comparte UNA sola instancia para las ~300 celdas. */
  const manejarInicioDrag = useCallback(e => { e.cancelBubble = true; arrastrandoRef.current = true; setHover(null); }, []);

  const cargando = racks === null;

  return (
    <div
      ref={contenedorRef}
      style={{ position: 'relative', width: '100%', height: 'calc(100vh - 160px)', background: FONDO, borderRadius: 12, overflow: 'hidden' }}
    >
      {cargando ? (
        <div style={{ color: BLANCO_CALIDO_TENUE, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 13 }}>
          Cargando mapa…
        </div>
      ) : (
        <Stage
          ref={stageRef}
          width={tamano.ancho}
          height={tamano.alto}
          draggable
          onWheel={manejarRueda}
          x={pos.x}
          y={pos.y}
          scaleX={escala}
          scaleY={escala}
          onDragEnd={e => { if (e.target === e.currentTarget) { interactuadoRef.current = true; setPos({ x: e.target.x(), y: e.target.y() }); } }}
        >
          <Layer listening={false}>
            {divisores.map(y => (
              <Line key={y} points={[0, y, limites.ancho, y]} stroke={CAFE_CENIZA} strokeWidth={1} dash={[2, 6]} opacity={0.6} />
            ))}
          </Layer>
          <Layer listening={false}>
            {etiquetas.map(e => (
              <EtiquetaPasillo key={e.pasillo} etiqueta={e} />
            ))}
            {cortes.map((c, i) => (
              <CorteVisual key={`${c.pasillo}-${i}`} corte={c} />
            ))}
            <Banda celdas={celdas} anchoTotal={limites.ancho} />
          </Layer>
          <Layer>
            {celdas.map(c => {
              const clave = `${c.pasillo}|${c.columna}`;
              const rack = racksVisibles.get(clave);
              const manejadores = manejadoresPorCelda.get(clave);
              return (
                <CeldaRack
                  key={clave}
                  celda={c}
                  rack={rack}
                  configuracionOcupacion={configuracionOcupacion}
                  resaltada={celdaResaltada === clave}
                  bloqueada={bloqueadas.has(clave)}
                  seleccionada={seleccionArea.has(clave)}
                  arrastrable={modoEdicion && !moviendo && !soloLectura && vistaContenido === 'mz'}
                  onHover={manejadores.onHover}
                  onClick={manejadores.onClick}
                  onDragStart={manejarInicioDrag}
                  onDragEnd={manejadores.onDragEnd}
                  descripcionDe={descripcionDe}
                />
              );
            })}
          </Layer>
          <Layer listening={false}>
            <RutaMigracion celdas={celdas} ruta={rutaMigracionActiva} />
          </Layer>
        </Stage>
      )}

      {hover && (
        <div
          style={{
            position: 'absolute', left: hover.x, top: hover.y, transform: 'translate(-50%, -110%)',
            background: NEGRO_GRAFITO_CLARO, color: BLANCO_CALIDO, padding: '6px 10px', borderRadius: 8,
            fontSize: 11.5, lineHeight: 1.4, whiteSpace: 'pre-line', pointerEvents: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,.45)', border: `1px solid ${CAFE_CENIZA}`, maxWidth: 220, zIndex: 10,
          }}
        >
          {hover.texto}
        </div>
      )}

      {!cargando && (
        <Minimapa celdas={celdas} limites={limites} vista={{ x: -pos.x / escala, y: -pos.y / escala, ancho: tamano.ancho / escala, alto: tamano.alto / escala }} />
      )}

      {!cargando && (
        <MapaToolbar
          onRestablecerVista={restablecerVista}
          onZoomIn={() => zoomBoton(ZOOM_PASO_BOTON)}
          onZoomOut={() => zoomBoton(1 / ZOOM_PASO_BOTON)}
          valorBusqueda={busqueda}
          onCambiarBusqueda={buscarArticulo}
          resultadoBusqueda={resultadoBusqueda}
          onExportar={exportarExcel}
          modoEdicion={modoEdicion}
          onToggleEdicion={() => { setModoEdicion(v => !v); setModoBloqueo(false); cancelarMovimiento(); }}
          modoBloqueo={modoBloqueo}
          onToggleBloqueo={() => { setModoBloqueo(v => !v); setModoEdicion(false); cancelarMovimiento(); }}
          puedeDeshacer={cambios.length > 0 && !guardando}
          onDeshacer={deshacerUltimo}
          cambios={cambios}
          soloLectura={soloLectura}
          mostrarAnadirRack={mostrarAnadirRack}
          onAnadirRack={() => onSolicitarAddRack?.()}
          vistaContenido={vistaContenido}
          onCambiarVista={setVistaContenido}
          mostrarToggleVista={!escenarioId}
          cambiosMigracion={cambiosMigracion}
          bufferGlobal={bufferGlobalConEtiquetas}
          mostrarBuffer={!escenarioId}
          onDevolverBuffer={item => devolverDelBuffer(item.slotOrigenId, item.id, item.articulo, item.origenNivel)}
          alertasDestinoListo={alertasDestinoListo}
          mostrarGenerarMovimiento={puedeMigrar}
          onGenerarMovimiento={generarMovimiento}
        />
      )}

      <BarraMovimiento
        moviendo={moviendo}
        guardando={guardando}
        nivelesDisponibles={nivelesDisponibles}
        onElegirNivel={confirmarNivelIndividual}
        onCancelar={cancelarMovimiento}
      />

      {errorAccion && <div className="mapa-error-flotante">{errorAccion}</div>}

      {pestanasAbiertas.length > 0 && (
        <div
          style={{
            // top:72 -- separado de la toolbar (que vive en top:16, ver
            // MapaToolbar.jsx) para que la pestaña/panel nunca se pisen con
            // sus botones, sin cambiar el estilo de la barra de pestañas.
            position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)',
            width: 'min(640px, calc(100% - 32px))', maxHeight: 'calc(100% - 88px)',
            display: 'flex', flexDirection: 'column', zIndex: 20,
          }}
        >
          <BarraPestanas
            pestanas={pestanasAbiertas}
            activa={pestanaActiva}
            onSeleccionar={clave => { setPestanaActiva(clave); setPanelMinimizado(false); }}
            onCerrar={cerrarPestana}
            cerrando={cerrando}
            minimizado={panelMinimizado}
            onToggleMinimizado={() => setPanelMinimizado(v => !v)}
            etiquetaDe={etiquetaRclDe}
          />
          {pestanaActiva && (
            <PanelDetalle
              clave={pestanaActiva}
              etiquetaRcl={etiquetaRclDe(pestanaActiva)}
              // Fallback a un rack vacío: la ficha puede quedar abierta al cambiar
              // de vista MZ<->RCL (F4), y esa posición puede no tener contenido en
              // la vista nueva -- nunca undefined, PanelDetalle asume rack.niveles.
              rack={racksVisibles.get(pestanaActiva) ?? { niveles: {} }}
              configuracionOcupacion={configuracionOcupacion}
              descripcionDe={descripcionDe}
              oculto={panelMinimizado}
              bloqueada={bloqueadas.has(pestanaActiva)}
              onToggleBloqueo={() => { const [p, c] = pestanaActiva.split('|'); alternarBloqueo(p, Number(c)); }}
              onMoverCuerpo={() => { const [p, c] = pestanaActiva.split('|'); iniciarMoverCuerpo(p, Number(c)); }}
              onMoverArticulo={(articulo, nivel, clase, tipo) => iniciarMoverArticulo(pestanaActiva, articulo, nivel, clase, tipo)}
              moviendoAlgo={!!moviendo || guardando}
              soloLectura={soloLectura}
              enSala={!!escenarioId}
              onLimpiarSlot={() => { const [p, c] = pestanaActiva.split('|'); limpiarSlotIndividual(p, Number(c)); }}
              migracionEstado={migracionSlots.get(pestanaActiva)?.estado}
              puedeMigrar={puedeMigrar}
              puedeElegirLibremente={puedeElegirLibremente}
              puedeConfirmarMigracion={puedeConfirmarMigracion}
              onIniciarTraslado={() => { const [p, c] = pestanaActiva.split('|'); iniciarTraslado(p, Number(c)); }}
              onConfirmarFinalizado={() => { const [p, c] = pestanaActiva.split('|'); confirmarFinalizadoMigracion(p, Number(c)); }}
              onDepositarBuffer={(articulo, nivel) => { const [p, c] = pestanaActiva.split('|'); depositarEnBuffer(p, Number(c), articulo, nivel); }}
              onMarcarListoMigracion={() => { const [p, c] = pestanaActiva.split('|'); marcarListoMigracion(p, Number(c)); }}
              onCancelarTraslado={() => { const [p, c] = pestanaActiva.split('|'); cancelarTraslado(p, Number(c)); }}
              onDevolverBuffer={(itemId, articulo, origenNivel) => devolverDelBuffer(migracionSlots.get(pestanaActiva)?.id, itemId, articulo, origenNivel)}
              bufferDelSlot={bufferDelSlotActivo}
              movimientosPendientesSlot={movimientosPendientesSlot}
              onMarcarRecolectado={marcarRecolectadoMovimiento}
            />
          )}
        </div>
      )}
    </div>
  );
});

export default MapaCanvas;

/** Nombre de pasillo (MZ01, MZ11...) al lado de su fila/columna -- los verticales en café ceniza y los horizontales en verde estructura, para que se distingan a simple vista sin depender solo de la orientación del texto. */
function EtiquetaPasillo({ etiqueta }) {
  const color = etiqueta.vertical ? CAFE_CENIZA_CLARO : VERDE_ESTRUCTURA_CLARO;
  return (
    <Text
      x={etiqueta.x} y={etiqueta.y} width={etiqueta.ancho} height={etiqueta.alto}
      align="center" verticalAlign="middle"
      text={etiqueta.pasillo} fontSize={12} fontStyle="700" fill={color}
    />
  );
}

/** Corte de "PASILLO" (espacio de paso físico) dentro de una fila -- mismo criterio que .gaph del mapa legacy (ver 07-render.js/gapsDe()), acá como un hueco angosto con la etiqueta en vertical (el espacio es muy angosto para texto horizontal legible). */
function CorteVisual({ corte }) {
  return (
    <>
      <Rect x={corte.x} y={corte.y} width={corte.ancho} height={corte.alto} fill={NEGRO_GRAFITO} opacity={0.5} cornerRadius={3} />
      <Text
        x={corte.x + corte.ancho / 2} y={corte.y + corte.alto / 2}
        width={corte.alto} height={12} offsetX={corte.alto / 2} offsetY={6}
        align="center" verticalAlign="middle" rotation={-90}
        text="PASILLO" fontSize={7} fontStyle="700" fill={BLANCO_CALIDO_TENUE} letterSpacing={0.5}
      />
    </>
  );
}

/**
 * "Alumbra" los dos slots de un traslado activo -- el que se está vaciando
 * (origen, resaltado en azul) y hacia dónde van sus artículos según el plan
 * de recolección (destino, resaltado en ámbar, con una línea punteada
 * conectándolos). Pedido explícito del usuario. SOLO se dibuja mientras hay
 * una ruta activa (`ruta` viene de rutaMigracionActiva en MapaCanvas.jsx,
 * que ya filtra "sin traslado en curso" -- acá no se decide nada, solo se
 * pinta lo que llega). En reposo no dibuja nada (mismo criterio del spec
 * original de migración: nada en pantalla si no hay un traslado en curso).
 */
// X del corredor compartido que corre por delante de TODAS las filas
// horizontales (la franja de las etiquetas de pasillo, ver
// posicionesEsquematicas.js) -- un par de px adentro del borde para no
// pisar la etiqueta ni la primera columna. Rutas entre pasillos distintos
// se trazan POR ACÁ (bajar/subir por el corredor y recién ahí entrar a la
// fila), nunca en diagonal sobre racks de pasillos que no son parte del
// traslado -- pedido explícito del usuario ("no quiero que se brinque
// layouts").
const CORREDOR_X = xInicioFilas() - 6;

/** Puntos [x1,y1,x2,y2,...] de la ruta entre dos celdas, siguiendo el corredor cuando cruza de un pasillo horizontal a otro. Mismo pasillo, o cualquiera de los dos en un pasillo vertical (MZ11/MZ12, que no tocan este corredor) -- línea directa, caso no cubierto por esta simplificación. */
function puntosRuta(centroOrigen, centroDestino, pasilloOrigen, pasilloDestino) {
  const mismosPasillo = pasilloOrigen === pasilloDestino;
  const algunoVertical = PASILLOS_VERTICALES.includes(pasilloOrigen) || PASILLOS_VERTICALES.includes(pasilloDestino);
  if (mismosPasillo || algunoVertical) {
    return [centroOrigen.x, centroOrigen.y, centroDestino.x, centroDestino.y];
  }
  return [
    centroOrigen.x, centroOrigen.y,
    CORREDOR_X, centroOrigen.y,
    CORREDOR_X, centroDestino.y,
    centroDestino.x, centroDestino.y,
  ];
}

function RutaMigracion({ celdas, ruta }) {
  if (!ruta) return null;
  const celdaOrigen = celdas.find(c => c.pasillo === ruta.origen.pasillo && c.columna === ruta.origen.columna);
  if (!celdaOrigen) return null;
  const centroOrigen = { x: celdaOrigen.x + celdaOrigen.ancho / 2, y: celdaOrigen.y + celdaOrigen.alto / 2 };

  return (
    <>
      <Rect
        x={celdaOrigen.x - 3} y={celdaOrigen.y - 3} width={celdaOrigen.ancho + 6} height={celdaOrigen.alto + 6}
        stroke={ESTADOS.medio} strokeWidth={2.5} cornerRadius={8} dash={[6, 4]}
      />
      {ruta.destinos.map(d => {
        const celdaDestino = celdas.find(c => c.pasillo === d.pasillo && c.columna === d.columna);
        if (!celdaDestino) return null;
        const centroDestino = { x: celdaDestino.x + celdaDestino.ancho / 2, y: celdaDestino.y + celdaDestino.alto / 2 };
        return (
          <Fragment key={`${d.pasillo}-${d.columna}`}>
            <Line
              points={puntosRuta(centroOrigen, centroDestino, ruta.origen.pasillo, d.pasillo)}
              stroke={ESTADOS.alerta} strokeWidth={2} dash={[8, 6]} opacity={0.85}
              lineJoin="round" lineCap="round"
            />
            <Rect
              x={celdaDestino.x - 3} y={celdaDestino.y - 3} width={celdaDestino.ancho + 6} height={celdaDestino.alto + 6}
              stroke={ESTADOS.alerta} strokeWidth={2.5} cornerRadius={8}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Banda transportadora cerca de MZ08 (ver plano DXF real que compartió el
 * usuario -- la banda entra desde arriba a la derecha y curva hacia esa
 * zona). Puramente decorativa por ahora: no mueve datos reales, solo
 * refleja que esa pieza física existe. Mismo espíritu que `.caja`/`cajaBaja`
 * del mapa legacy (un cuadradito que recorre la banda en loop), redibujado
 * acá con las primitivas de Konva -- sin librería nueva.
 *
 * Ancla corregida: hasta acá se anclaba contra MZ10 (la fila más arriba),
 * contradiciendo este mismo comentario que siempre dijo "cerca de MZ08" --
 * ahora sí se posiciona contra MZ08.
 */
function Banda({ celdas, anchoTotal }) {
  // La curva/espiral va al INICIO (izquierda, de donde entra el producto),
  // el resto corre recto hacia la derecha.
  //
  // Ancla: el borde DERECHO de MZ08-C004 -- la espiral nace justo después
  // de esa celda (como si continuara en la posición de MZ08-C005, aunque
  // esa columna no exista como slot real), sin invadir ni superponerse a
  // ningún slot real de MZ08 o MZ09.
  const celdaMZ08C4 = celdas.find(c => c.pasillo === 'MZ08' && c.columna === 4);
  if (!celdaMZ08C4) return null;
  const yBanda = celdaMZ08C4.y - 35;
  const xInicio = celdaMZ08C4.x + celdaMZ08C4.ancho;
  // La geometría (curva+espiral) mantiene las mismas proporciones de
  // siempre, pero corrida +35px para que su punto más a la izquierda caiga
  // EN xInicio (el borde de MZ08-C004), nunca antes -- antes el primer
  // punto estaba en xInicio-30, es decir, adentro del slot de MZ08-C004.
  const puntos = [xInicio + 5, yBanda + 55, xInicio + 90, yBanda, anchoTotal + 20, yBanda];
  const ANCHO_BANDA = 20;

  return (
    <>
      {/* cuerpo de la banda, un tono más oscuro que los rodillos para dar profundidad */}
      <Line points={puntos} stroke={NEGRO_GRAFITO_CLARO} strokeWidth={ANCHO_BANDA} lineCap="round" lineJoin="round" tension={0.4} listening={false} />
      {/* rieles (bordes) -- lo que de verdad la hace leer como cinta transportadora, no como un caño */}
      <Line points={puntos} stroke={CAFE_CENIZA} strokeWidth={ANCHO_BANDA} lineCap="round" lineJoin="round" tension={0.4} opacity={0.55} listening={false} />
      <RodillosBanda puntos={puntos} anchoBanda={ANCHO_BANDA} />
      {/* espiral simplificada -- un anillo decorativo en el punto de entrada, sin modelar la vuelta completa del plano real */}
      <Circle x={xInicio + 15} y={yBanda + 45} radius={16} stroke={CAFE_CENIZA} strokeWidth={2.5} opacity={0.6} listening={false} />
      <Circle x={xInicio + 15} y={yBanda + 45} radius={7} stroke={CAFE_CENIZA} strokeWidth={2} opacity={0.6} listening={false} />
      <Text x={xInicio + 75} y={yBanda - 24} text="BANDA" fontSize={10} fontStyle="700" fill={BLANCO_CALIDO_TENUE} letterSpacing={1} listening={false} />
      <CajasAnimadas puntos={puntos} />
    </>
  );
}

/** Marcas perpendiculares a intervalos regulares, sugiriendo los rodillos de una cinta transportadora real -- puramente decorativo, geometría fija (no se recalcula en cada frame). */
function RodillosBanda({ puntos, anchoBanda }) {
  const [x1, y1, x2, y2, x3, y3] = puntos;
  const segmentos = [[x1, y1, x2, y2], [x2, y2, x3, y3]];
  const marcas = [];
  const PASO = 16;

  segmentos.forEach(([ax, ay, bx, by], si) => {
    const largo = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / largo, uy = (by - ay) / largo; // dirección del segmento
    const px = -uy, py = ux; // perpendicular
    for (let d = PASO / 2; d < largo; d += PASO) {
      const cx = ax + ux * d, cy = ay + uy * d;
      marcas.push(
        <Line
          key={`${si}-${d}`}
          points={[cx - px * anchoBanda * 0.35, cy - py * anchoBanda * 0.35, cx + px * anchoBanda * 0.35, cy + py * anchoBanda * 0.35]}
          stroke={NEGRO_GRAFITO} strokeWidth={2} opacity={0.4} listening={false}
        />
      );
    }
  });

  return <>{marcas}</>;
}

const FASES_CAJAS = [0, 0.33, 0.66];

/** Las 3 cajitas que recorren `puntos` (polilínea de 3 puntos) en loop -- UN solo timer/estado para las 3 (antes cada una tenía el suyo, triplicando los repintados del canvas por frame sin necesidad). */
function CajasAnimadas({ puntos }) {
  const [t, setT] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    let anterior = performance.now();
    function cuadro(ahora) {
      const delta = (ahora - anterior) / 1000;
      anterior = ahora;
      setT(v => (v - delta * 0.18 + 1) % 1); // sentido inverso (derecha->izquierda) -- vuelta completa cada ~5.5s
      rafRef.current = requestAnimationFrame(cuadro);
    }
    rafRef.current = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const [x1, y1, x2, y2, x3, y3] = puntos;
  function posicionEn(fase) {
    const tLocal = (t + fase) % 1;
    const mitad = tLocal < 0.5 ? tLocal * 2 : (tLocal - 0.5) * 2;
    const [ax, ay, bx, by] = tLocal < 0.5 ? [x1, y1, x2, y2] : [x2, y2, x3, y3];
    return { x: ax + (bx - ax) * mitad, y: ay + (by - ay) * mitad };
  }

  return (
    <>
      {FASES_CAJAS.map(fase => {
        const { x, y } = posicionEn(fase);
        return (
          <Fragment key={fase}>
            {/* caja -- base + línea de "tapa" simple, más de caja de cartón que un cuadrado liso, sin gastar en sombras (ver bug de rendimiento ya resuelto) */}
            <Rect x={x - 6} y={y - 6} width={12} height={12} fill={CAFE_CENIZA_CLARO} stroke={NEGRO_GRAFITO} strokeWidth={0.75} cornerRadius={1.5} listening={false} perfectDrawEnabled={false} />
            <Line points={[x - 6, y - 1, x + 6, y - 1]} stroke={NEGRO_GRAFITO} strokeWidth={0.75} opacity={0.5} listening={false} />
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Una celda de rack -- mismo criterio visual que el mapa legacy (color por
 * clase, contador de artículos, barra de llenura). Click delega TODO en
 * `onClick` (ver manejarClickCelda en MapaCanvas.jsx -- decide si abre el
 * panel, marca destino, o togglea un bloqueo, según el modo activo).
 *
 * `arrastrable` (Modo edición): el contenido vive en un `<Group>` que
 * parte siempre de (0,0) -- arrastrarlo desplaza visualmente la celda
 * durante el gesto, pero SIEMPRE vuelve a (0,0) al soltar (ver
 * manejarFinDrag en MapaCanvas.jsx): los datos, no la posición del nodo
 * Konva, son la fuente de verdad de dónde vive cada rack.
 */
const CeldaRack = memo(function CeldaRack({ celda, rack, configuracionOcupacion, onHover, onClick, onDragStart, onDragEnd, descripcionDe, resaltada, bloqueada, arrastrable, seleccionada }) {
  const vacia = !rack || nArts(rack) === 0;
  const cantidad = vacia ? 0 : nArts(rack);
  const primerArticulo = vacia ? null : Object.values(rack.niveles)[0]?.[0];
  const relleno = vacia
    ? GRIS_MAPA_CLARO
    : (primerArticulo?.tipo === 'CUERPO' ? colorDeClase(null, 'CUERPO') : colorDeClase(primerArticulo?.clase));
  const proporcionLlenura = !vacia && configuracionOcupacion ? llenura(rack, configuracionOcupacion) : 0;
  const colorBarra = !vacia && configuracionOcupacion ? colorLlenura(proporcionLlenura, configuracionOcupacion) : null;
  const grupoRef = useRef(null);

  // Konva redibuja el LAYER entero (~300 celdas) en cada frame mientras se
  // arrastra cualquiera de ellas -- sin esto, arrastrar un cuerpo se sentía
  // "pegado" porque cada celda se repinta como vector (Rect+Text+barra) 300
  // veces por segundo. Cacheada, cada celda es un solo blit de bitmap: el
  // costo de redibujar el layer completo baja drásticamente. Se re-cachea
  // solo cuando cambia algo visual de ESTA celda, no en cada render.
  useEffect(() => {
    const nodo = grupoRef.current;
    if (!nodo) return;
    nodo.cache();
    nodo.getLayer()?.batchDraw();
    return () => nodo.clearCache();
  }, [relleno, cantidad, colorBarra, proporcionLlenura, bloqueada, seleccionada, resaltada]);

  function textoHover() {
    if (vacia) return `${celda.pasillo} · C${String(celda.columna).padStart(3, '0')}\nVacío${bloqueada ? ' · Bloqueado' : ''}`;
    const consumo = consumoTotal(rack).toFixed(2);
    const desc = primerArticulo ? descripcionDe(primerArticulo.articulo) : '';
    return `${celda.pasillo} · C${String(celda.columna).padStart(3, '0')}${bloqueada ? ' · Bloqueado' : ''}\n${cantidad} artículo(s) · consumo ${consumo}\n${desc}`;
  }

  return (
    <Group
      ref={grupoRef}
      x={0} y={0}
      draggable={arrastrable && !vacia && !bloqueada}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <Rect
        x={celda.x} y={celda.y} width={celda.ancho} height={celda.alto}
        fill={relleno}
        stroke={seleccionada ? ESTADOS.medio : (resaltada ? ESTADOS.ok : (bloqueada ? '#C99A4A' : (vacia ? CAFE_CENIZA : 'rgba(0,0,0,.4)')))}
        strokeWidth={seleccionada || resaltada || bloqueada ? 2.5 : (vacia ? 0.75 : 1.5)}
        opacity={vacia && !resaltada && !seleccionada ? 0.5 : 1}
        dash={vacia && !resaltada && !seleccionada ? [3, 3] : undefined}
        cornerRadius={6}
        perfectDrawEnabled={false}
        onMouseEnter={() => { onHover(textoHover()); const c = document.body.style; c.cursor = arrastrable && !vacia && !bloqueada ? 'grab' : 'pointer'; }}
        onMouseLeave={() => { onHover(null); document.body.style.cursor = 'default'; }}
        onClick={onClick}
      />
      {seleccionada && (
        <Rect x={celda.x} y={celda.y} width={celda.ancho} height={celda.alto} fill={ESTADOS.medio} opacity={0.22} cornerRadius={6} listening={false} />
      )}
      {!vacia && (
        <Text
          x={celda.x} y={celda.y + celda.alto / 2 - 7} width={celda.ancho} align="center"
          text={String(cantidad)} fontSize={13} fontStyle="700" fill="#fff" listening={false}
        />
      )}
      {!vacia && colorBarra && (
        <Rect
          x={celda.x + 3} y={celda.y + celda.alto - 5} width={(celda.ancho - 6) * Math.min(proporcionLlenura, 1)} height={2.5}
          fill={colorBarra} cornerRadius={2} listening={false}
        />
      )}
      {bloqueada && (
        <Text
          x={celda.x + celda.ancho - 15} y={celda.y + 2} width={13} align="center"
          text="🔒" fontSize={9} listening={false}
        />
      )}
    </Group>
  );
});

/** Mini-mapa en la esquina -- misma disposición esquemática, a escala reducida, con un rectángulo marcando la parte visible del canvas principal. */
function Minimapa({ celdas, limites, vista }) {
  const ANCHO_MINI = 160;
  const ALTO_MINI = 110;
  const escalaMini = Math.min(ANCHO_MINI / limites.ancho, ALTO_MINI / limites.alto);

  return (
    <div style={{ position: 'absolute', right: 12, bottom: 12, width: ANCHO_MINI, height: ALTO_MINI, background: GRIS_MAPA, borderRadius: 8, border: `1px solid ${CAFE_CENIZA}`, overflow: 'hidden' }}>
      <Stage width={ANCHO_MINI} height={ALTO_MINI} listening={false}>
        <Layer scaleX={escalaMini} scaleY={escalaMini} listening={false}>
          {celdas.map(c => (
            <Rect key={`${c.pasillo}|${c.columna}`} x={c.x} y={c.y} width={c.ancho} height={c.alto} fill={GRIS_MAPA_CLARO} />
          ))}
          <Rect
            x={vista.x} y={vista.y} width={vista.ancho} height={vista.alto}
            stroke={VERDE_ESTRUCTURA_CLARO} strokeWidth={2 / escalaMini} fill="rgba(58,99,88,.18)"
          />
        </Layer>
      </Stage>
    </div>
  );
}
