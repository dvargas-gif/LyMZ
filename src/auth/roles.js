// Matriz de permisos por rol. Toda la UI consulta esta única fuente de verdad.
export const ROLES = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  OPERADOR: 'Operador',
  LECTURA: 'Solo lectura',
};

const PERMISOS = {
  [ROLES.ADMIN]:      ['ver_mapa', 'mover', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'administrar_usuarios', 'exportar'],
  [ROLES.SUPERVISOR]: ['ver_mapa', 'mover', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'exportar'],
  [ROLES.OPERADOR]:   ['ver_mapa', 'mover'],
  [ROLES.LECTURA]:    ['ver_mapa', 'ver_dashboard', 'ver_historial'],
};

export function puede(rol, accion) {
  return (PERMISOS[rol] || []).includes(accion);
}

export function accionesDe(rol) {
  return PERMISOS[rol] || [];
}
