// Matriz de permisos por rol. Toda la UI consulta esta única fuente de verdad.
export const ROLES = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  OPERADOR: 'Operador',
  LECTURA: 'Solo lectura',
};

const PERMISOS = {
  // Solo Admin y Supervisor pueden alterar el mapa REAL y usar las salas de
  // simulación. Operador quedó como solo-lectura del mapa real (puede
  // proponer ideas únicamente si alguien lo suma a una sala, ese acceso no
  // depende de este permiso general).
  // 'eliminar_articulos' queda SOLO para Administrador (ni Supervisor) -- a
  // diferencia de mover/usar_salas, esto saca artículos del mapa real de
  // forma difícil de revertir a mano, no es una acción de uso diario.
  // 'migrar_slot' (F2, migración RCL->MZ): Operador SÍ lo tiene -- a
  // diferencia de 'mover' (que Operador no tiene, solo lectura del mapa
  // real), acá es explícitamente su trabajo (pasos 1-3 del flujo guiado:
  // iniciar/vaciar/recolectar/bloquear). 'confirmar_migracion' (paso 4)
  // queda SOLO para Supervisor/Administrador -- mismo corte que ya refuerza
  // el trigger de base `migracion_slots_forzar_confirmacion_rol`.
  // Módulo de Despacho (sesión 2026-07-21): 'generar_despacho' y
  // 'confirmar_tarea_despacho' siguen el mismo corte que 'migrar_slot' --
  // el "cabecilla de equipo" que genera la hoja de trabajo y confirma tarea
  // por tarea puede ser un Operador. 'cerrar_lote_despacho' (el paso de
  // auditoría final) queda SOLO para Supervisor/Administrador -- mismo
  // criterio que 'confirmar_migracion'.
  // 'usar_mensajes' (2026-07-22): mensajería directa + presencia -- pedido
  // explícito para "evitar atrasos por comunicación", aplica a los 4 roles
  // por igual (a diferencia del resto de los permisos, esto no depende de
  // qué tan operativo sea el rol).
  // 'cargar_datos' (2026-07-23): "Cargas e importaciones" -- fusión de lo
  // que antes eran dos entradas separadas del sidebar (Importar datos de
  // migración + Carga masiva de posiciones), ambas ya restringidas a
  // Admin/Supervisor. Antes esa restricción vivía SOLO en Sidebar.jsx
  // (`mostrarAcciones`, hardcodeado); ahora es un permiso real, así que
  // también entra a la matriz editable de "Permisos por rol".
  [ROLES.ADMIN]:      ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'administrar_usuarios', 'exportar', 'eliminar_articulos', 'migrar_slot', 'confirmar_migracion', 'generar_despacho', 'confirmar_tarea_despacho', 'cerrar_lote_despacho', 'usar_mensajes', 'cargar_datos'],
  [ROLES.SUPERVISOR]: ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'exportar', 'migrar_slot', 'confirmar_migracion', 'generar_despacho', 'confirmar_tarea_despacho', 'cerrar_lote_despacho', 'usar_mensajes', 'cargar_datos'],
  [ROLES.OPERADOR]:   ['ver_mapa', 'migrar_slot', 'generar_despacho', 'confirmar_tarea_despacho', 'usar_mensajes'],
  [ROLES.LECTURA]:    ['ver_mapa', 'ver_dashboard', 'ver_historial', 'usar_mensajes'],
};

// Etiqueta legible por acción, para la matriz editable de "Permisos por
// rol" (Configuración -> Usuarios, 2026-07-23) -- roles.js sigue siendo la
// ÚNICA fuente de verdad de QUÉ ACCIONES EXISTEN. La tabla permisos_rol
// (Supabase) solo guarda el sí/no editable de cada una, ver
// establecerPermisosPersonalizados más abajo.
export const ETIQUETAS_ACCIONES = {
  ver_mapa: 'Ver el mapa',
  mover: 'Mover artículos en el mapa real',
  usar_salas: 'Usar salas de simulación',
  ver_dashboard: 'Ver el dashboard analítico',
  ver_historial: 'Ver historial de movimientos',
  ver_auditoria: 'Ver KPIs de seguridad (intentos de login)',
  administrar_usuarios: 'Administrar usuarios y permisos',
  exportar: 'Exportar reportes a Excel',
  eliminar_articulos: 'Eliminar artículos del mapa real',
  migrar_slot: 'Migración RCL→MZ: iniciar/vaciar/recolectar/bloquear',
  confirmar_migracion: 'Migración RCL→MZ: confirmar (paso final)',
  generar_despacho: 'Órdenes de Ejecución: generar y confirmar tareas',
  confirmar_tarea_despacho: 'Órdenes de Ejecución: confirmar tarea puntual',
  cerrar_lote_despacho: 'Órdenes de Ejecución: cerrar/cancelar orden completa',
  usar_mensajes: 'Mensajería y presencia en vivo',
  cargar_datos: 'Cargas e importaciones (migración + posiciones masivas)',
};
export const TODAS_LAS_ACCIONES = Object.keys(ETIQUETAS_ACCIONES);

// Matriz activa en memoria -- arranca siendo PERMISOS (el default de
// fábrica) y se puede reemplazar UNA vez cargada la tabla permisos_rol
// (ver AuthContext.jsx). `puede()` sigue siendo síncrona a propósito: se
// llama desde decenas de lugares sin await, así que la carga en vivo no
// puede volverse una promesa acá -- antes de que la tabla cargue (o si el
// SQL todavía no se aplicó), esta función sigue devolviendo EXACTAMENTE lo
// mismo que devolvía antes de que este mecanismo existiera.
let permisosActivos = PERMISOS;

/**
 * Reemplaza la matriz activa con lo que vino de permisos_rol -- por cada
 * rol, arranca del default de PERMISOS y solo pisa las acciones que
 * figuran como fila en la tabla (una acción nueva agregada al código que
 * todavía no tiene fila en la base cae de vuelta al default, no desaparece).
 */
export function establecerPermisosPersonalizados(filas) {
  if (!filas || filas.length === 0) return;
  const porRol = {};
  for (const rol of Object.values(ROLES)) porRol[rol] = new Set(PERMISOS[rol] ?? []);
  for (const fila of filas) {
    const permitidos = porRol[fila.rol];
    if (!permitidos) continue;
    if (fila.permitido) permitidos.add(fila.accion);
    else permitidos.delete(fila.accion);
  }
  permisosActivos = Object.fromEntries(Object.entries(porRol).map(([rol, set]) => [rol, [...set]]));
}

export function puede(rol, accion) {
  return (permisosActivos[rol] || []).includes(accion);
}
