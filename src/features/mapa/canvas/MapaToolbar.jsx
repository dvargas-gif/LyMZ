import { useState } from 'react';
import { motion } from 'framer-motion';
import { BLANCO_CALIDO_TENUE, ESTADOS } from './paleta.js';
import { interaccionBoton } from '../../../ui/motion/variants.js';
import { useReducedMotion } from '../../../ui/motion/prefersReducedMotion.js';
import TerminalCambios from './TerminalCambios.jsx';

/**
 * Barra de herramientas del canvas -- reemplaza al toolbar HTML del mapa
 * legacy (ver 08-interacciones.js/11-buscar-exportar.js), con la MISMA
 * capacidad, solo con otra piel: iconos Tabler (ya cargados globalmente,
 * cero costo nuevo), tooltips nativos (`title`), estados hover/active vía
 * clases CSS (.mapa-toolbar__boton en canvas.css) y transición `--ease-ios`.
 *
 * Fija arriba-izquierda a propósito -- el bloque de pestañas/panel vive
 * arriba-centro (ver MapaCanvas.jsx), así ninguno tapa al otro.
 */
export default function MapaToolbar({
  onRestablecerVista, onZoomIn, onZoomOut,
  valorBusqueda, onCambiarBusqueda, resultadoBusqueda,
  onExportar,
  modoEdicion, onToggleEdicion,
  modoBloqueo, onToggleBloqueo,
  puedeDeshacer, onDeshacer,
  cambios,
  mostrarAnadirRack, onAnadirRack,
  soloLectura,
}) {
  const [buscarEnfocado, setBuscarEnfocado] = useState(false);
  const [terminalAbierta, setTerminalAbierta] = useState(false);
  const cantidadCambios = cambios.length;

  return (
    <div style={contenedorStyle}>
      <div className="mapa-toolbar">
        <BotonToolbar icono="ti-frame" titulo="Restablecer vista" onClick={onRestablecerVista} />
        <BotonToolbar icono="ti-zoom-out" titulo="Alejar" onClick={onZoomOut} />
        <BotonToolbar icono="ti-zoom-in" titulo="Acercar" onClick={onZoomIn} />

        <div className="mapa-toolbar__separador" />

        <div className={`mapa-toolbar__buscar ${buscarEnfocado ? 'mapa-toolbar__buscar--activo' : ''}`}>
          <i className="ti ti-search" style={{ fontSize: 14, color: BLANCO_CALIDO_TENUE }} />
          <input
            type="text"
            placeholder="Buscar artículo…"
            value={valorBusqueda}
            onChange={e => onCambiarBusqueda(e.target.value)}
            onFocus={() => setBuscarEnfocado(true)}
            onBlur={() => setBuscarEnfocado(false)}
          />
        </div>

        {!soloLectura && (
          <>
            <div className="mapa-toolbar__separador" />
            <BotonToolbar icono="ti-edit" titulo="Modo edición (arrastrá para mover un rack completo)" onClick={onToggleEdicion} activo={modoEdicion} />
            <BotonToolbar icono={modoBloqueo ? 'ti-lock-open' : 'ti-lock'} titulo={modoBloqueo ? 'Modo bloqueo ACTIVO -- tocá posiciones' : 'Bloquear posiciones'} onClick={onToggleBloqueo} activo={modoBloqueo} />
            <BotonToolbar icono="ti-arrow-back-up" titulo="Deshacer último movimiento" onClick={onDeshacer} deshabilitado={!puedeDeshacer} badge={cantidadCambios > 0 ? cantidadCambios : null} />
            <BotonToolbar
              icono="ti-terminal-2"
              titulo={terminalAbierta ? 'Ocultar registro de cambios' : 'Ver registro de cambios'}
              onClick={() => setTerminalAbierta(v => !v)}
              activo={terminalAbierta}
            />
          </>
        )}

        <div className="mapa-toolbar__separador" />
        <BotonToolbar icono="ti-file-export" titulo="Exportar Excel con cambios" onClick={onExportar} />

        {mostrarAnadirRack && (
          <>
            <div className="mapa-toolbar__separador" />
            <BotonToolbar icono="ti-plus" titulo="Añadir rack (extender un pasillo)" onClick={onAnadirRack} />
          </>
        )}
      </div>

      {resultadoBusqueda && (
        <div className="mapa-toolbar__resultado" style={{ color: resultadoBusqueda.startsWith('✓') ? ESTADOS.ok : ESTADOS.sobrecargado }}>
          {resultadoBusqueda}
        </div>
      )}

      {soloLectura && (
        <div className="mapa-toolbar__aviso">
          <i className="ti ti-lock" /> Solo lectura
        </div>
      )}

      {terminalAbierta && !soloLectura && (
        <TerminalCambios cambios={cambios} onCerrar={() => setTerminalAbierta(false)} />
      )}
    </div>
  );
}

function BotonToolbar({ icono, titulo, onClick, activo, deshabilitado, badge }) {
  const reducido = useReducedMotion();
  return (
    <motion.button
      className={`mapa-toolbar__boton ${activo ? 'mapa-toolbar__boton--activo' : ''}`}
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={deshabilitado}
      {...(deshabilitado ? {} : interaccionBoton(reducido))}
    >
      <i className={`ti ${icono}`} />
      {badge != null && <span className="mapa-toolbar__badge">{badge}</span>}
    </motion.button>
  );
}

const contenedorStyle = { position: 'absolute', top: 16, left: 16, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6 };
