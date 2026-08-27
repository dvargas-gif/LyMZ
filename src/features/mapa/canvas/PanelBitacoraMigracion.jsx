const ETIQUETAS_EVENTO = {
  vaciado_articulo: 'Vaciado (artículo)',
  vaciado_completo: 'Vaciado completo',
  recoleccion: 'Recolección',
  bloqueo: 'Bloqueo',
  confirmacion: 'Confirmación',
  articulo_devuelto: 'Artículo devuelto',
  traslado_cancelado: 'Traslado cancelado',
  traslado_eliminado_admin: 'Eliminado por admin',
};

/**
 * Bitácora en vivo de "migración en vivo" (2026-08-26, pedido explícito de
 * David: "quiero un real time de los movimientos... un feed/registro de
 * movimientos en curso"). Lee `migracion_auditoria` (append-only, ya
 * existía) -- este panel no escribe nada, solo muestra lo que otras partes
 * de la app ya registran ahí. Mismo look que PanelBufferGlobal.jsx (clases
 * .mapa-terminal), pensado para supervisar la operación, no para corregir
 * el mapa.
 */
export default function PanelBitacoraMigracion({ eventos, abierta, onToggle }) {
  return (
    // bottom:134 -- el Minimapa vive en bottom:12/right:12 con 110px de alto
    // (ver Minimapa en MapaCanvas.jsx) -- este panel se apila arriba, nunca
    // encima (colisión real encontrada y corregida 2026-08-26).
    <div style={{ position: 'absolute', bottom: 134, right: 16, zIndex: 25, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {abierta && (
        <div className="mapa-terminal" style={{ width: 300, maxHeight: 360 }}>
          <div className="mapa-terminal__header">
            <span><i className="ti ti-activity" /> Bitácora de migración</span>
            <button className="mapa-terminal__cerrar" onClick={onToggle} title="Ocultar">Ocultar ›</button>
          </div>
          <div className="mapa-terminal__log">
            {eventos.length === 0 ? (
              <div className="mapa-terminal__vacio">Sin movimientos registrados todavía.</div>
            ) : (
              eventos.map(e => (
                <div key={e.id} className="mapa-terminal__linea">
                  <div className="mapa-terminal__articulo">
                    <span>{ETIQUETAS_EVENTO[e.evento] ?? e.evento}</span>
                  </div>
                  <div>
                    <span className="mapa-terminal__hacia">{e.mzPasillo}-C{String(e.mzColumna).padStart(3, '0')}</span>
                  </div>
                  {e.detalle && <div style={{ fontSize: 11, color: '#B9B3A8', marginTop: 2 }}>{e.detalle}</div>}
                  <div className="mapa-terminal__hora">
                    {new Date(e.fechaHora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {!abierta && (
        <button
          onClick={onToggle}
          title="Bitácora de migración"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
            background: 'rgba(27, 31, 32, .82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid #4A4038', color: '#F2EDE4', fontSize: 11.5, cursor: 'pointer',
          }}
        >
          <i className="ti ti-activity" />
          Bitácora
          {eventos.length > 0 && (
            <span style={{
              minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#C99A4A', color: '#121415',
              fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {eventos.length}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
