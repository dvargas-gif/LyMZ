/**
 * Lista de tareas de UN trabajador numerado, para que el cabecilla de
 * equipo la vaya confirmando a medida que la persona de piso reporta
 * avance -- pedido explícito: "debe hacer uno a uno, así no me pierdo el
 * progreso". Por eso NO hay botón "confirmar todo": solo la primera tarea
 * 'pendiente' (en orden) tiene su botón habilitado, el resto queda
 * deshabilitado hasta que le toque el turno.
 */
function rackTexto(mzPasillo, mzColumna) {
  return `${mzPasillo}-C${String(mzColumna).padStart(3, '0')}`;
}

// La tarea de 'vaciar' saca contenido VIEJO (identidad RCL) de un rack que
// hoy es MZ -- pedido explícito del usuario (2026-07-22): el piso todavía
// busca la posición por su cartel físico RCL, no por el código MZ (que es
// la identidad nueva/del sistema, no necesariamente reseñalizada todavía).
// Mostrar el RCL como referencia PRINCIPAL acá evita mandar a alguien a
// buscar un cartel "MZ01-C021" que puede no existir todavía en el piso.
function origenRcl(tarea) {
  if (tarea.rclCodigo == null) return '(origen sin identificar)';
  return `${tarea.rclCodigo}-N${String(tarea.rclNivel).padStart(2, '0')}`;
}

function descripcion(tarea) {
  if (tarea.tipo === 'vaciar') return `Sacar "${tarea.articulo ?? ''}" de ${origenRcl(tarea)} (rack ${rackTexto(tarea.mzPasillo, tarea.mzColumna)}) y dejarlo en el carro de buffer`;
  return `Buscar "${tarea.articulo ?? ''}" en ${tarea.rclCodigo ?? '(origen sin identificar)'} y llevarlo a ${rackTexto(tarea.mzPasillo, tarea.mzColumna)}`;
}

const ESTADO_TEXTO = { pendiente: 'Pendiente', confirmada: 'Hecho', cancelada: 'Cancelada' };

export default function ChecklistTrabajador({ trabajador, puedeCancelar, procesando, onConfirmar, onCancelar }) {
  const primeraPendienteId = trabajador.tareas.find(t => t.estado === 'pendiente')?.id;
  const hechas = trabajador.tareas.filter(t => t.estado !== 'pendiente').length;

  return (
    <div style={{ border: '1px solid var(--borde-claro)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b style={{ fontSize: 13.5 }}>Trabajador {String(trabajador.numero).padStart(3, '0')}</b>
        <span style={{ fontSize: 11.5, color: 'var(--texto-tenue)', fontVariantNumeric: 'tabular-nums' }}>{hechas}/{trabajador.tareas.length}</span>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {trabajador.tareas.map(tarea => {
          const esElTurno = tarea.id === primeraPendienteId;
          return (
            <li key={tarea.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, opacity: tarea.estado === 'cancelada' ? .55 : 1 }}>
              <span style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
                background: tarea.estado === 'confirmada' ? 'var(--verde-tenue, #E6F5E9)' : tarea.estado === 'cancelada' ? 'var(--borde-claro)' : 'transparent',
                border: `1px solid ${tarea.estado === 'confirmada' ? 'var(--green, #1F7A3D)' : 'var(--borde-claro)'}`,
                color: tarea.estado === 'confirmada' ? 'var(--green, #1F7A3D)' : 'var(--texto-tenue)',
              }}>
                {tarea.estado === 'confirmada' ? '✓' : tarea.estado === 'cancelada' ? '×' : ''}
              </span>
              <span style={{ flex: 1, textDecoration: tarea.estado === 'cancelada' ? 'line-through' : 'none' }}>{descripcion(tarea)}</span>
              {tarea.estado === 'pendiente' && (
                <button
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  disabled={!esElTurno || procesando === tarea.id}
                  title={esElTurno ? undefined : 'Primero hay que confirmar la tarea anterior de este trabajador'}
                  onClick={() => onConfirmar(tarea.id)}
                >
                  {procesando === tarea.id ? '…' : 'Confirmar'}
                </button>
              )}
              {tarea.estado === 'pendiente' && puedeCancelar && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red)' }}
                  disabled={procesando === tarea.id}
                  onClick={() => onCancelar(tarea.id)}
                >
                  Cancelar
                </button>
              )}
              {tarea.estado !== 'pendiente' && <span style={{ fontSize: 11, color: 'var(--texto-tenue)' }}>{ESTADO_TEXTO[tarea.estado]}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
