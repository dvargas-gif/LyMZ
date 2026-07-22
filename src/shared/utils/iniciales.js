/** Iniciales para un avatar -- "David Vargas" -> "DV". Sin nombre, un placeholder neutro en vez de romper. Extraído de Sidebar.jsx (2026-07-22) para reusar en SaludoToast/mensajería. */
export function iniciales(nombre) {
  if (!nombre) return '?';
  const partes = nombre.trim().split(/\s+/);
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}
