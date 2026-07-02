import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Login from './auth/Login.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import Header from './components/Header.jsx';
import Tabs from './components/Tabs.jsx';
import SlottingFrame from './components/SlottingFrame.jsx';
import DashboardAnalitico from './dashboard/DashboardAnalitico.jsx';
import Historial from './historial/Historial.jsx';
import AuditoriaView from './audit/AuditoriaView.jsx';
import SalasView from './salas/SalasView.jsx';
import AdminFab from './admin/AdminFab.jsx';
import BienvenidaModal from './components/BienvenidaModal.jsx';
import SaludoToast from './components/SaludoToast.jsx';
import { ROLES } from './auth/roles.js';

// Panel de administración exclusivo — solo esta cuenta lo ve, sin importar el rol.
const EMAIL_SUPERADMIN = 'dvargas@ologistics.com';
// El saludo personalizado (pregunta de apodo + bienvenida) es solo para
// quienes "administran" en sentido amplio: Administrador y Supervisor.
const ROLES_CON_SALUDO = [ROLES.ADMIN, ROLES.SUPERVISOR];

function Shell() {
  const { sesion, logout } = useAuth();
  const [tab, setTab] = useState('mapa');
  const [apodo, setApodo] = useState(sesion.apodo);
  const [pedirApodo, setPedirApodo] = useState(false);
  const [mostrarSaludo, setMostrarSaludo] = useState(false);

  useEffect(() => {
    if (!ROLES_CON_SALUDO.includes(sesion.rol)) return;
    if (apodo) setMostrarSaludo(true);
    else setPedirApodo(true);
    // Solo al entrar (una vez por sesión de la pestaña) — no en cada cambio de tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApodoListo(nuevoApodo) {
    setPedirApodo(false);
    if (nuevoApodo) {
      setApodo(nuevoApodo);
      setMostrarSaludo(true);
    }
  }

  return (
    <div className="app-shell">
      <Header sesion={sesion} onLogout={logout} />
      <Tabs rol={sesion.rol} activa={tab} onCambiar={setTab} />
      <main className="app-main">
        {tab === 'mapa' && <SlottingFrame sesion={sesion} />}
        {tab === 'salas' && <SalasView sesion={sesion} />}
        {tab === 'dashboard' && <DashboardAnalitico />}
        {tab === 'historial' && <Historial sesion={sesion} />}
        {tab === 'auditoria' && <AuditoriaView />}
      </main>
      {sesion.usuario === EMAIL_SUPERADMIN && <AdminFab sesion={sesion} onNavigate={setTab} />}
      {pedirApodo && <BienvenidaModal nombre={sesion.nombre} onListo={handleApodoListo} />}
      {mostrarSaludo && <SaludoToast apodo={apodo} onCerrar={() => setMostrarSaludo(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Shell /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
