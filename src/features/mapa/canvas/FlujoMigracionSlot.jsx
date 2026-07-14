import { pasoDelFlujo, puedeMarcarListo, puedeCancelar } from '../../migracion/flujoMigracionSlot.js';
import { GRIS_TEXTO, GRIS_TEXTO_TENUE, BORDE_CLARO, BLANCO_HUESO_TARJETA, ESTADOS } from './paleta.js';

const ETIQUETA_PASO = {
  1: 'Vaciando -- mové cada artículo al buffer con el botón junto a él, hasta que el rack quede en 0',
  2: 'Recolectando -- traé los artículos correctos desde cada origen',
  3: 'Bloqueado -- esperando confirmación del supervisor/administrador',
  4: 'Migración confirmada',
};

/**
 * Progreso del flujo guiado de migración (F2) DENTRO de la ficha del rack --
 * a diferencia de BarraMovimiento.jsx (que flota sobre el mapa porque su
 * flujo necesita clickear OTRA celda), acá los 3 pasos son enteramente
 * sobre ESTE rack -- vaciar es un botón por artículo ya en la ficha,
 * recolectar es una lista, bloquear es un botón. Vive adentro de
 * PanelDetalle.jsx, no aparte.
 *
 * El paso 1->2 (vaciando->recolectando) es AUTOMÁTICO -- lo dispara
 * MapaCanvas.jsx en cuanto el rack llega a 0 artículos, no un botón acá.
 */
export default function FlujoMigracionSlot({ estado, movimientosPendientes = [], bufferDelSlot = [], puedeMigrar, onMarcarListo, onCancelarTraslado, ocupado }) {
  const paso = pasoDelFlujo(estado);
  if (!paso) return null;

  return (
    <div style={{ margin: '0 16px 16px', padding: '12px 14px', borderRadius: 10, border: `1px solid ${BORDE_CLARO}`, background: BLANCO_HUESO_TARJETA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <i className="ti ti-truck-delivery" style={{ fontSize: 13, color: ESTADOS.medio }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE }}>
          Migración -- paso {paso} de 3
        </span>
      </div>
      <p style={{ fontSize: 12, color: GRIS_TEXTO, margin: 0 }}>{ETIQUETA_PASO[paso]}</p>

      {/* Contenido actual del buffer de ESTE slot -- lo que ya se movió mientras se vacía/recolecta. */}
      {(paso === 1 || paso === 2) && bufferDelSlot.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE, margin: '0 0 6px' }}>
            En el buffer ({bufferDelSlot.length})
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bufferDelSlot.map(b => (
              <li key={b.id} style={{ fontSize: 11.5, fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{b.articulo}</span>
                <span style={{ color: GRIS_TEXTO_TENUE }}>{b.origenNivel}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {paso === 2 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 11, color: GRIS_TEXTO_TENUE, margin: '0 0 8px' }}>
            {movimientosPendientes.length === 0
              ? 'Sin movimientos definidos todavía para este destino (el cruce manual aún no se importó).'
              : `${movimientosPendientes.length} artículo(s) por recolectar.`}
          </p>
          {puedeMigrar && puedeMarcarListo(estado) && (
            <button
              className="btn-primary"
              disabled={ocupado}
              onClick={onMarcarListo}
              style={{ fontSize: 12 }}
            >
              Marcar listo -- bloquea el slot para el supervisor
            </button>
          )}
        </div>
      )}

      {puedeMigrar && puedeCancelar(estado) && (
        <div style={{ marginTop: 10 }}>
          <button
            className="btn-secondary"
            disabled={ocupado}
            onClick={onCancelarTraslado}
            style={{ fontSize: 12, color: ESTADOS.sobrecargado }}
          >
            {bufferDelSlot.length > 0 ? `Cancelar traslado (sacará ${bufferDelSlot.length} del buffer)` : 'Cancelar traslado'}
          </button>
        </div>
      )}
    </div>
  );
}
