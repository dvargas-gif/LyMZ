import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from './auth.service.js';
import { auditService } from '../audit/audit.service.js';
import { ACCIONES, ESTADOS } from '../audit/audit.schema.js';
import { useAuth } from './AuthContext.jsx';

export default function Login() {
  const [usuario, setUsuario] = useState('');
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
      const sesion = await authService.login(usuario, password);
      await auditService.registrar({
        usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
        accion: ACCIONES.LOGIN, estado: ESTADOS.CORRECTO,
      });
      login(sesion);
      navigate('/', { replace: true });
    } catch (err) {
      await auditService.registrar({
        usuarioId: null, usuarioNombre: usuario, ip: 'no-disponible-en-cliente',
        accion: ACCIONES.LOGIN_FALLIDO, estado: ESTADOS.CANCELADO, observaciones: err.message,
      });
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-card__brand">
          <i className="ti ti-building-warehouse" />
          <h1>WMS · Slotting Mezanine</h1>
        </div>
        <label>Usuario
          <input value={usuario} onChange={e => setUsuario(e.target.value)} autoFocus required />
        </label>
        <label>Contraseña
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <div className="login-card__error">{error}</div>}
        <button type="submit" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>
        <div className="login-card__demo">
          <p>Usuarios demo (modo desarrollo):</p>
          <ul>
            <li><code>admin / admin123</code> — Administrador</li>
            <li><code>supervisor / super123</code> — Supervisor</li>
            <li><code>operador / oper123</code> — Operador</li>
            <li><code>lectura / lect123</code> — Solo lectura</li>
          </ul>
        </div>
      </form>
    </div>
  );
}
