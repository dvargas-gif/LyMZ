import ModalBase from '../../../shared/components/ModalBase.jsx';

/**
 * Pedido explícito 2026-08-20 (ver ADR-019): antes de aplicar un movimiento
 * manual en el mapa real, si alguno de los artículos ya tenía un
 * `migracion_movimiento` pendiente hacia otro rack, esto PARA el flujo y
 * exige una decisión explícita -- nunca se aplica en silencio. Confirmar
 * marca esos movimientos "a_revisar" (los saca de la planificación
 * automática de Despacho, un Supervisor/Administrador los resuelve después
 * en PanelMigracion.jsx) y recién ahí sigue con el movimiento real.
 */
export default function ConfirmarConflictoMigracion({ conflictos, onConfirmar, onCancelar }) {
  return (
    <ModalBase titulo="Este movimiento choca con trabajo de migración pendiente" onCerrar={onCancelar} maxWidth={520}>
      <p style={{ marginTop: 0 }}>
        {conflictos.length === 1
          ? 'El artículo que estás moviendo ya tenía un movimiento de migración pendiente hacia otro rack:'
          : `${conflictos.length} de los artículos que estás moviendo ya tenían un movimiento de migración pendiente hacia otro rack:`}
      </p>
      <ul className="lista-simple" style={{ marginBottom: 16 }}>
        {conflictos.map(c => (
          <li key={c.id}>
            <span style={{ fontFamily: 'monospace' }}>{c.articulo}</span>
            <strong>→ {c.mzPasillo}-C{String(c.mzColumna).padStart(3, '0')}</strong>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: 13 }}>
        Si confirmás, ese trabajo pendiente queda marcado "a revisar" -- no se le va a seguir pidiendo a nadie que lo haga hasta que un Supervisor lo revise. Si cancelás, tu movimiento no se aplica.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button className="btn-secondary" onClick={onCancelar}>Cancelar</button>
        <button className="btn-danger" onClick={onConfirmar}>Confirmar igual</button>
      </div>
    </ModalBase>
  );
}
