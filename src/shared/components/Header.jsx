import { useNavigate } from 'react-router-dom';
import { authService } from '../../features/auth/auth.service.js';
import { useTema } from '../theme.js';

/**
 * El usuario autenticado permanece visible en el encabezado (requisito).
 * El nombre del sistema y el logo viven en el Sidebar, no acá (bugfix --
 * ver Sidebar.jsx). El div vacío se mantiene como spacer: `.app-header`
 * usa `justify-content: space-between` entre dos hijos, así que sin él
 * `.app-header__user` saltaría a la izquierda en vez de quedar a la derecha.
 *
 * Toggle de modo oscuro (2026-07-22) -- reemplaza al selector de tema
 * muerto de EditarCroquisPanel.jsx, ver theme.js.
 */
export default function Header({ sesion, onLogout }) {
  const navigate = useNavigate();
  const [tema, alternarTema] = useTema();

  async function handleLogout() {
    await authService.logout();
    onLogout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="app-header">
      <div className="app-header__brand" />
      <div className="app-header__user">
        <button className="btn-logout" onClick={alternarTema} title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
          <i className={`ti ${tema === 'oscuro' ? 'ti-sun' : 'ti-moon'}`} />
        </button>
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
