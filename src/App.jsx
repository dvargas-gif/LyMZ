import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext.jsx';
import Login from './features/auth/Login.jsx';
import ProtectedRoute from './features/auth/ProtectedRoute.jsx';
import Header from './shared/components/Header.jsx';
import Tabs from './shared/components/Tabs.jsx';
import SlottingFrame from './features/mapa/SlottingFrame.jsx';
import DashboardAnalitico from './features/dashboard/DashboardAnalitico.jsx';
import Historial from './features/historial/Historial.jsx';
import AuditoriaView from './features/auditoria/AuditoriaView.jsx';
import SalasView from './features/salas/SalasView.jsx';
import AdminFab from './shared/components/AdminFab.jsx';
import BienvenidaModal from './shared/components/BienvenidaModal.jsx';
import SaludoToast from './shared/components/SaludoToast.jsx';
import AddRackModal from './features/mapa/AddRackModal.jsx';
import { ROLES } from './features/auth/roles.js';

// Panel de administración (botón flotante) y saludo personalizado: exclusivo
// de Administrador y Supervisor — el resto de los roles no lo ve ni lo usa.
const ROLES_PANEL_ADMIN = [ROLES.ADMIN, ROLES.SUPERVISOR];

function Shell() {
  const { sesion, logout } = useAuth();
  const [tab, setTab] = useState('mapa');
  const [apodo, setApodo] = useState(sesion.apodo);
  const [pedirApodo, setPedirApodo] = useState(false);
  const [mostrarSaludo, setMostrarSaludo] = useState(false);
  const [mostrarAddRack, setMostrarAddRack] = useState(false);

  useEffect(() => {
    if (!ROLES_PANEL_ADMIN.includes(sesion.rol)) return;
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
        {tab === 'mapa' && <SlottingFrame sesion={sesion} onSolicitarAddRack={() => setMostrarAddRack(true)} />}
        {tab === 'salas' && <SalasView sesion={sesion} />}
        {tab === 'dashboard' && <DashboardAnalitico />}
        {tab === 'historial' && <Historial sesion={sesion} />}
        {tab === 'auditoria' && <AuditoriaView />}
      </main>
      {ROLES_PANEL_ADMIN.includes(sesion.rol) && <AdminFab sesion={sesion} onNavigate={setTab} />}
      {pedirApodo && <BienvenidaModal nombre={sesion.nombre} onListo={handleApodoListo} />}
      {mostrarSaludo && <SaludoToast apodo={apodo} onCerrar={() => setMostrarSaludo(false)} />}
      {mostrarAddRack && <AddRackModal sesion={sesion} onCerrar={() => setMostrarAddRack(false)} />}
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
