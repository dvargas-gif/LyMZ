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
  [ROLES.ADMIN]:      ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'administrar_usuarios', 'exportar', 'eliminar_articulos', 'migrar_slot', 'confirmar_migracion', 'generar_despacho', 'confirmar_tarea_despacho', 'cerrar_lote_despacho', 'usar_mensajes'],
  [ROLES.SUPERVISOR]: ['ver_mapa', 'mover', 'usar_salas', 'ver_dashboard', 'ver_historial', 'ver_auditoria', 'exportar', 'migrar_slot', 'confirmar_migracion', 'generar_despacho', 'confirmar_tarea_despacho', 'cerrar_lote_despacho', 'usar_mensajes'],
  [ROLES.OPERADOR]:   ['ver_mapa', 'migrar_slot', 'generar_despacho', 'confirmar_tarea_despacho', 'usar_mensajes'],
  [ROLES.LECTURA]:    ['ver_mapa', 'ver_dashboard', 'ver_historial', 'usar_mensajes'],
};

export function puede(rol, accion) {
  return (PERMISOS[rol] || []).includes(accion);
}
