import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { puede, ROLES } from '../auth/roles.js';
import { crearManejadoresMensajes } from './mensajesMapa.js';
import { MAPA_CANVAS_HABILITADO } from './canvas/featureFlag.js';
// Lazy: trae react-konva/konva (~93 kB gzip) -- con el flag apagado (default)
// esto nunca se pide, y el bundle principal no crece (mismo patrón que los
// paneles de Sidebar.jsx y Framer Motion en el Dashboard).
const MapaCanvas = lazy(() => import('./canvas/MapaCanvas.jsx'));

/**
 * Envuelve el mapa de slotting EXISTENTE (public/legacy/mapa_editable_slotting.html)
 * en un iframe, sin tocar su lógica interna más que los hooks de postMessage
 * ya agregados dentro de logMov()/confirmar()/soltarCuerpoEn()/deshacer().
 *
 * Esto garantiza el requisito "no modificar ninguna funcionalidad existente":
 * el iframe es una caja negra, React nunca mete la mano en su DOM (solo LEE
 * el ancho ya renderizado de #grid para autoajustar el contenedor — nunca
 * escribe ni modifica nada adentro del iframe).
 *
 * Persistencia: cada movimiento avisa su nueva posición ('slotting:posicion')
 * y cada bloqueo/desbloqueo ('slotting:bloqueo'), y se guardan en Supabase
 * (`posiciones_actuales` / `bloqueos`). Al cargar, el mapa pide ese estado
 * ('slotting:solicitarEstado') y se lo devolvemos ('slotting:estadoInicial')
 * para que reconstruya dónde quedó cada artículo y qué posiciones siguen
 * bloqueadas.
 *
 * Modo sala: si se pasa `escenario={id,nombre}`, el MISMO mapa se abre con
 * ?escenario=<id> en la URL — el propio HTML legacy se encarga de avisar
 * ese id en cada mensaje (sin tocar su lógica de mover/deshacer). Acá solo
 * enrutamos: en modo sala las posiciones Y los bloqueos van a las tablas
 * `escenario_*` (nunca a las reales) y se ignora la auditoría real — una
 * sala nunca puede escribir en el mapa real.
 *
 * Comandos remotos (forwardRef): la barra de acciones de una sala vive en
 * React (SalasView), fuera del iframe, así que expone `activarModoBloqueo`,
 * `activarModoSeleccion` y `limpiarSeleccion`. Con el iframe (flag apagado),
 * cada uno reenvía un postMessage que el mapa legacy ya sabe resolver. Con
 * el Canvas (flag prendido), se llaman DIRECTO los mismos métodos expuestos
 * por `MapaCanvas` (forwardRef) -- ambos viven en el mismo árbol de React,
 * no hace falta serializar por window.postMessage (antes, con el Canvas
 * activo, estos 3 métodos eran un no-op silencioso: `ref.current` apuntaba
 * al iframe, que nunca se monta en esa rama).
 * `onCambio` avisa a React cada vez que algo se modificó de verdad en la
 * sala (para el contador de "cambios sin guardar" de la barra de acciones).
 *
 * "Añadir rack": el rol de la sesión decide si se MUESTRA el botón -- la
 * seguridad real está en RLS (pasillos_config solo acepta escritura de
 * Administrador). Al tocarlo, se llama a `onSolicitarAddRack` para que
 * App.jsx abra el modal -- ni el iframe ni el Canvas hablan con Supabase
 * directamente para esto.
 */
