import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from './auth.service.js';
import { useAuth } from './AuthContext.jsx';
import Logo from '../components/Logo.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const sesion = await authService.login(email, password);
      login(sesion);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setCargandoGoogle(true);
    try {
      await authService.loginConGoogle(); // redirige a Google; la vuelta la maneja AuthContext solo
    } catch (err) {
      setError(err.message);
      setCargandoGoogle(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-card__brand">
          <Logo size={34} />
          <h1>WMS · Slotting Mezanine</h1>
        </div>
        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
        </label>
        <label>Contraseña
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <div className="login-card__error">{error}</div>}
        <button type="submit" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0', color: '#9CA3AF', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: '#EAECEF' }} />
          o
          <div style={{ flex: 1, height: 1, background: '#EAECEF' }} />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={cargandoGoogle}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: '#fff', color: '#1A1D23', border: '1px solid #DADCE0',
            borderRadius: 8, padding: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          {cargandoGoogle ? 'Redirigiendo…' : 'Continuar con Google'}
        </button>
      </form>
    </div>
  );
}
