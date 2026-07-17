import { pasoDelFlujo, esperandoAprobacion, puedeMarcarListo, puedeCancelar, puedeDevolverDelBuffer, todoRecolectado } from '../../migracion/flujoMigracionSlot.js';
import { useIdsEnCurso } from '../../../shared/hooks/useIdsEnCurso.js';
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
export default function FlujoMigracionSlot({ estado, movimientosPendientes = [], bufferDelSlot = [], puedeMigrar, onMarcarListo, onCancelarTraslado, onDevolver, onMarcarRecolectado, ocupado }) {
  // IDs de buffer con un "Devolver" en curso -- ver useIdsEnCurso.js.
  // Declarado ANTES del return temprano de abajo -- los hooks de React no
  // pueden ser condicionales.
  const { idsEnCurso: devolviendo, ejecutar } = useIdsEnCurso();

  // Espera de cupo (F2, capacidad por equipo) -- ANTES del paso 1, no un
  // paso más del flujo guiado (ver flujoMigracionSlot.js). Sin acción del
  // operador acá salvo retirar la solicitud -- aprobar es cosa de
  // Supervisor/Administrador, desde la cola de aprobaciones del Sidebar.
  if (esperandoAprobacion(estado)) {
    return (
      <div style={{ margin: '0 16px 16px', padding: '16px 18px', borderRadius: 10, border: `1px solid ${BORDE_CLARO}`, background: BLANCO_HUESO_TARJETA }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <i className="ti ti-hourglass" style={{ fontSize: 16, color: ESTADOS.medio }} />
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO }}>
            Esperando cupo
          </span>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.4, color: GRIS_TEXTO, margin: 0 }}>
          Ya hay equipos trabajando al máximo de su cupo libre -- un Supervisor o Administrador debe habilitar este equipo adicional antes de arrancar.
        </p>
        {puedeMigrar && (
          <div style={{ marginTop: 12 }}>
            <button className="btn-secondary" disabled={ocupado} onClick={onCancelarTraslado} style={{ fontSize: 15, padding: '8px 16px', color: ESTADOS.sobrecargado }}>
              Retirar solicitud
            </button>
          </div>
        )}
      </div>
    );
  }

  const paso = pasoDelFlujo(estado);
  if (!paso) return null;
  const puedeDevolver = puedeMigrar && puedeDevolverDelBuffer(estado);

  function manejarDevolver(id, articulo, origenNivel) {
    return ejecutar(id, () => onDevolver(id, articulo, origenNivel));
  }

  return (
    <div style={{ margin: '0 16px 16px', padding: '16px 18px', borderRadius: 10, border: `1px solid ${BORDE_CLARO}`, background: BLANCO_HUESO_TARJETA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <i className="ti ti-truck-delivery" style={{ fontSize: 16, color: ESTADOS.medio }} />
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO }}>
          Migración -- paso {paso} de 3
        </span>
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.4, fontWeight: 500, color: GRIS_TEXTO, margin: 0 }}>{ETIQUETA_PASO[paso]}</p>

      {/* Contenido actual del buffer de ESTE slot -- lo que ya se movió mientras se vacía/recolecta. */}
      {(paso === 1 || paso === 2) && bufferDelSlot.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE, margin: '0 0 8px' }}>
            En el buffer ({bufferDelSlot.length})
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bufferDelSlot.map(b => (
              <li key={b.id} style={{ fontSize: 14, fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{b.articulo}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: GRIS_TEXTO }}>{b.origenNivel}</span>
                  {puedeDevolver && (
                    <button
                      onClick={() => manejarDevolver(b.id, b.articulo, b.origenNivel)}
                      disabled={devolviendo.has(b.id)}
                      title={`Devolver ${b.articulo} a ${b.origenNivel} -- deshace este depósito`}
                      style={{ border: 'none', background: 'transparent', color: ESTADOS.sobrecargado, cursor: devolviendo.has(b.id) ? 'default' : 'pointer', opacity: devolviendo.has(b.id) ? 0.5 : 1, fontSize: 15, padding: 0, display: 'flex', alignItems: 'center' }}
                    >
                      <i className="ti ti-arrow-back-up" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {paso === 2 && (
        <div style={{ marginTop: 12 }}>
          {movimientosPendientes.length === 0 ? (
            <p style={{ fontSize: 13, color: GRIS_TEXTO_TENUE, margin: '0 0 10px' }}>
              Sin plan de recolección todavía para este destino (falta generarlo -- ver "Generar plan de recolección" en el menú).
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: GRIS_TEXTO, margin: '0 0 10px' }}>
                {movimientosPendientes.filter(m => m.estado === 'recolectado').length} de {movimientosPendientes.length} recolectado(s) -- traé cada artículo desde su origen RCL y marcalo acá.
              </p>
              <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {movimientosPendientes.map(m => {
                  const listo = m.estado === 'recolectado';
                  return (
                    <li key={m.id} style={{ fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, opacity: listo ? 0.5 : 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {puedeMigrar && (
                          <input
                            type="checkbox"
                            checked={listo}
                            disabled={listo || ocupado}
                            onChange={() => onMarcarRecolectado(m.id)}
                            style={{ width: 19, height: 19, cursor: listo ? 'default' : 'pointer', flexShrink: 0 }}
                          />
                        )}
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, textDecoration: listo ? 'line-through' : 'none' }}>{m.articulo}</span>
                      </span>
                      <span style={{ fontFamily: 'monospace', color: GRIS_TEXTO, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {m.rclCodigo}-N{String(m.rclNivel).padStart(2, '0')} · x{m.cantidad}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {puedeMigrar && puedeMarcarListo(estado) && (() => {
            const falta = !todoRecolectado(movimientosPendientes);
            return (
              <button
                className="btn-primary"
                disabled={ocupado || falta}
                onClick={onMarcarListo}
                title={falta ? 'Todavía faltan artículos por recolectar de esta lista' : undefined}
                style={{ fontSize: 15, padding: '9px 18px' }}
              >
                {falta ? 'Faltan artículos por recolectar' : 'Marcar listo -- bloquea el slot para el supervisor'}
              </button>
            );
          })()}
        </div>
      )}

      {puedeMigrar && puedeCancelar(estado) && (
        <div style={{ marginTop: 12 }}>
          <button
            className="btn-secondary"
            disabled={ocupado}
            onClick={onCancelarTraslado}
            style={{ fontSize: 15, padding: '8px 16px', color: ESTADOS.sobrecargado }}
          >
            {bufferDelSlot.length > 0 ? `Cancelar traslado (sacará ${bufferDelSlot.length} del buffer)` : 'Cancelar traslado'}
          </button>
        </div>
      )}
    </div>
  );
}
