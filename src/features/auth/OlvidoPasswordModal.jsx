import { useState } from 'react';
import { authService } from './auth.service.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

/**
 * "¿Olvidaste tu contraseña?" (Login.jsx) -- pide el correo y dispara el
 * link de recuperación (ver authService.pedirReseteoPassword). El mensaje
 * de éxito es el mismo exista o no la cuenta -- Supabase no filtra esa
 * información en la respuesta, y tampoco tiene sentido que esta pantalla
 * la filtre por su cuenta.
 */
export default function OlvidoPasswordModal({ onCerrar }) {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  async function confirmar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await authService.pedirReseteoPassword(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(err.message || 'No se pudo enviar el correo. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ModalBase titulo="Recuperar contraseña" onCerrar={onCerrar} maxWidth={400}>
      {enviado ? (
        <>
          <p style={{ fontSize: 13.5, color: 'var(--ink-oscuro)' }}>
            Si <b>{email}</b> tiene una cuenta, te llega un correo con un link para elegir una contraseña nueva.
          </p>
          <button type="button" className="btn-secondary" style={{ marginTop: 18 }} onClick={onCerrar}>Cerrar</button>
        </>
      ) : (
        <form onSubmit={confirmar}>
          <p style={{ fontSize: 12.5, color: 'var(--texto-tenue)', marginBottom: 14 }}>
            Escribí el correo con el que iniciás sesión -- te mandamos un link para elegir una contraseña nueva.
          </p>
          <label style={labelStyle}>Correo</label>
          <input
            type="email" autoFocus required
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="tu.correo@ologistics.com"
            style={inputStyle}
          />
          {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="submit" className="btn-success" disabled={enviando || !email.trim()}>
              {enviando ? 'Enviando…' : 'Enviar link'}
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
