import { useEffect, useRef, useState } from 'react';
import { escenariosService } from '../services/escenarios.service.js';
import SlottingFrame from '../components/SlottingFrame.jsx';
import ReportePanel from '../admin/ReportePanel.jsx';
import PanelCargaPicks from './PanelCargaPicks.jsx';

/**
 * Lista de salas de simulación + la sala abierta (si hay una seleccionada).
 * Cada sala reutiliza SlottingFrame en modo "escenario": mismo mapa, mismo
 * comportamiento, pero todo lo que se guarda queda aislado en las tablas
 * `escenario_*` — nunca toca el mapa real.
 *
 * La barra de acciones (Atrás/Bloqueo/Limpiar área/Volver al acomodo
 * base/Guardar) vive acá, no dentro del iframe: Bloqueo y Limpiar área se
 * disparan como comandos remotos (ver SlottingFrame) hacia funciones que YA
 * existen en el mapa legacy — no se reimplementa esa lógica.
 */
export default function SalasView({ sesion }) {
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [salaAbierta, setSalaAbierta] = useState(null);
  const [cambiosPendientes, setCambiosPendientes] = useState(0);
  const [seleccionCantidad, setSeleccionCantidad] = useState(0);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(null); // null | 'reporte' | 'picks'
  const frameRef = useRef(null);

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
      abrirSala(nueva);
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

  function abrirSala(sala) {
    setSalaAbierta(sala);
    setCambiosPendientes(0);
    setSeleccionCantidad(0);
    setModoSeleccion(false);
    setPanelAbierto(null);
  }

  function handleAtras() {
    if (cambiosPendientes > 0) {
      const ok = confirm(`Tenés ${cambiosPendientes} cambio(s) desde el último "Guardar simulación" (ya quedaron guardados automáticamente, pero no confirmaste el checkpoint). ¿Salir igual?`);
      if (!ok) return;
    }
    setSalaAbierta(null);
    cargar(); // refresca "última actualización" en la lista
  }

  function handleBloqueo() {
    frameRef.current?.activarModoBloqueo();
  }

  function handleSeleccionArea() {
    frameRef.current?.activarModoSeleccion();
    setModoSeleccion(v => !v);
  }

  function handleLimpiarArea() {
    frameRef.current?.limpiarSeleccion();
  }

  async function handleVolverBase() {
    if (!confirm('¿Restaurar esta sala desde el acomodo base actual? Se perderán todos los cambios propios de esta sala (movimientos, bloqueos y artículos limpiados).')) return;
    setRestaurando(true);
    try {
      await escenariosService.restaurarDesdeBase({ escenarioId: salaAbierta.id, usuarioId: sesion.usuarioId });
      frameRef.current?.recargar();
      setCambiosPendientes(0);
      setSeleccionCantidad(0);
      await cargar();
    } finally {
      setRestaurando(false);
    }
  }

  async function handleGuardar() {
    await escenariosService.tocar(salaAbierta.id);
    setCambiosPendientes(0);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
    await cargar();
  }

  if (salaAbierta) {
    return (
      <div className="panel" style={{ borderTop: '3px solid #E07B39' }}>
        <div className="panel__header">
          <h2>🧪 {salaAbierta.nombre}</h2>
        </div>

        <div style={barraStyle}>
          <button onClick={handleAtras}><i className="ti ti-arrow-left" /> Atrás</button>
          <button onClick={handleBloqueo} title="Activa/desactiva el modo bloqueo del mapa (solo afecta esta sala)">
            <i className="ti ti-lock" /> Bloqueo
          </button>
          <button onClick={handleSeleccionArea} className={modoSeleccion ? 'btn-primary' : ''} title="Tocá posiciones en el mapa para armar el área a limpiar">
            <i className="ti ti-square-dot" /> {modoSeleccion ? 'Seleccionando…' : 'Seleccionar área'}
          </button>
          <button onClick={handleLimpiarArea} disabled={modoSeleccion && seleccionCantidad === 0} title="Vacía las posiciones seleccionadas (solo en esta sala)">
            <i className="ti ti-eraser" /> Limpiar área {seleccionCantidad > 0 ? `(${seleccionCantidad})` : ''}
          </button>
          <button onClick={handleVolverBase} disabled={restaurando}>
            <i className="ti ti-refresh" /> {restaurando ? 'Restaurando…' : 'Volver al acomodo base'}
          </button>
          <button onClick={handleGuardar} className="btn-primary">
            <i className="ti ti-device-floppy" /> {guardadoOk ? 'Guardado ✓' : 'Guardar simulación'}
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={() => setPanelAbierto('picks')}><i className="ti ti-chart-histogram" /> Cargar picks</button>
          <button onClick={() => setPanelAbierto('reporte')}><i className="ti ti-table" /> Ver reporte</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
          Todo lo que hagas en esta sala se guarda solo, al instante, y nunca afecta el mapa real.
          {cambiosPendientes > 0 && ` · ${cambiosPendientes} cambio(s) desde el último checkpoint.`}
        </p>

        <SlottingFrame
          ref={frameRef}
          sesion={sesion}
          escenario={{ id: salaAbierta.id, nombre: salaAbierta.nombre }}
          onCambio={() => setCambiosPendientes(n => n + 1)}
          onSeleccionCambia={setSeleccionCantidad}
        />

        {panelAbierto === 'reporte' && <ReportePanel escenario={salaAbierta} onCerrar={() => setPanelAbierto(null)} />}
        {panelAbierto === 'picks' && <PanelCargaPicks escenario={salaAbierta} sesion={sesion} onCerrar={() => setPanelAbierto(null)} />}
      </div>
    );
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
          placeholder="Nombre de la sala (ej. Propuesta reorganización julio)"
          value={nombreNuevo}
          onChange={e => setNombreNuevo(e.target.value)}
          style={{ minWidth: 320 }}
        />
        <button className="btn-primary" disabled={creando || !nombreNuevo.trim()}>
          <i className="ti ti-plus" /> {creando ? 'Creando…' : 'Nueva sala de simulación'}
        </button>
      </form>

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
                <button className="btn-primary" onClick={() => abrirSala(s)}>Abrir</button>
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

const barraStyle = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '10px 0 6px' };
