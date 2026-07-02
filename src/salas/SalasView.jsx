import { useEffect, useState } from 'react';
import { escenariosService } from '../services/escenarios.service.js';
import SlottingFrame from '../components/SlottingFrame.jsx';

/**
 * Lista de salas de simulación + la sala abierta (si hay una seleccionada).
 * Cada sala reutiliza SlottingFrame en modo "escenario": mismo mapa, mismo
 * comportamiento, pero todo lo que se guarda queda aislado en
 * `escenario_posiciones` — nunca toca el mapa real.
 */
export default function SalasView({ sesion }) {
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [salaAbierta, setSalaAbierta] = useState(null);

  async function cargar() {
    setCargando(true);
    setSalas(await escenariosService.listar());
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function handleCrear(e) {
    e.preventDefault();
    if (!nombreNuevo.trim()) return;
    setCreando(true);
    try {
      const nueva = await escenariosService.crear({ nombre: nombreNuevo.trim(), usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre });
      setNombreNuevo('');
      await cargar();
      setSalaAbierta(nueva);
    } finally {
      setCreando(false);
    }
  }

  async function handleEliminar(sala) {
    if (!confirm(`¿Borrar la sala "${sala.nombre}"? Esto no se puede deshacer.`)) return;
    await escenariosService.eliminar(sala.id);
    if (salaAbierta?.id === sala.id) setSalaAbierta(null);
    await cargar();
  }

  if (salaAbierta) {
    return (
      <div className="panel">
        <div className="panel__header">
          <h2>🧪 {salaAbierta.nombre}</h2>
          <button onClick={() => setSalaAbierta(null)}>← Volver a salas</button>
        </div>
        <SlottingFrame sesion={sesion} escenario={{ id: salaAbierta.id, nombre: salaAbierta.nombre }} />
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Salas de simulación</h2>
      <p className="muted">
        Cada sala es una copia del mapa (foto del estado real al momento de crearla) donde podés proponer
        acomodos alternativos libremente — nada de lo que hagas acá afecta el mapa real.
      </p>

      <form onSubmit={handleCrear} className="filtros-bar" style={{ marginTop: 16 }}>
        <input
          placeholder="Nombre de la sala (ej. Propuesta reorganización julio)"
          value={nombreNuevo}
          onChange={e => setNombreNuevo(e.target.value)}
          style={{ minWidth: 320 }}
        />
        <button className="btn-primary" disabled={creando || !nombreNuevo.trim()}>
          <i className="ti ti-plus" /> {creando ? 'Creando…' : 'Nueva sala'}
        </button>
      </form>

      <table className="tabla" style={{ marginTop: 20 }}>
        <thead>
          <tr><th>Nombre</th><th>Creada por</th><th>Fecha</th><th></th></tr>
        </thead>
        <tbody>
          {cargando && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>Cargando…</td></tr>}
          {!cargando && salas.length === 0 && (
            <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>Todavía no hay salas creadas.</td></tr>
          )}
          {salas.map(s => (
            <tr key={s.id}>
              <td>{s.nombre}</td>
              <td>{s.creado_por_nombre || '—'}</td>
              <td>{new Date(s.creado_en).toLocaleString()}</td>
              <td style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => setSalaAbierta(s)}>Abrir</button>
                <button onClick={() => handleEliminar(s)} title="Borrar sala">
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
