/**
 * Los 5 textos de capacidad por nivel del rack 3D del Login -- contenido
 * real, provisto por David (antes placeholder). nivel 0 = estante más bajo
 * ("01" en el badge) hasta nivel 4 = el más alto ("05").
 */
export const CAPACIDADES_NIVEL = [
  {
    corto: 'Auditoría',
    titulo: 'Auditoría cerrada por supervisor',
    icono: 'ti-shield-check',
    texto: 'Cada slot migrado se confirma por un rol distinto al del operador que ejecutó, con historial completo consultable. Trazabilidad legal, no solo operativa.',
  },
  {
    corto: 'Buffer',
    titulo: 'Buffer inteligente',
    icono: 'ti-hourglass-low',
    texto: 'Espacio transitorio con reglas automáticas -- si un operador acumula demasiado material sin ubicar, el sistema le bloquea nuevas tareas hasta que resuelva. Control remoto sin necesidad de estar en el piso.',
  },
  {
    corto: 'Migración',
    titulo: 'Migración RCL → MZ guiada',
    icono: 'ti-arrows-right-left',
    texto: 'Reorganizás el layout físico del CEDI sin caos operativo. La app dice qué mover, en qué orden, y valida el cierre con supervisor antes de dar por finalizado.',
  },
  {
    corto: 'Trazabilidad',
    titulo: 'Trazabilidad artículo por artículo',
    icono: 'ti-route',
    texto: 'Cada movimiento queda registrado con operador, timestamp, origen y destino exactos, hasta el sub-nivel. Nada se mueve sin dejar huella.',
  },
  {
    corto: 'Slotting',
    titulo: 'Slotting inteligente',
    icono: 'ti-layout-grid',
    texto: 'El sistema recomienda automáticamente en qué nivel debería vivir cada artículo según su rotación, consumo y volumen, no según intuición del operador.',
  },
];
