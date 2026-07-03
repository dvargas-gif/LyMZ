import { useState } from 'react';

/**
 * Tabla de salas + formulario para crear una nueva. `salas`/`cargando`
 * vienen del padre (SalasView) porque tienen que sobrevivir el ida-y-vuelta
 * a una sala abierta — si vivieran acá, cada vez que se cierra una sala
 * este componente se remontaría desde cero y se perdería la lista ya
 * cargada mientras se refresca. `onCrear`/`onEliminar` hacen la operación
 * real contra Supabase y el refresco de la lista; acá solo se arma el
 * formulario y se decide cuándo llamarlos.
 */
export default function ListaSalas({ salas, cargando, onCrear, onAbrir, onEliminar }) {
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [errorCrear, setErrorCrear] = useState('');

  async function handleCrear(e) {
    e.preventDefault();
    if (!nombreNuevo.trim()) return;
    setCreando(true);
    setErrorCrear('');
    try {
      await onCrear(nombreNuevo.trim());
      setNombreNuevo('');
    } catch (err) {
      console.error(err);
      setErrorCrear(err?.message ? `No se pudo crear el escenario: ${err.message}` : 'No se pudo crear el escenario. Revisá la consola para más detalle.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="panel">
      <h2>Salas de simulación</h2>
      <p className="muted">
        Cada sala es una copia del mapa (foto del estado real al momento de crearla) donde podés proponer
        acomodos alternativos libremente, bloquear posiciones, limpiar áreas y cargar picks para simular
        rotación — nada de lo que hagas acá afecta el mapa real.
      </p>

      <form onSubmit={handleCrear} className="filtros-bar" style={{ marginTop: 16 }}>
        <input
          placeholder="Nombre del escenario (ej. Propuesta reorganización julio)"
          value={nombreNuevo}
          onChange={e => setNombreNuevo(e.target.value)}
          style={{ minWidth: 320 }}
        />
        <button className="btn-primary" disabled={creando || !nombreNuevo.trim()}>
          <i className="ti ti-plus" /> {creando ? 'Creando copia del acomodo actual…' : 'Crear nuevo escenario'}
        </button>
      </form>
      {errorCrear && <p style={{ color: '#C0392B', fontSize: 12.5, marginTop: 8 }}>{errorCrear}</p>}

      <table className="tabla" style={{ marginTop: 20 }}>
        <thead>
          <tr><th>Nombre</th><th>Creada por</th><th>Fecha</th><th>Última actualización</th><th></th></tr>
        </thead>
        <tbody>
          {cargando && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>Cargando…</td></tr>}
          {!cargando && salas.length === 0 && (
            <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 20 }}>Todavía no hay salas creadas.</td></tr>
          )}
          {salas.map(s => (
            <tr key={s.id}>
              <td>{s.nombre}</td>
              <td>{s.creado_por_nombre || '—'}</td>
              <td>{new Date(s.creado_en).toLocaleString()}</td>
              <td className="muted">{s.actualizado_en ? new Date(s.actualizado_en).toLocaleString() : '—'}</td>
              <td style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => onAbrir(s)}>Abrir</button>
                <button className="btn-icon" onClick={() => onEliminar(s)} title="Borrar sala">
                  <i className="ti ti-trash" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
