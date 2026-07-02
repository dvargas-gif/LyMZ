import { useState } from 'react';
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

function Shell() {
  const { sesion, logout } = useAuth();
  const [tab, setTab] = useState('mapa');

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