const SlottingFrame = forwardRef(function SlottingFrame({ sesion, escenario, onCambio, onSeleccionCambia, onSolicitarAddRack }, refExterno) {
  const ref = useRef(null);
  const canvasRef = useRef(null);
  const observerRef = useRef(null);
  const soloLectura = !puede(sesion.rol, escenario ? 'usar_salas' : 'mover');
  const [anchoContenedor, setAnchoContenedor] = useState(null);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  useImperativeHandle(refExterno, () => ({
    activarModoBloqueo() {
      if (MAPA_CANVAS_HABILITADO) canvasRef.current?.activarModoBloqueo();
      else ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'activarModoBloqueo' } }, '*');
    },
    activarModoSeleccion() {
      if (MAPA_CANVAS_HABILITADO) canvasRef.current?.activarModoSeleccion();
      else ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'activarModoSeleccion' } }, '*');
    },
    limpiarSeleccion() {
      if (MAPA_CANVAS_HABILITADO) canvasRef.current?.limpiarSeleccion();
      else ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'limpiarSeleccion' } }, '*');
    },
    recargar() {
      if (MAPA_CANVAS_HABILITADO) return; // el Canvas se mantiene sincronizado solo -- no necesita un reload duro
      try { ref.current?.contentWindow?.location.reload(); } catch { /* noop */ }
    },
  }), []);

  const parametros = new URLSearchParams({ rol: sesion.rol });
  if (escenario) { parametros.set('escenario', escenario.id); parametros.set('nombre', escenario.nombre); }
  const src = `/legacy/mapa_editable_slotting.html?${parametros.toString()}`;

  useEffect(() => {
    const manejadores = crearManejadoresMensajes({ sesion, onCambio, onSeleccionCambia, onSolicitarAddRack });
    function onMessage(ev) {
      if (!ev.data || !ev.data.type) return;
      const manejador = manejadores[ev.data.type];
      if (!manejador) return;
      const enSala = !!ev.data.payload?.escenarioId;
      manejador(ev.data.payload, ev, enSala);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sesion, onCambio, onSeleccionCambia, onSolicitarAddRack]);

  // Cuando se cambia el tema/orientación desde el menú de administración,
  // simplemente recargamos el iframe — el propio mapa vuelve a pedir su
  // estado (incluida la config nueva) al arrancar, sin lógica extra acá.
  useEffect(() => {
    function onConfigCambiada() {
      try { ref.current?.contentWindow?.location.reload(); } catch { /* noop */ }
    }
    window.addEventListener('mapa:config-cambiada', onConfigCambiada);
    return () => window.removeEventListener('mapa:config-cambiada', onConfigCambiada);
  }, []);

  function onIframeLoad() {
    observerRef.current?.disconnect();
    try {
      const grid = ref.current.contentDocument.getElementById('grid');
      if (!grid) return;
      // ResizeObserver, no una medición única: si el mapa está embebido en
      // React, #grid arranca VACÍO ("Cargando mapa…", ver 12-arranque.js) y
      // recién toma su tamaño real cuando llega slotting:estadoInicial (o a
      // los 4s, por timeout) — bien después de que el iframe ya disparó su
      // evento load. Medir acá una sola vez agarraba el grid vacío (~0px) y
      // el contenedor quedaba achicado para siempre, sin volver a medirse.
      observerRef.current = new ResizeObserver(() => {
        // scrollWidth (no el tamaño que reporta el observer) porque el propio
        // mapa puede aplicarle un transform:scale para evitar su scroll
        // horizontal interno (ver ajustarEscalaGrid() en 07-render.js) — el
        // tamaño reportado por el observer ya reflejaría eso.
        setAnchoContenedor(Math.round(grid.scrollWidth) + 60); // + padding del body + margen de respiro
      });
      observerRef.current.observe(grid);
    } catch {
      // Si por algún motivo no se puede observar, se queda con el 95vw de respaldo del CSS.
    }
  }

  if (MAPA_CANVAS_HABILITADO) {
    // El aviso de "solo lectura" vive DENTRO de MapaCanvas (chip flotante en
    // MapaToolbar, ver canvas.css) en vez de en un div propio acá -- a
    // diferencia del iframe (`.slotting-frame__iframe` usa flex:1 y se
    // adapta solo), el contenedor de MapaCanvas calcula su propia altura
    // fija (calc(100vh - 160px)); envolverlo en `.slotting-frame` (pensado
    // para el iframe) desalinearía esa altura si acá también hubiera un
    // banner empujando contenido en flujo normal.
    const mostrarAnadirRack = !escenario && sesion.rol === ROLES.ADMIN;
    // Reporte de posiciones (2026-07-22, antes en el Sidebar) -- mismo
    // criterio que ya usaba esa entrada: Admin o Supervisor, nunca en una sala.
    const mostrarReporte = !escenario && (sesion.rol === ROLES.ADMIN || sesion.rol === ROLES.SUPERVISOR);
    return (
      <Suspense fallback={<div style={{ color: '#9A9684', fontSize: 13, padding: 20 }}>Cargando canvas…</div>}>
        <MapaCanvas
          ref={canvasRef}
          escenarioId={escenario?.id ?? null}
          sesion={sesion}
          onCambio={onCambio}
          onSeleccionCambia={onSeleccionCambia}
          onSolicitarAddRack={onSolicitarAddRack}
          soloLectura={soloLectura}
          mostrarAnadirRack={mostrarAnadirRack}
          mostrarReporte={mostrarReporte}
        />
      </Suspense>
    );
  }

  return (
    <div className="slotting-frame" style={anchoContenedor ? { width: `${anchoContenedor}px` } : undefined}>
      {soloLectura && (
        <div className="slotting-frame__aviso">
          <i className="ti ti-lock" /> Tu rol ({sesion.rol}) tiene acceso de solo lectura {escenario ? 'a esta sala' : 'al mapa'}.
        </div>
      )}
      <iframe
        ref={ref}
        src={src}
        title="Mapa editable de slotting"
        className="slotting-frame__iframe"
        onLoad={onIframeLoad}
      />
    </div>
  );
});

export default SlottingFrame;
