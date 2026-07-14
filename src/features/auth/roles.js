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
  [ROLES.ADMIN]:      ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'administrar_usuarios', 'exportar', 'eliminar_articulos', 'migrar_slot', 'confirmar_migracion'],
  [ROLES.SUPERVISOR]: ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'exportar', 'migrar_slot', 'confirmar_migracion'],
  [ROLES.OPERADOR]:   ['ver_mapa', 'migrar_slot'],
  [ROLES.LECTURA]:    ['ver_mapa', 'ver_dashboard', 'ver_historial'],
};

export function puede(rol, accion) {
  return (PERMISOS[rol] || []).includes(accion);
}
