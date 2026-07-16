import { lazy, Suspense, useRef, useState } from 'react';
import { puede, ROLES } from '../../features/auth/roles.js';
import { useEfectoCurvoScroll } from '../../ui/motion/useEfectoCurvoScroll.js';
import { useArrastrarParaScrollear } from '../../ui/motion/useArrastrarParaScrollear.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import Logo from './Logo.jsx';

// Cada panel es su propio chunk, descargado recién al abrirlo.
const UsuariosPanel = lazy(() => import('../../features/usuarios/UsuariosPanel.jsx'));
const EditarCroquisPanel = lazy(() => import('../../features/mapa/EditarCroquisPanel.jsx'));
const ReportePanel = lazy(() => import('../../features/reportes/ReportePanel.jsx'));
const PanelCargaMasiva = lazy(() => import('../../features/cargaMasiva/PanelCargaMasiva.jsx'));
const PanelEliminarArticulosReales = lazy(() => import('../../features/eliminarArticulos/PanelEliminarArticulosReales.jsx'));
const PanelImportIdentidadLegacy = lazy(() => import('../../features/migracion/PanelImportIdentidadLegacy.jsx'));
const PanelImportInventarioRcl = lazy(() => import('../../features/migracion/PanelImportInventarioRcl.jsx'));
const PanelLimpiarAgotadosRcl = lazy(() => import('../../features/migracion/PanelLimpiarAgotadosRcl.jsx'));
const PanelGenerarMovimientos = lazy(() => import('../../features/migracion/PanelGenerarMovimientos.jsx'));
// Aparte (no junto a los de arriba): trae Framer Motion, que hoy solo carga
// el Dashboard bajo demanda. El sidebar es parte del shell (siempre
// montado), así que si se importara Framer Motion acá arriba, se coalescería
// en el bundle principal en vez de en su propio chunk -- medido: +131 kB
// (+43 kB gzip) en el bundle principal si se hace mal.
const NombreSistema = lazy(() => import('./SidebarNombreSistema.jsx'));

/**
 * Secciones por familia de acción (pedido explícito del usuario, ver
 * mockup compartido) -- cada ítem es `tipo: 'nav'` (cambia la página
 * principal, ver `activa`/`onCambiar`) o `tipo: 'panel'` (abre un modal
 * lazy, ver `panel`/`abrirPanel`). La visibilidad de cada ítem respeta
 * EXACTAMENTE las mismas reglas que antes (ver itemVisible más abajo) --
 * agrupar en secciones es solo presentación, no cambia quién ve qué.
 */
const SECCIONES = [
  {
    id: 'operacion', label: 'Operación', icon: 'ti-layout-grid',
    items: [
      { id: 'mapa', tipo: 'nav', icon: 'ti-map-2', label: 'Mapa editable', permiso: 'ver_mapa' },
      { id: 'salas', tipo: 'nav', icon: 'ti-flask', label: 'Salas de simulación', permiso: 'usar_salas' },
      { id: 'dashboard', tipo: 'nav', icon: 'ti-chart-bar', label: 'Dashboard analítico', permiso: 'ver_dashboard' },
      { id: 'historial', tipo: 'nav', icon: 'ti-history', label: 'Historial de movimientos', permiso: 'ver_historial' },
      { id: 'reporte', tipo: 'panel', icon: 'ti-table', label: 'Reporte de posiciones' },
    ],
  },
  {
    id: 'migracion', label: 'Migración RCL→MZ', icon: 'ti-route',
    items: [
      { id: 'import-identidad-legacy', tipo: 'panel', icon: 'ti-replace', label: 'Importar identidad RCL↔MZ' },
      { id: 'import-inventario-rcl', tipo: 'panel', icon: 'ti-package', label: 'Importar inventario actual (RCL)' },
      { id: 'generar-movimientos-migracion', tipo: 'panel', icon: 'ti-route-2', label: 'Generar plan de recolección (RCL→MZ)', permiso: 'confirmar_migracion' },
    ],
  },
  {
    id: 'configuracion', label: 'Configuración', icon: 'ti-settings',
    items: [
      { id: 'usuarios', tipo: 'panel', icon: 'ti-users', label: 'Permisos de usuarios' },
      { id: 'croquis', tipo: 'panel', icon: 'ti-palette', label: 'Editar croquis' },
      { id: 'carga-masiva', tipo: 'panel', icon: 'ti-upload', label: 'Carga masiva de posiciones' },
    ],
  },
  {
    id: 'auditoria', label: 'Auditoría', icon: 'ti-shield-check',
    items: [
      { id: 'auditoria', tipo: 'nav', icon: 'ti-shield-check', label: 'Auditoría', permiso: 'ver_auditoria' },
    ],
  },
  {
    // "peligroso" a nivel SECCIÓN: encabezado y chevron también en rojo --
    // pedido explícito del usuario, mismo criterio que ya tenían los ítems
    // sueltos, ahora agrupados bajo su propio rótulo "Mantenimiento".
    id: 'mantenimiento', label: 'Mantenimiento', icon: 'ti-alert-triangle', peligroso: true,
    items: [
      { id: 'eliminar-articulos', tipo: 'panel', icon: 'ti-trash', label: 'Eliminar artículos del mapa real', permiso: 'eliminar_articulos', peligroso: true },
      { id: 'limpiar-agotados-rcl', tipo: 'panel', icon: 'ti-recycle', label: 'Limpiar artículos sin stock real (RCL)', permiso: 'eliminar_articulos', peligroso: true },
    ],
  },
];

