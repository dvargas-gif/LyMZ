/**
 * Terminal de cambios -- mismo criterio que #terminal del mapa legacy (ver
 * logMov() en 08-interacciones.js): lista cada movimiento de esta sesión,
 * más reciente arriba, "artículo -> desde -> hacia -> hora". Lee de
 * `cambios`, la MISMA pila que alimenta Deshacer y la hoja "Cambios" del
 * Excel -- nunca puede desincronizarse porque es una sola fuente.
 *
 * Colores desde/hacia (#B47A6A / #9FBF9F) son los mismos que ya usaba
 * logMov() en el mapa legacy -- se reusan a propósito, no son un tema
 * nuevo inventado para esta pieza puntual.
 */
export default function TerminalCambios({ cambios, onCerrar }) {
  return (
    <div className="mapa-terminal">
      <div className="mapa-terminal__header">
        <span><i className="ti ti-terminal-2" /> Registro de cambios ({cambios.length})</span>
        <button className="mapa-terminal__cerrar" onClick={onCerrar} title="Ocultar registro">Ocultar ›</button>
      </div>
      <div className="mapa-terminal__log">
        {cambios.length === 0 ? (
          <div className="mapa-terminal__vacio">Todavía no hay cambios en esta sesión.</div>
        ) : (
          [...cambios].reverse().map((lote, i) => (
            <div key={cambios.length - i} className="mapa-terminal__linea">
              <div className="mapa-terminal__articulo">
                <span>{lote.articuloEtiqueta}</span>
                {lote.tipoMovimiento === 'cuerpo' && <span className="mapa-terminal__badge">cuerpo</span>}
              </div>
              <div>
                <span className="mapa-terminal__desde">{lote.desde}</span>
                {' '}<span className="mapa-terminal__flecha">→</span>{' '}
                <span className="mapa-terminal__hacia">{lote.hacia}</span>
              </div>
              <div className="mapa-terminal__hora">{new Date(lote.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
