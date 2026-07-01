import { useNavigate } from 'react-router-dom';
import { authService } from '../auth/auth.service.js';
import Logo from './Logo.jsx';

/**
 * El usuario autenticado permanece visible en el encabezado (requisito).
 */
export default function Header({ sesion, onLogout }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await authService.logout();
    onLogout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="app-header">
      <div className="app-header__brand">
        <Logo size={24} />
        <span>WMS · Slotting Mezanine</span>
      </div>
      <div className="app-header__user">
        <div className="app-header__user-info">
          <span className="app-header__nombre">{sesion.nombre}</span>
          <span className="app-header__rol">{sesion.rol}</span>
        </div>
        <button className="btn-logout" onClick={handleLogout} title="Cerrar sesión">
          <i className="ti ti-logout" />
        </button>
      </div>
    </header>
  );
}
