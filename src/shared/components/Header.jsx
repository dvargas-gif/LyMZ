import { useNavigate } from 'react-router-dom';
import { authService } from '../../features/auth/auth.service.js';

/**
 * El usuario autenticado permanece visible en el encabezado (requisito).
 * El logo vive en el Sidebar, no acá (bugfix -- ver Sidebar.jsx).
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
