import { lazy, Suspense, useRef, useState } from 'react';
import { puede, ROLES } from '../../features/auth/roles.js';
import { useEfectoCurvoScroll } from '../../ui/motion/useEfectoCurvoScroll.js';
import { useArrastrarParaScrollear } from '../../ui/motion/useArrastrarParaScrollear.js';
import { iniciales } from '../utils/iniciales.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import Logo from './Logo.jsx';

// Cada panel es su propio chunk, descargado recién al abrirlo.
const PanelEliminarArticulos = lazy(() => import('../../features/eliminarArticulos/PanelEliminarArticulos.jsx'));
const PanelMigracion = lazy(() => import('../../features/migracion/PanelMigracion.jsx'));
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
    ],
  },
  {
    id: 'migracion', label: 'Migración RCL→MZ', icon: 'ti-route',
    items: [
      // Fusión 2026-07-23 de "Importar datos de migración" + "Carga masiva
      // de posiciones" en una sola página con pestañas (ver
      // PanelImportMigracion.jsx) -- también dejó de ser modal. Vive en
      // esta sección (no en Configuración) -- pedido explícito 2026-07-23.
      { id: 'cargas', tipo: 'nav', icon: 'ti-cloud-upload', label: 'Cargas e importaciones', permiso: 'cargar_datos' },
      { id: 'panel-migracion', tipo: 'panel', icon: 'ti-route-2', label: 'Panel de Migración (RCL→MZ)', permiso: 'confirmar_migracion' },
      // 'nav' (no 'panel'): a diferencia del resto de esta sección, Operador
      // SÍ tiene que poder verlo (es el "cabecilla de equipo" que genera y
      // confirma el despacho) -- los 'panel' de acá arriba están limitados a
      // Admin/Supervisor por `mostrarAcciones`, sin importar el permiso.
      { id: 'ordenes-ejecucion', tipo: 'nav', icon: 'ti-clipboard-list', label: 'Órdenes de Ejecución', permiso: 'generar_despacho' },
    ],
  },
  {
    // Configuración/administración agrupadas juntas (pedido explícito
    // 2026-07-23: "que auditoría y eliminar artículos vivan dentro de
    // configuración") -- antes Auditoría y "Mantenimiento" (eliminar
    // artículos) eran sus propias secciones sueltas del sidebar.
    id: 'configuracion', label: 'Configuración', icon: 'ti-settings',
    items: [
      // 'nav' (no 'panel', desde 2026-07-23) -- pedido explícito: la
      // pantalla de usuarios dejó de ser un modal para poder mostrar la
      // matriz de permisos por rol con más aire. Gateado por su propio
      // permiso ('administrar_usuarios', SOLO Administrador) en vez de
      // depender de `mostrarAcciones` (Admin U Supervisor) como antes --
      // corrige de paso que Supervisor podía abrirlo sin tener ese permiso.
      { id: 'usuarios', tipo: 'nav', icon: 'ti-users', label: 'Usuarios y permisos', permiso: 'administrar_usuarios' },
      // 'ver_historial' (no 'ver_auditoria') a propósito -- 2026-07-22, el
      // historial de movimientos se fusionó DENTRO de AuditoriaView.jsx (ver
      // ese archivo). 'ver_historial' es superset de 'ver_auditoria' hoy
      // (todo rol con 'ver_auditoria' también tiene 'ver_historial', ver
      // roles.js) y además incluye a "Solo lectura", que antes veía el
      // historial en su propia pestaña -- adentro, AuditoriaView oculta la
      // sección de seguridad (KPIs/intentos de login) a quien no tenga
      // 'ver_auditoria', pero el historial de movimientos se ve igual.
      { id: 'auditoria', tipo: 'nav', icon: 'ti-shield-check', label: 'Auditoría', permiso: 'ver_historial' },
      { id: 'eliminar-articulos', tipo: 'panel', icon: 'ti-trash', label: 'Eliminar artículos del mapa real', permiso: 'eliminar_articulos', peligroso: true },
    ],
  },
];

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
  const [panel, setPanel] = useState(null); // null | 'eliminar-articulos' | 'panel-migracion'
  const [seccionesCerradas, setSeccionesCerradas] = useState(() => new Set());
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
            {panel === 'eliminar-articulos' && <PanelEliminarArticulos sesion={sesion} onCerrar={() => setPanel(null)} />}
            {panel === 'panel-migracion' && <PanelMigracion sesion={sesion} onCerrar={() => setPanel(null)} />}
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
