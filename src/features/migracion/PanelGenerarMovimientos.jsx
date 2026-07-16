import { useState } from 'react';
import { inventarioService } from '../../shared/services/inventario.service.js';
import { inventarioRclService } from '../../shared/services/inventarioRcl.service.js';
import { migracionMovimientosService } from '../../shared/services/migracionMovimientos.service.js';
import { migracionBufferService } from '../../shared/services/migracionBuffer.service.js';
import { generarMovimientosMigracion } from './generarMovimientos.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

/**
 * F1.5-C: genera (o actualiza) el plan de recolección `migracion_movimientos`
 * cruzando `inventario_slotting` (destino MZ + origen RCL por artículo, ya
 * cargado desde el arranque del proyecto) contra `inventario_rcl_actual`
 * (cantidad real de hoy, F1.5-B) -- confirmado con el usuario: no hace
 * falta un archivo nuevo, se deriva de datos que ya existen (ver
 * generarMovimientos.js). Supervisor/Administrador únicamente (mismo
 * permiso `confirmar_migracion`, coincide con la RLS de insert de
 * migracion_movimientos). Nunca toca filas ya 'recolectado' -- eso sería
 * perder progreso real de un operador.
 */
export default function PanelGenerarMovimientos({ sesion, onCerrar }) {
  const [paso, setPaso] = useState('calcular'); // 'calcular' | 'previa' | 'resultado'
  const [previa, setPrevia] = useState(null); // {movimientos:[...], sinStock:[...]}
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function calcular() {
    setCargando(true);
    setError('');
    try {
      const [inventarioSlotting, inventarioRclActual] = await Promise.all([
        inventarioService.listar(),
        inventarioRclService.listar(),
      ]);
      setPrevia(generarMovimientosMigracion(inventarioSlotting, inventarioRclActual));
      setPaso('previa');
    } catch (err) {
      setError(`No se pudo calcular el plan: ${err.message || err}`);
    } finally {
      setCargando(false);
    }
  }

  async function confirmarAplicar() {
    if (!previa || previa.movimientos.length === 0) return;
    if (!confirm(`Vas a reemplazar el plan de recolección PENDIENTE con ${previa.movimientos.length} movimiento(s) nuevo(s). Lo que ya esté marcado "recolectado" no se toca. ¿Confirmás?`)) return;
    setAplicando(true);
    setError('');
    try {
      await migracionMovimientosService.reemplazarPendientes(previa.movimientos, sesion.usuarioId);
      // Buffer viejo (depositado antes de que existiera este plan) puede
      // ahora resolver su destino real -- si no se hace esto, esas filas
      // quedarían "Sin destino asignado" para siempre aunque el plan ya exista.
      const revinculados = await migracionBufferService.revincularConPlan();
      setResultado({ aplicados: previa.movimientos.length, sinStock: previa.sinStock.length, revinculados });
      setPaso('resultado');
    } catch (err) {
      setError(`No se pudo aplicar el plan: ${err.message || err}`);
    } finally {
      setAplicando(false);
    }
  }

  function reiniciar() {
    setPaso('calcular'); setPrevia(null); setResultado(null); setError('');
  }

  return (
    <ModalBase titulo="🧭 Generar plan de recolección (RCL → MZ)" onCerrar={onCerrar} maxWidth={900} maxHeight="88vh" scrollContenido>
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
        Cruza el plan de slotting (destino MZ + origen RCL por artículo) contra el inventario RCL más reciente para
        armar la lista de pick de cada posición MZ -- no sube ningún archivo, se calcula con lo que ya está cargado.
        Reemplaza solo el plan <b>pendiente</b>; lo ya recolectado no se toca.
      </p>

      {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

      {paso === 'calcular' && (
        <button className="btn-primary" disabled={cargando} onClick={calcular}>
          {cargando ? 'Calculando…' : 'Calcular plan de recolección'}
        </button>
      )}

      {paso === 'previa' && previa && (
        <div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 14, fontSize: 12.5 }}>
            <span>✅ Movimientos a generar: <b>{previa.movimientos.length}</b></span>
            <span style={{ color: 'var(--texto-tenue)' }}>⚠ {previa.sinStock.length} artículo(s) del plan sin stock real -- se excluyen (ver "Limpiar artículos sin stock real")</span>
          </div>

          {previa.movimientos.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--texto-tenue)' }}>No se generó ningún movimiento -- revisá que el inventario RCL esté importado.</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className="btn-primary" disabled={aplicando} onClick={confirmarAplicar}>
                {aplicando ? 'Aplicando…' : `Aplicar ${previa.movimientos.length} movimiento(s)`}
              </button>
              <button className="btn-secondary" disabled={aplicando} onClick={reiniciar}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {paso === 'resultado' && resultado && (
        <div style={{ background: 'var(--verde-tenue)', border: '1px solid var(--green)', borderRadius: 10, padding: 14 }}>
          <b style={{ color: 'var(--green)' }}>✓ Plan de recolección actualizado -- {resultado.aplicados} movimiento(s)</b>
          {resultado.sinStock > 0 && <span style={{ color: 'var(--texto-tenue)', fontSize: 12.5 }}> — {resultado.sinStock} artículo(s) quedaron afuera por no tener stock real.</span>}
          {resultado.revinculados > 0 && <p style={{ color: 'var(--texto-tenue)', fontSize: 12.5, margin: '8px 0 0' }}>{resultado.revinculados} artículo(s) que ya estaban en el buffer ahora resolvieron su destino real.</p>}
        </div>
      )}
    </ModalBase>
  );
}
