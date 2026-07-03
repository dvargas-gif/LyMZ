import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './features/auth/AuthContext.jsx';
import ProtectedRoute from './features/auth/ProtectedRoute.jsx';
import Header from './shared/components/Header.jsx';
import Sidebar from './shared/components/Sidebar.jsx';
import BienvenidaModal from './shared/components/BienvenidaModal.jsx';
import SaludoToast from './shared/components/SaludoToast.jsx';
import { ROLES } from './features/auth/roles.js';

// Code-splitting: cada uno de estos es su propio chunk, descargado recién
// cuando hace falta (login, o la tab/modal que se abre) en vez de ir todo
// en el bundle principal. Sin esto, PanelCargaMasiva/PanelCargaPicks meten
// la librería xlsx entera en el chunk principal aunque nadie haya abierto
// carga masiva todavía.
const Login = lazy(() => import('./features/auth/Login.jsx'));
const SlottingFrame = lazy(() => import('./features/mapa/SlottingFrame.jsx'));
const SalasView = lazy(() => import('./features/salas/SalasView.jsx'));
const DashboardAnalitico = lazy(() => import('./features/dashboard/DashboardAnalitico.jsx'));
const Historial = lazy(() => import('./features/historial/Historial.jsx'));
const AuditoriaView = lazy(() => import('./features/auditoria/AuditoriaView.jsx'));
const AddRackModal = lazy(() => import('./features/mapa/AddRackModal.jsx'));

// Saludo personalizado: exclusivo de Administrador y Supervisor — el resto
// de los roles no lo ve. El Sidebar (navegación + herramientas admin) es
// aparte: siempre se renderiza, y filtra sus propios ítems por permiso.
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
      <Sidebar sesion={sesion} activa={tab} onCambiar={setTab} />
      <main className="app-main">
        <Suspense fallback={<p className="muted" style={{ textAlign: 'center', padding: 40 }}>Cargando…</p>}>
          {tab === 'mapa' && <SlottingFrame sesion={sesion} onSolicitarAddRack={() => setMostrarAddRack(true)} />}
          {tab === 'salas' && <SalasView sesion={sesion} />}
          {tab === 'dashboard' && <DashboardAnalitico />}
          {tab === 'historial' && <Historial sesion={sesion} />}
          {tab === 'auditoria' && <AuditoriaView />}
        </Suspense>
      </main>
      {pedirApodo && <BienvenidaModal nombre={sesion.nombre} onListo={handleApodoListo} />}
      {mostrarSaludo && <SaludoToast apodo={apodo} onCerrar={() => setMostrarSaludo(false)} />}
      {mostrarAddRack && (
        <Suspense fallback={null}>
          <AddRackModal sesion={sesion} onCerrar={() => setMostrarAddRack(false)} />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Shell /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
