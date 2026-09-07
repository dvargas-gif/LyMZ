import { useState } from 'react';
import { authService } from '../auth/auth.service.js';
import { auditService } from '../auditoria/audit.service.js';
import { ACCIONES } from '../auditoria/audit.schema.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

/**
 * Un usuario ya logueado cambia su PROPIA contraseña desde Usuarios y
 * permisos (antes solo se podía vía "Olvidaste tu contraseña" del Login,
 * que depende del correo). Usa authService.cambiarPassword() -- ya existía,
 * pensado para esto, pero hasta ahora no estaba conectado a ninguna
 * pantalla. `updateUser` de Supabase alcanza con la sesión actual, no hace
 * falta reingresar la contraseña vieja. Sin restricción de complejidad
 * (mismo criterio que el resto de los flujos de contraseña de este proyecto).
 */
export default function CambiarMiPasswordModal({ sesion, onCerrar }) {
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!password) { setError('Escribí una contraseña.'); return; }
    if (password !== confirmar) { setError('Las dos contraseñas no coinciden.'); return; }
    setGuardando(true);
    try {
      await authService.cambiarPassword(password);
      await auditService.registrar({
        usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
        accion: ACCIONES.CAMBIO_PASSWORD,
        observaciones: 'Cambio de contraseña propia',
      });
      setExito(true);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalBase titulo="Cambiar mi contraseña" onCerrar={onCerrar} maxWidth={400}>
      {exito ? (
        <>
          <p style={{ fontSize: 13.5, color: 'var(--ink-oscuro)' }}>✓ Contraseña actualizada.</p>
          <button type="button" className="btn-secondary" style={{ marginTop: 18 }} onClick={onCerrar}>Cerrar</button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Contraseña nueva</label>
          <input
            type="password" autoFocus required
            value={password} onChange={e => setPassword(e.target.value)}
            style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 12 }}>Confirmar contraseña</label>
          <input
            type="password" required
            value={confirmar} onChange={e => setConfirmar(e.target.value)}
            style={inputStyle}
          />
          {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="submit" className="btn-success" disabled={guardando || !password}>
              {guardando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
            <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
          </div>
        </form>
      )}
    </ModalBase>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--ink-oscuro)', display: 'block', marginBottom: 6 };
const inputStyle = { fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--borde-input)', fontFamily: 'inherit', width: '100%' };
