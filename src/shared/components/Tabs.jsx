import { puede } from '../../features/auth/roles.js';

const TODAS_LAS_TABS = [
  { id: 'mapa', label: 'Mapa editable', permiso: 'ver_mapa' },
  { id: 'salas', label: 'Salas de simulación', permiso: 'usar_salas' },
  { id: 'dashboard', label: 'Dashboard analítico', permiso: 'ver_dashboard' },
  { id: 'historial', label: 'Historial de movimientos', permiso: 'ver_historial' },
  { id: 'auditoria', label: 'Auditoría', permiso: 'ver_auditoria' },
];

/** Las pestañas visibles dependen del rol — no hace falta tocar el resto de la app. */
export default function Tabs({ rol, activa, onCambiar }) {
  const visibles = TODAS_LAS_TABS.filter(t => puede(rol, t.permiso));
  return (
    <nav className="tabs">
      {visibles.map(t => (
        <button
          key={t.id}
          className={`tabs__item ${activa === t.id ? 'tabs__item--activa' : ''}`}
          onClick={() => onCambiar(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
