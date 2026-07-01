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
      </form>
    </div>
  );
}
