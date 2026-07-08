import { Fragment, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Line, Circle, Group } from 'react-konva';
import * as XLSX from 'xlsx';
import { obtenerWarehouseModel } from '../../../domain/crearWarehouseModel.js';
import { nArts, consumoTotal, llenura, colorLlenura } from '../../../domain/formulasOcupacion.js';
import { colorDeClase } from '../../../shared/constants/coloresArticulo.js';
import { calcularLayoutEsquematico, calcularEtiquetas, calcularDivisoresGrupo, calcularCortesPasillo } from './posicionesEsquematicas.js';
import { calcularVistaAjustada, calcularVistaCentradaEnCelda, interpolarVista, DURACION_ANIMACION_MS, DURACION_ZOOM_BOTON_MS } from './vistaMapa.js';
import { aplicarMovimientosLocales, invertirLote } from './movimientosLocales.js';
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
import './canvas.css';

const NIVELES_ESTANDAR = ['N01', 'N02', 'N03', 'N04', 'N05'];

const FONDO = GRIS_MAPA;
const LINEA_GRILLA = '#3A3E40';
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
  const [cambios, setCambios] = useState([]); // pila de LOTES (cada lote = 1+ artículos movidos juntos) -- alimenta Deshacer Y Exportar, misma fuente para que no puedan desincronizarse
  const [modoEdicion, setModoEdicion] = useState(false); // arrastrar para mover un cuerpo completo (mismo nombre que "Modo edición" del mapa legacy)
  const [modoBloqueo, setModoBloqueo] = useState(false);
  const [bloqueadas, setBloqueadas] = useState(new Set()); // claves "pasillo|columna" bloqueadas -- no admiten ser origen ni destino de un movimiento
  const [moviendo, setMoviendo] = useState(null); // null | {tipo:'cuerpo', origen:{pasillo,columna}} | {tipo:'individual', articulo, nivel, clase, tipo, origen:{pasillo,columna,nivel}, destino:null|{pasillo,columna}}
  const [guardando, setGuardando] = useState(false); // evita doble-click mientras un movimiento persiste
  const [errorAccion, setErrorAccion] = useState(null); // mensaje transitorio (destino ocupado/bloqueado/mismo origen, error de guardado)
  const [modoSeleccionArea, setModoSeleccionArea] = useState(false); // SOLO sala -- activado externamente por la barra de acciones (ver useImperativeHandle)
  const [seleccionArea, setSeleccionArea] = useState(new Set());
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
  // cualquier ancho de ventana. La PRIMERA medida real también fija la
  // cámara inicial ya ajustada a pantalla (antes era un {x:40,y:40} fijo
  // que no tenía en cuenta el tamaño real del contenedor ni del layout).
  const inicializadoRef = useRef(false);
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const nuevoTamano = { ancho: Math.round(width), alto: Math.round(height) };
      setTamano(nuevoTamano);
      if (!inicializadoRef.current) {
        inicializadoRef.current = true;
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
    })();
    return () => { activo = false; };
  }, [escenarioId]);

  function manejarRueda(e) {
    e.evt.preventDefault();
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

  /** "Restablecer vista" (Reset View): centra TODO el layout y ajusta el zoom para que entre completo -- fit to screen. */
  function restablecerVista() {
    animarVistaA(calcularVistaAjustada(limites, tamano));
  }

  function zoomBoton(factor) {
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
      const rack = racks.get(`${celda.pasillo}|${celda.columna}`);
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
      cambios.forEach(lote => lote.forEach(c => filasCambios.push([c.articulo, c.desde, c.hacia])));
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
    setMoviendo({ tipo: 'cuerpo', origen: { pasillo, columna } });
  }

  /** Botón "Mover" de un artículo puntual del panel -- primero destino (click en el mapa), después nivel (chips de la barra de movimiento). */
  function iniciarMoverArticulo(clave, articulo, nivel, clase, tipo) {
    const [pasillo, columna] = clave.split('|');
    if (bloqueadas.has(clave)) { mostrarError('Esa posición está bloqueada.'); return; }
    setMoviendo({ tipo: 'individual', articulo, clase, tipo, origen: { pasillo, columna: Number(columna), nivel }, destino: null });
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
    setCambios(actuales => [...actuales, entradas]);
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
    setRacks(actuales => aplicarMovimientosLocales(actuales, invertirLote(ultimoLote)));
    setCambios(actuales => actuales.slice(0, -1));
    guardarLotePosiciones(ultimoLote.map(entrada => ({
      articulo: entrada.articulo, pasillo: entrada.origen.pasillo, columna: entrada.origen.columna,
      nivel: entrada.origen.nivel, clase: entrada.clase, tipo: entrada.tipo,
    })))
      .then(async () => {
        if (!escenarioId) {
          const primera = ultimoLote[0];
          const esCuerpo = ultimoLote.length > 1;
          const colDestino = String(primera.destino.columna).padStart(3, '0');
          const colOrigen = String(primera.origen.columna).padStart(3, '0');
          await auditService.registrarDeshecho({
            usuarioId: sesion?.usuarioId, usuarioNombre: sesion?.nombre, ip: sesion?.ip,
            articulo: esCuerpo ? `cuerpo completo (${ultimoLote.length} art)` : primera.articulo,
            desde: esCuerpo ? `${primera.destino.pasillo}-C${colDestino}` : formatoUbicacion(primera.destino.pasillo, primera.destino.columna, primera.destino.nivel),
            hacia: esCuerpo ? `${primera.origen.pasillo}-C${colOrigen}` : formatoUbicacion(primera.origen.pasillo, primera.origen.columna, primera.origen.nivel),
          });
        } else {
          onCambio?.();
        }
      })
      .catch(() => {
        setRacks(actuales => aplicarMovimientosLocales(actuales, ultimoLote));
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

  /** "Limpiar área" -- SOLO sala, invocado externamente (ver useImperativeHandle). Misma confirmación y mismo efecto que limpiarAreaSeleccionada() legacy: vacía TODOS los artículos de las posiciones seleccionadas, vía escenarioEliminadosService (nunca toca el mapa real). */
  async function limpiarAreaSeleccionada() {
    if (!escenarioId) return;
    if (seleccionArea.size === 0) { mostrarError('Primero tocá "Seleccionar área" y elegí al menos una posición.'); return; }
    if (!confirm(`¿Vaciar ${seleccionArea.size} posición(es) seleccionada(s) en esta sala? Esta acción no se puede deshacer.`)) return;

    const claves = [...seleccionArea];
    const articulos = [];
    for (const clave of claves) {
      const rack = racks.get(clave);
      if (!rack) continue;
      for (const nivel in rack.niveles) for (const a of rack.niveles[nivel]) articulos.push(a.articulo);
    }
    try {
      await Promise.all(articulos.map(articulo => escenarioEliminadosService.marcarEliminado({ escenarioId, articulo, usuarioId: sesion?.usuarioId })));
      setRacks(actuales => { const copia = new Map(actuales); claves.forEach(c => copia.delete(c)); return copia; });
      setSeleccionArea(new Set());
      setModoSeleccionArea(false);
      onCambio?.();
    } catch {
      mostrarError('No se pudo limpiar el área. Revisá tu conexión e intentá de nuevo.');
    }
  }

  /** Único punto de entrada para el click en una celda -- decide qué significa según el modo activo (bloqueo, selección de área, mover cuerpo, mover individual eligiendo destino, o abrir el panel normal). Mismo orden de prioridad que 07-render.js legacy. */
  function manejarClickCelda(celda, rack) {
    const clave = `${celda.pasillo}|${celda.columna}`;
    if (soloLectura) { if (rack) abrirPestana(clave); return; }
    if (guardando) return;
    if (modoBloqueo) { alternarBloqueo(celda.pasillo, celda.columna); return; }
    if (modoSeleccionArea) { alternarSeleccionArea(clave); return; }
    if (moviendo?.tipo === 'cuerpo') { ejecutarMoverCuerpo(moviendo.origen.pasillo, moviendo.origen.columna, celda.pasillo, celda.columna); return; }
    if (moviendo?.tipo === 'individual' && !moviendo.destino) {
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
    if (moviendo?.tipo !== 'individual' || !moviendo.destino || !racks) return [];
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
  racksRef.current = racks;

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
          onDragEnd={e => { if (e.target === e.currentTarget) setPos({ x: e.target.x(), y: e.target.y() }); }}
        >
          <Layer listening={false}>
            <Grilla ancho={limites.ancho} alto={limites.alto} />
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
              const rack = racks.get(clave);
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
                  arrastrable={modoEdicion && !moviendo && !soloLectura}
                  onHover={manejadores.onHover}
                  onClick={manejadores.onClick}
                  onDragStart={manejarInicioDrag}
                  onDragEnd={manejadores.onDragEnd}
                  descripcionDe={descripcionDe}
                />
              );
            })}
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
          cantidadCambios={cambios.length}
          soloLectura={soloLectura}
          mostrarAnadirRack={mostrarAnadirRack}
          onAnadirRack={() => onSolicitarAddRack?.()}
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
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            width: 'min(640px, calc(100% - 32px))', maxHeight: 'calc(100% - 32px)',
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
          />
          {pestanaActiva && (
            <PanelDetalle
              clave={pestanaActiva}
              rack={racks.get(pestanaActiva)}
              configuracionOcupacion={configuracionOcupacion}
              descripcionDe={descripcionDe}
              oculto={panelMinimizado}
              bloqueada={bloqueadas.has(pestanaActiva)}
              onToggleBloqueo={() => { const [p, c] = pestanaActiva.split('|'); alternarBloqueo(p, Number(c)); }}
              onMoverCuerpo={() => { const [p, c] = pestanaActiva.split('|'); iniciarMoverCuerpo(p, Number(c)); }}
              onMoverArticulo={(articulo, nivel, clase, tipo) => iniciarMoverArticulo(pestanaActiva, articulo, nivel, clase, tipo)}
              moviendoAlgo={!!moviendo || guardando}
              soloLectura={soloLectura}
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
 * Banda transportadora cerca de MZ08 (ver plano DXF real que compartió el
 * usuario -- la banda entra desde arriba a la derecha y curva hacia esa
 * zona). Puramente decorativa por ahora: no mueve datos reales, solo
 * refleja que esa pieza física existe. Mismo espíritu que `.caja`/`cajaBaja`
 * del mapa legacy (un cuadradito que recorre la banda en loop), redibujado
 * acá con las primitivas de Konva -- sin librería nueva.
 */
function Banda({ celdas, anchoTotal }) {
  // Corre arriba de MZ10 (la fila más alta) a lo largo de casi todo el ancho.
  // La curva/espiral va al INICIO (izquierda, de donde entra el producto),
  // el resto corre recto hacia la derecha -- confirmado contra el plano DXF
  // real que compartió el usuario.
  const primeraCeldaMZ10 = celdas.find(c => c.pasillo === 'MZ10' && c.columna === 1);
  if (!primeraCeldaMZ10) return null;
  const yBanda = primeraCeldaMZ10.y - 35;
  const xInicio = primeraCeldaMZ10.x - 10;
  const puntos = [xInicio - 30, yBanda + 55, xInicio + 55, yBanda, anchoTotal + 20, yBanda];
  const ANCHO_BANDA = 20;

  return (
    <>
      {/* cuerpo de la banda, un tono más oscuro que los rodillos para dar profundidad */}
      <Line points={puntos} stroke={NEGRO_GRAFITO_CLARO} strokeWidth={ANCHO_BANDA} lineCap="round" lineJoin="round" tension={0.4} listening={false} />
      {/* rieles (bordes) -- lo que de verdad la hace leer como cinta transportadora, no como un caño */}
      <Line points={puntos} stroke={CAFE_CENIZA} strokeWidth={ANCHO_BANDA} lineCap="round" lineJoin="round" tension={0.4} opacity={0.55} listening={false} />
      <RodillosBanda puntos={puntos} anchoBanda={ANCHO_BANDA} />
      {/* espiral simplificada -- un anillo decorativo en el punto de entrada, sin modelar la vuelta completa del plano real */}
      <Circle x={xInicio - 20} y={yBanda + 45} radius={16} stroke={CAFE_CENIZA} strokeWidth={2.5} opacity={0.6} listening={false} />
      <Circle x={xInicio - 20} y={yBanda + 45} radius={7} stroke={CAFE_CENIZA} strokeWidth={2} opacity={0.6} listening={false} />
      <Text x={xInicio + 40} y={yBanda - 24} text="BANDA" fontSize={10} fontStyle="700" fill={BLANCO_CALIDO_TENUE} letterSpacing={1} listening={false} />
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

function Grilla({ ancho, alto, paso = 50 }) {
  const lineas = [];
  for (let x = 0; x <= ancho; x += paso) lineas.push(<Line key={`v${x}`} points={[x, 0, x, alto]} stroke={LINEA_GRILLA} strokeWidth={1} />);
  for (let y = 0; y <= alto; y += paso) lineas.push(<Line key={`h${y}`} points={[0, y, ancho, y]} stroke={LINEA_GRILLA} strokeWidth={1} />);
  return <>{lineas}</>;
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
