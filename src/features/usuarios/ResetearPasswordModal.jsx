import { useState } from 'react';
import { usuariosService } from './usuarios.service.js';
import { auditService } from '../auditoria/audit.service.js';
import { ACCIONES } from '../auditoria/audit.schema.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

/**
 * Un Administrador le pone una contraseña nueva a otro usuario, sin correo
 * (ver usuarios.service.js.resetearPassword). Misma falta de restricción de
 * complejidad que RestablecerPassword.jsx (pedido explícito) -- solo valida
 * que no esté vacía y que las dos veces coincidan.
 */
export default function ResetearPasswordModal({ usuario, sesion, onCerrar }) {
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
      await usuariosService.resetearPassword(usuario.id, password);
      await auditService.registrar({
        usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
        accion: ACCIONES.CAMBIO_PASSWORD,
        observaciones: `Reseteo manual (Administrador) de la contraseña de ${usuario.nombre} (${usuario.email})`,
      });
      setExito(true);
    } catch (err) {
      setError(err.message || 'No se pudo resetear la contraseña.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalBase titulo={`Resetear contraseña -- ${usuario.nombre}`} onCerrar={onCerrar} maxWidth={400}>
      {exito ? (
        <>
          <p style={{ fontSize: 13.5, color: 'var(--ink-oscuro)' }}>
            ✓ Contraseña actualizada. Avisale a <b>{usuario.nombre}</b> la nueva contraseña por un canal seguro.
          </p>
          <button type="button" className="btn-secondary" style={{ marginTop: 18 }} onClick={onCerrar}>Cerrar</button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <p style={{ fontSize: 12.5, color: 'var(--texto-tenue)', marginBottom: 14 }}>
            Esto reemplaza la contraseña de <b>{usuario.email}</b> al toque, sin mandarle ningún correo.
          </p>
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
              {guardando ? 'Guardando…' : 'Resetear contraseña'}
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