// Colapsada por defecto -- las acciones destructivas quedan un click más
// lejos que el resto ("ocultar complejidad", pedido explícito del usuario).
const SECCIONES_CERRADAS_DEFAULT = new Set(['mantenimiento']);

/** Iniciales para el avatar del pie del sidebar -- "David Vargas" -> "DV". Sin nombre (no debería pasar, pero sesion es de afuera), un placeholder neutro en vez de romper. */
function iniciales(nombre) {
  if (!nombre) return '?';
  const partes = nombre.trim().split(/\s+/);
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

// Un solo botón de ítem para ambos modos (antes había dos JSX casi
// idénticos repetidos) -- así el colapsado y el expandido nunca pueden
// desincronizarse en clases/estructura.
function ItemBoton({ item, activo, expandido, onClick }) {
  return (
    <button
      className={`sidebar__item ${activo ? 'sidebar__item--activo' : ''} ${item.peligroso ? 'sidebar__item--peligroso' : ''}`}
      onClick={onClick}
      title={item.label}
    >
      <i className={`ti ${item.icon}`} />
      {expandido && <span>{item.label}</span>}
    </button>
  );
}

/**
 * Barra lateral única: navegación (arriba, todos los roles según permiso —
 * reemplaza a <Tabs>) + herramientas administrativas (abajo, agrupadas por
 * familia — reemplaza al menú flotante). Un solo lugar para moverse por la
 * app Y para las acciones operativas, en vez de tener el mismo tipo de
 * control repartido en dos barras distintas.
 *
 * Colapsado: riel angosto, SIEMPRE reserva su espacio (ver .app-shell) —
 * ahora que acá vive la navegación primaria, no puede ser un overlay que
 * tape contenido para "casi nadie la ve total". Expandido: se superpone
 * (no vuelve a correr el layout) para no tocar el cálculo de ancho de
 * .slotting-frame en la pestaña Mapa. Colapsado, las secciones se ven
 * como una lista plana de íconos (sin encabezados clickeables) -- agrupar
 * solo tiene sentido cuando hay lugar para leer las etiquetas.
 */
export default function Sidebar({ sesion, activa, onCambiar }) {
  const [expandido, setExpandido] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'usuarios' | 'croquis' | 'reporte' | 'carga-masiva' | 'eliminar-articulos' | 'import-identidad-legacy' | 'import-inventario-rcl' | 'limpiar-agotados-rcl' | 'generar-movimientos-migracion'
  const [seccionesCerradas, setSeccionesCerradas] = useState(SECCIONES_CERRADAS_DEFAULT);
  const navRef = useRef(null);
  // 3er argumento: expandir/colapsar o abrir/cerrar una sección cambia QUÉ
  // ítems están montados sin disparar scroll/resize -- sin este disparador,
  // los ítems recién aparecidos quedaban sin curvar hasta que alguien
  // scrolleara o redimensionara a mano.
  useEfectoCurvoScroll(navRef, '.sidebar__item', `${expandido}|${[...seccionesCerradas].sort().join(',')}`); // "rueda de combinación" al scrollear -- pedido explícito del usuario
  useArrastrarParaScrollear(navRef); // click+arrastre para mover la lista -- pedido explícito del usuario

  const mostrarAcciones = sesion.rol === ROLES.ADMIN || sesion.rol === ROLES.SUPERVISOR;

  /** Misma regla de siempre: un 'nav' se filtra por su propio permiso; un 'panel' además necesita ser Admin/Supervisor (antes era el `mostrarAcciones &&` que envolvía todo el bloque de ACCIONES). */
  function itemVisible(item) {
    if (item.tipo === 'nav') return puede(sesion.rol, item.permiso);
    return mostrarAcciones && (!item.permiso || puede(sesion.rol, item.permiso));
  }

  function esActivo(item) {
    return item.tipo === 'nav' ? activa === item.id : panel === item.id;
  }

  function manejarClickItem(item) {
    if (item.tipo === 'nav') { onCambiar(item.id); setExpandido(false); }
    else { setPanel(item.id); setExpandido(false); }
  }

  function toggleSeccion(id) {
    setSeccionesCerradas(actuales => {
      const s = new Set(actuales);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  return (
    <>
      {expandido && <div className="sidebar__scrim" onClick={() => setExpandido(false)} />}

      <nav className={`sidebar ${expandido ? 'sidebar--expandido' : ''}`} aria-label="Navegación y herramientas">
        {/*
          El logo es el ÚNICO disparador de expandir/contraer -- pedido
          explícito del usuario: antes había un botón ☰ redundante al lado
          haciendo exactamente lo mismo, se sacó. Logo.jsx NO se toca: se
          usa en Header.jsx/Login.jsx/App.jsx también, así que el botón
          envuelve al logo acá adentro, acotado al Sidebar. `suave` (degradé
          + sombra, ver Logo.jsx) es el mismo tratamiento que ya usa el
          panel de Login -- acá además el fondo del botón lleva un tinte de
          acento permanente, no solo al pasar el mouse: es el ancla de
          marca, tiene que notarse incluso en reposo.
        */}
        <button
          className="sidebar__logo sidebar__logo--boton"
          onClick={() => setExpandido(v => !v)}
          aria-label={expandido ? 'Contraer menú' : 'Expandir menú'}
          title={expandido ? 'Contraer menú' : 'Expandir menú'}
        >
          <Logo size={26} suave />
          <Suspense fallback={null}>
            <NombreSistema visible={expandido} />
          </Suspense>
        </button>

        {/* Único elemento que scrollea (ver .sidebar__scroll) -- el logo
            arriba y el pie de usuario abajo quedan siempre fijos. */}
        <div ref={navRef} className="sidebar__scroll">
          {/*
            Colapsado (60px): lista PLANA, sin separadores ni encabezados por
            sección -- agrupar solo tiene sentido con las etiquetas a la
            vista. Antes cada sección dibujaba su propio separador incluso
            acá, y con 5 secciones eso eran 5 líneas apretadas en una franja
            angosta -- se veía irregular/recargado en vez de la lista limpia
            de siempre (reportado como "descuadrado"). Ahora, colapsado, es
            exactamente la misma lista continua que había antes de agrupar.
          */}
          {!expandido && SECCIONES.flatMap(seccion => seccion.items.filter(itemVisible)).map(item => (
            <ItemBoton key={item.id} item={item} activo={esActivo(item)} expandido={false} onClick={() => manejarClickItem(item)} />
          ))}

          {expandido && SECCIONES.map(seccion => {
            const itemsVisibles = seccion.items.filter(itemVisible);
            if (itemsVisibles.length === 0) return null;
            const cerrada = seccionesCerradas.has(seccion.id);
            return (
              <div key={seccion.id} className="sidebar__seccion">
                <button
                  className={`sidebar__seccion-header ${seccion.peligroso ? 'sidebar__seccion-header--peligroso' : ''}`}
                  onClick={() => toggleSeccion(seccion.id)}
                  aria-expanded={!cerrada}
                >
                  <i className={`ti ${seccion.icon}`} />
                  <span>{seccion.label}</span>
                  <i className={`ti ti-chevron-down sidebar__seccion-chevron ${cerrada ? '' : 'sidebar__seccion-chevron--abierto'}`} />
                </button>
                {!cerrada && itemsVisibles.map(item => (
                  <ItemBoton key={item.id} item={item} activo={esActivo(item)} expandido onClick={() => manejarClickItem(item)} />
                ))}
              </div>
            );
          })}
        </div>

        {/* Pie fijo: usuario logueado -- repite lo que ya muestra el
            Header (decisión tomada con el usuario: no se toca Header.jsx,
            se duplica acá para tenerlo también a mano en el sidebar). */}
        <div className="sidebar__pie" title={`${sesion.nombre} · ${sesion.rol}`}>
          <div className="sidebar__pie-avatar">{iniciales(sesion.nombre)}</div>
          {expandido && (
            <div className="sidebar__pie-texto">
              <span className="sidebar__pie-nombre">{sesion.nombre}</span>
              <span className="sidebar__pie-rol">{sesion.rol}</span>
            </div>
          )}
        </div>
      </nav>

      {mostrarAcciones && (
        <ErrorBoundary mensaje="No se pudo cargar este panel.">
          <Suspense fallback={null}>
            {panel === 'usuarios' && <UsuariosPanel sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'croquis' && <EditarCroquisPanel sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'reporte' && <ReportePanel onCerrar={() => setPanel(null)} />}
            {panel === 'carga-masiva' && <PanelCargaMasiva sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'eliminar-articulos' && <PanelEliminarArticulosReales sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'import-identidad-legacy' && <PanelImportIdentidadLegacy sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'import-inventario-rcl' && <PanelImportInventarioRcl sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'limpiar-agotados-rcl' && <PanelLimpiarAgotadosRcl sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'generar-movimientos-migracion' && <PanelGenerarMovimientos sesion={sesion} onCerrar={() => setPanel(null)} />}
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
