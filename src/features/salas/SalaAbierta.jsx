import { useRef, useState } from 'react';
import SlottingFrame from '../mapa/SlottingFrame.jsx';
import ReportePanel from '../reportes/ReportePanel.jsx';
import PanelCargaPicks from './PanelCargaPicks.jsx';
import { escenariosService } from './escenarios.service.js';

/**
 * Barra de acciones + mapa (modo sala) + paneles de reporte/picks de UNA
 * sala ya abierta. No comparte nada de estado con la lista (SalasView):
 * todo lo de acá (cambios pendientes, selección, panel abierto) nace y
 * muere con este componente — al volver atrás se desmonta entero, así que
 * la próxima sala que se abra arranca siempre desde cero sin necesidad de
 * resetear nada a mano (antes lo hacía abrirSala() en SalasView).
 */
export default function SalaAbierta({ sala, sesion, onAtras }) {
  const [cambiosPendientes, setCambiosPendientes] = useState(0);
  const [seleccionCantidad, setSeleccionCantidad] = useState(0);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(null); // null | 'reporte' | 'picks'
  const frameRef = useRef(null);

  function handleAtras() {
    if (cambiosPendientes > 0) {
      const ok = confirm(`Tenés ${cambiosPendientes} cambio(s) desde el último "Guardar simulación" (ya quedaron guardados automáticamente, pero no confirmaste el checkpoint). ¿Salir igual?`);
      if (!ok) return;
    }
    onAtras();
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
      await escenariosService.restaurarDesdeBase({ escenarioId: sala.id, usuarioId: sesion.usuarioId });
      frameRef.current?.recargar();
      setCambiosPendientes(0);
      setSeleccionCantidad(0);
    } finally {
      setRestaurando(false);
    }
  }

  async function handleGuardar() {
    try {
      await escenariosService.tocar(sala.id);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
    } catch (err) {
      console.error(err);
      alert('No se pudo marcar el checkpoint de guardado (probablemente falta correr supabase/sql/2026-07-02_salas_simulacion_avanzado.sql en Supabase). Tus cambios ya están guardados igual, esto solo afecta el sello de "última actualización".');
    } finally {
      setCambiosPendientes(0);
    }
  }

  return (
    <div className="panel" style={{ borderTop: '3px solid #E07B39' }}>
      <div className="panel__header">
        <h2>🧪 {sala.nombre}</h2>
      </div>

      <div style={barraStyle}>
        <button className="btn-secondary" onClick={handleAtras}><i className="ti ti-arrow-left" /> Atrás</button>
        <button className="btn-secondary" onClick={handleBloqueo} title="Activa/desactiva el modo bloqueo del mapa (solo afecta esta sala)">
          <i className="ti ti-lock" /> Bloqueo
        </button>
        <button className={`btn-secondary ${modoSeleccion ? 'activo' : ''}`} onClick={handleSeleccionArea} title="Tocá posiciones en el mapa para armar el área a limpiar">
          <i className="ti ti-square-dot" /> {modoSeleccion ? 'Seleccionando…' : 'Seleccionar área'}
        </button>
        <button className="btn-secondary" onClick={handleLimpiarArea} disabled={modoSeleccion && seleccionCantidad === 0} title="Vacía las posiciones seleccionadas (solo en esta sala)">
          <i className="ti ti-eraser" /> Limpiar área {seleccionCantidad > 0 ? `(${seleccionCantidad})` : ''}
        </button>
        <button className="btn-secondary" onClick={handleVolverBase} disabled={restaurando}>
          <i className="ti ti-refresh" /> {restaurando ? 'Restaurando…' : 'Volver al acomodo base'}
        </button>
        <button className="btn-primary" onClick={handleGuardar}>
          <i className="ti ti-device-floppy" /> {guardadoOk ? 'Guardado ✓' : 'Guardar simulación'}
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn-secondary" onClick={() => setPanelAbierto('picks')}><i className="ti ti-chart-histogram" /> Cargar picks</button>
        <button className="btn-secondary" onClick={() => setPanelAbierto('reporte')}><i className="ti ti-table" /> Ver reporte</button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
        Todo lo que hagas en esta sala se guarda solo, al instante, y nunca afecta el mapa real.
        {cambiosPendientes > 0 && ` · ${cambiosPendientes} cambio(s) desde el último checkpoint.`}
      </p>

      <SlottingFrame
        ref={frameRef}
        sesion={sesion}
        escenario={{ id: sala.id, nombre: sala.nombre }}
        onCambio={() => setCambiosPendientes(n => n + 1)}
        onSeleccionCambia={setSeleccionCantidad}
      />

      {panelAbierto === 'reporte' && <ReportePanel escenario={sala} onCerrar={() => setPanelAbierto(null)} />}
      {panelAbierto === 'picks' && <PanelCargaPicks escenario={sala} sesion={sesion} onCerrar={() => setPanelAbierto(null)} />}
    </div>
  );
}

const barraStyle = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '10px 0 6px' };
