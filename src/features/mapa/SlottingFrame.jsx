import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { puede } from '../auth/roles.js';
import { crearManejadoresMensajes } from './mensajesMapa.js';

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
 * `activarModoSeleccion` y `limpiarSeleccion` — cada uno solo reenvía un
 * postMessage que el propio mapa legacy ya sabe escuchar y resolver con una
 * función que ya existía ahí (no se duplica nada de esa lógica acá).
 * `onCambio` avisa a React cada vez que algo se modificó de verdad en la
 * sala (para el contador de "cambios sin guardar" de la barra de acciones).
 *
 * "Añadir rack": el rol de la sesión viaja en la URL (?rol=...) solo para
 * decidir si el mapa MUESTRA el botón — la seguridad real está en RLS
 * (pasillos_config solo acepta escritura de Administrador). Al tocarlo, el
 * mapa avisa por postMessage ('slotting:solicitarAddRack') y acá se lo
 * pasamos a `onSolicitarAddRack` para que App.jsx abra el modal — el mapa
 * nunca habla con Supabase directamente, ni siquiera para esto.
 */
const SlottingFrame = forwardRef(function SlottingFrame({ sesion, escenario, onCambio, onSeleccionCambia, onSolicitarAddRack }, refExterno) {
  const ref = useRef(null);
  const soloLectura = !puede(sesion.rol, escenario ? 'usar_salas' : 'mover');
  const [anchoContenedor, setAnchoContenedor] = useState(null);

  useImperativeHandle(refExterno, () => ({
    activarModoBloqueo() {
      ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'activarModoBloqueo' } }, '*');
    },
    activarModoSeleccion() {
      ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'activarModoSeleccion' } }, '*');
    },
    limpiarSeleccion() {
      ref.current?.contentWindow?.postMessage({ type: 'slotting:comando', payload: { accion: 'limpiarSeleccion' } }, '*');
    },
    recargar() {
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
    try {
      const grid = ref.current.contentDocument.getElementById('grid');
      if (!grid) return;
      // scrollWidth (no getBoundingClientRect) porque el propio mapa puede
      // aplicarle un transform:scale para evitar su scroll horizontal interno
      // — getBoundingClientRect reflejaría el tamaño YA achicado y este
      // cálculo terminaría pidiendo un contenedor cada vez más chico.
      const anchoGrid = grid.scrollWidth;
      setAnchoContenedor(Math.round(anchoGrid) + 60); // + padding del body + margen de respiro
    } catch {
      // Si por algún motivo no se puede medir, se queda con el 95vw de respaldo del CSS.
    }
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
