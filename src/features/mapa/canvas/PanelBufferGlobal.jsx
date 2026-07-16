import { useIdsEnCurso } from '../../../shared/hooks/useIdsEnCurso.js';

/**
 * Vista GLOBAL del buffer de migración -- a diferencia de la lista dentro
 * de FlujoMigracionSlot.jsx (que solo muestra el buffer del slot que tenés
 * abierto ahora mismo), esta ve TODO lo que hoy está en tránsito, sin
 * importar qué ficha esté abierta. Mismo look que TerminalCambios.jsx
 * (reusa las clases .mapa-terminal de canvas.css), pensada para vivir al
 * lado de esa terminal, no reemplazarla.
 *
 * `origen`/`destino`/`puedeDevolver`/`listoParaColocar` ya vienen resueltos
 * desde MapaCanvas.jsx (que es quien tiene el Map de slots y sabe armar
 * "MZ03-C005-N02", si el slot de origen todavía admite deshacer un
 * depósito, y si el destino real ya terminó su propio vaciado) -- este
 * componente no calcula nada, solo muestra y delega el click de "Devolver"
 * en `onDevolver`.
 *
 * `alertas` (ver alertasBuffer.js): destinos que ya juntaron suficiente en
 * el buffer y están listos para recibir -- se muestran arriba de todo,
 * como el aviso accionable que el usuario pidió ("avisame cuando el MZx
 * esté listo con 8-9 artículos esperando").
 */
export default function PanelBufferGlobal({ items, onCerrar, onDevolver, alertas = [] }) {
  // IDs con un "Devolver" en curso -- ver useIdsEnCurso.js.
  const { idsEnCurso: devolviendo, ejecutar } = useIdsEnCurso();
  function manejarDevolver(it) {
    return ejecutar(it.id, () => onDevolver(it));
  }

  return (
    <div className="mapa-terminal">
      <div className="mapa-terminal__header">
        <span><i className="ti ti-package" /> Buffer de migración ({items.length})</span>
        <button className="mapa-terminal__cerrar" onClick={onCerrar} title="Ocultar">Ocultar ›</button>
      </div>

      {alertas.length > 0 && (
        <div style={{ background: '#E8F3EA', borderBottom: '1px solid #9FBF9F', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {alertas.map(a => (
            <div key={`${a.mzPasillo}-${a.mzColumna}`} style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6, color: '#2E5D34' }}>
              <i className="ti ti-bell-ringing" />
              <b>{a.mzPasillo}-C{String(a.mzColumna).padStart(3, '0')}</b> está listo -- {a.cantidad} artículo(s) esperando en el buffer, ya podés colocarlos.
            </div>
          ))}
        </div>
      )}

      <div className="mapa-terminal__log">
        {items.length === 0 ? (
          <div className="mapa-terminal__vacio">El buffer está vacío -- nada en tránsito ahora mismo.</div>
        ) : (
          items.map(it => (
            <div key={it.id} className="mapa-terminal__linea">
              <div className="mapa-terminal__articulo">
                <span>{it.articulo}</span>
                {!it.confirmadoEn && <span className="mapa-terminal__badge">sin confirmar</span>}
                {it.listoParaColocar && <span className="mapa-terminal__badge" style={{ background: '#9FBF9F', color: '#1E3A22' }}>listo</span>}
              </div>
              <div>
                <span className="mapa-terminal__desde">{it.origen}</span>
                {' '}<span className="mapa-terminal__flecha">→</span>{' '}
                <span className="mapa-terminal__hacia">{it.destino}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className="mapa-terminal__hora">
                  {new Date(it.dejadoEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                {/* "Devolver" -- deshace ESTE depósito puntual (equivocación del operador), sin cancelar todo el traslado. Solo mientras el slot de origen sigue en vaciando/recolectando (ver puedeDevolverDelBuffer). */}
                {it.puedeDevolver && (
                  <button
                    onClick={() => manejarDevolver(it)}
                    disabled={devolviendo.has(it.id)}
                    title={`Devolver ${it.articulo} -- deshace este depósito`}
                    style={{ border: 'none', background: 'transparent', color: '#B47A6A', cursor: devolviendo.has(it.id) ? 'default' : 'pointer', opacity: devolviendo.has(it.id) ? 0.5 : 1, fontSize: 11, padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                  >
                    <i className="ti ti-arrow-back-up" /> Devolver
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
