import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../shared/services/supabaseClient.js';
import { authService } from './auth.service.js';
import Logo from '../../shared/components/Logo.jsx';

/**
 * Destino del link de "Olvidaste tu contraseña" (ver
 * authService.pedirReseteoPassword / OlvidoPasswordModal.jsx). Ruta pública
 * (no pasa por ProtectedRoute, ver App.jsx) -- el link de recuperación de
 * Supabase ya deja una sesión temporal activa apenas se carga esta página
 * (el cliente procesa el token de la URL solo, ver supabaseClient.js), así
 * que alcanza con chequear `getSession()` en vez de escuchar el evento
 * `PASSWORD_RECOVERY` -- ese evento puede dispararse ANTES de que este
 * componente llegue a montarse (AuthContext ya está escuchando desde el
 * arranque de la app, ver main.jsx), así que engancharse a él acá es una
 * carrera que a veces se pierde.
 *
 * Sin restricción de complejidad sobre la contraseña nueva (pedido
 * explícito) -- solo se exige que no esté vacía y que las dos veces
 * coincidan, para evitar un typo silencioso.
 */
export default function RestablecerPassword() {
  const navigate = useNavigate();
  const [verificando, setVerificando] = useState(true);
  const [linkValido, setLinkValido] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLinkValido(!!session);
      setVerificando(false);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!password) { setError('Escribí una contraseña.'); return; }
    if (password !== confirmar) { setError('Las dos contraseñas no coinciden.'); return; }
    setGuardando(true);
    try {
      await authService.cambiarPassword(password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo guardar la contraseña nueva.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card__brand">
            <Logo size={30} />
            <div>
              <h1>WMS · Plataforma Logística</h1>
              <span className="login-card__eyebrow">Elegí tu contraseña nueva</span>
            </div>
          </div>

          {verificando ? (
            <p className="muted">Verificando el link…</p>
          ) : !linkValido ? (
            <>
              <p className="login-card__error"><i className="ti ti-alert-circle" /> Este link no es válido o ya venció. Pedí uno nuevo desde la pantalla de inicio de sesión.</p>
              <button type="button" className="btn-secondary" onClick={() => navigate('/login', { replace: true })}>Volver al inicio de sesión</button>
            </>
          ) : (
            <>
              <label>Contraseña nueva
                <div className="login-card__campo login-card__campo--con-toggle">
                  <i className="ti ti-lock" />
                  <input type={mostrarPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoFocus required />
                  <button
                    type="button"
                    className="login-card__toggle-password"
                    onClick={() => setMostrarPassword(v => !v)}
                    aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    <i className={`ti ${mostrarPassword ? 'ti-eye-off' : 'ti-eye'}`} />
                  </button>
                </div>
              </label>
              <label>Confirmar contraseña
                <div className="login-card__campo">
                  <i className="ti ti-lock" />
                  <input type={mostrarPassword ? 'text' : 'password'} value={confirmar} onChange={e => setConfirmar(e.target.value)} required />
                </div>
              </label>

              {error && <div className="login-card__error"><i className="ti ti-alert-circle" /> {error}</div>}
              <button type="submit" className="btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar contraseña'} {!guardando && <i className="ti ti-arrow-right" />}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
