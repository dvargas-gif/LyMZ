import { lazy, Suspense, useState } from 'react';
import { puede, ROLES } from '../../features/auth/roles.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import Logo from './Logo.jsx';

// Cada panel es su propio chunk, descargado recién al abrirlo.
const UsuariosPanel = lazy(() => import('../../features/usuarios/UsuariosPanel.jsx'));
const EditarCroquisPanel = lazy(() => import('../../features/mapa/EditarCroquisPanel.jsx'));
const ReportePanel = lazy(() => import('../../features/reportes/ReportePanel.jsx'));
const PanelCargaMasiva = lazy(() => import('../../features/cargaMasiva/PanelCargaMasiva.jsx'));
const PanelEliminarArticulosReales = lazy(() => import('../../features/eliminarArticulos/PanelEliminarArticulosReales.jsx'));
// Aparte (no junto a los de arriba): trae Framer Motion, que hoy solo carga
// el Dashboard bajo demanda. El sidebar es parte del shell (siempre
// montado), así que si se importara Framer Motion acá arriba, se coalescería
// en el bundle principal en vez de en su propio chunk -- medido: +131 kB
// (+43 kB gzip) en el bundle principal si se hace mal.
const NombreSistema = lazy(() => import('./SidebarNombreSistema.jsx'));

const NAVEGACION = [
  { id: 'mapa', icon: 'ti-map-2', label: 'Mapa editable', permiso: 'ver_mapa' },
  { id: 'salas', icon: 'ti-flask', label: 'Salas de simulación', permiso: 'usar_salas' },
  { id: 'dashboard', icon: 'ti-chart-bar', label: 'Dashboard analítico', permiso: 'ver_dashboard' },
  { id: 'historial', icon: 'ti-history', label: 'Historial de movimientos', permiso: 'ver_historial' },
  { id: 'auditoria', icon: 'ti-shield-check', label: 'Auditoría', permiso: 'ver_auditoria' },
];

const ACCIONES = [
  { id: 'usuarios', icon: 'ti-users', label: 'Permisos de usuarios' },
  { id: 'reporte', icon: 'ti-table', label: 'Reporte de posiciones' },
  { id: 'carga-masiva', icon: 'ti-upload', label: 'Carga masiva de posiciones' },
  { id: 'croquis', icon: 'ti-palette', label: 'Editar croquis' },
  // Único item con `permiso` -- a diferencia del resto (visible para
  // Admin+Supervisor por `mostrarAcciones`), esto queda solo para
  // Administrador (ver roles.js: 'eliminar_articulos').
  { id: 'eliminar-articulos', icon: 'ti-trash', label: 'Eliminar artículos del mapa real', permiso: 'eliminar_articulos' },
];

/**
 * Barra lateral única: navegación (arriba, todos los roles según permiso —
 * reemplaza a <Tabs>) + herramientas administrativas (abajo, separadas por
 * una línea, solo Administrador/Supervisor — reemplaza al menú flotante).
 * Un solo lugar para moverse por la app Y para las acciones operativas, en
 * vez de tener el mismo tipo de control repartido en dos barras distintas.
 *
 * Colapsado: riel angosto, SIEMPRE reserva su espacio (ver .app-shell) —
 * ahora que acá vive la navegación primaria, no puede ser un overlay que
 * tape contenido para "casi nadie la ve total". Expandido: se superpone
 * (no vuelve a correr el layout) para no tocar el cálculo de ancho de
 * .slotting-frame en la pestaña Mapa.
 */
export default function Sidebar({ sesion, activa, onCambiar }) {
  const [expandido, setExpandido] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'usuarios' | 'croquis' | 'reporte' | 'carga-masiva' | 'eliminar-articulos'

  const navVisible = NAVEGACION.filter(n => puede(sesion.rol, n.permiso));
  const mostrarAcciones = sesion.rol === ROLES.ADMIN || sesion.rol === ROLES.SUPERVISOR;
  const accionesVisibles = ACCIONES.filter(a => !a.permiso || puede(sesion.rol, a.permiso));

  function irA(id) {
    onCambiar(id);
    setExpandido(false);
  }

  function abrirPanel(id) {
    setPanel(id);
    setExpandido(false);
  }

  return (
    <>
      {expandido && <div className="sidebar__scrim" onClick={() => setExpandido(false)} />}

      <nav className={`sidebar ${expandido ? 'sidebar--expandido' : ''}`} aria-label="Navegación y herramientas">
        {/*
          El logo es el disparador PRINCIPAL de expandir/contraer -- mismo
          estado que el botón ☰ de abajo (que se mantiene como respaldo de
          accesibilidad, no se duplica ningún estado). Logo.jsx NO se toca:
          se usa en Header.jsx/Login.jsx/App.jsx también, así que el botón
          envuelve al logo acá adentro, acotado al Sidebar.
        */}
        <button
          className="sidebar__logo sidebar__logo--boton"
          onClick={() => setExpandido(v => !v)}
          aria-label={expandido ? 'Contraer menú' : 'Expandir menú'}
          title={expandido ? 'Contraer menú' : 'Expandir menú'}
        >
          <Logo size={24} />
          <Suspense fallback={null}>
            <NombreSistema visible={expandido} />
          </Suspense>
        </button>

        <button
          className="sidebar__toggle"
          onClick={() => setExpandido(v => !v)}
          title={expandido ? 'Contraer' : 'Expandir menú'}
        >
          <i className={`ti ${expandido ? 'ti-x' : 'ti-menu-2'}`} />
        </button>

        {navVisible.map(n => (
          <button
            key={n.id}
            className={`sidebar__item ${activa === n.id ? 'sidebar__item--activo' : ''}`}
            onClick={() => irA(n.id)}
            title={n.label}
          >
            <i className={`ti ${n.icon}`} />
            {expandido && <span>{n.label}</span>}
          </button>
        ))}

        {mostrarAcciones && (
          <>
            <div className="sidebar__separador" />
            {accionesVisibles.map(a => (
              <button
                key={a.id}
                className={`sidebar__item ${panel === a.id ? 'sidebar__item--activo' : ''}`}
                onClick={() => abrirPanel(a.id)}
                title={a.label}
              >
                <i className={`ti ${a.icon}`} />
                {expandido && <span>{a.label}</span>}
              </button>
            ))}
          </>
        )}
      </nav>

      {mostrarAcciones && (
        <ErrorBoundary mensaje="No se pudo cargar este panel.">
          <Suspense fallback={null}>
            {panel === 'usuarios' && <UsuariosPanel sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'croquis' && <EditarCroquisPanel sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'reporte' && <ReportePanel onCerrar={() => setPanel(null)} />}
            {panel === 'carga-masiva' && <PanelCargaMasiva sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'eliminar-articulos' && <PanelEliminarArticulosReales sesion={sesion} onCerrar={() => setPanel(null)} />}
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
