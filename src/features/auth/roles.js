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
  [ROLES.ADMIN]:      ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'administrar_usuarios', 'exportar', 'eliminar_articulos'],
  [ROLES.SUPERVISOR]: ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'exportar'],
  [ROLES.OPERADOR]:   ['ver_mapa'],
  [ROLES.LECTURA]:    ['ver_mapa', 'ver_dashboard', 'ver_historial'],
};

export function puede(rol, accion) {
  return (PERMISOS[rol] || []).includes(accion);
}
