/**
 * Métricas de productividad sobre el histórico de Movimientos (auditoría) --
 * portadas TAL CUAL desde src/features/dashboard/Productividad.jsx (G1e).
 * Ya eran funciones puras (sin closures sobre estado de React, sin DOM) --
 * lo único que cambia es dónde viven y que ahora tienen test propio (Ley 2).
 */

/** Agrupa movimientos por usuario y calcula tiempo promedio entre movimientos + % de productividad. */
export function calcularMetricasPorUsuario(movimientos) {
  const porUsuario = {};
  for (const m of movimientos) {
    const u = m.usuarioNombre || 'Desconocido';
    porUsuario[u] = porUsuario[u] || { usuario: u, movimientos: 0, deshechos: 0, errores: 0, timestamps: [] };
    porUsuario[u].movimientos++;
    if (m.estado === 'Deshecho') porUsuario[u].deshechos++;
    if (m.estado === 'Cancelado') porUsuario[u].errores++;
    porUsuario[u].timestamps.push(`${m.fecha}T${m.hora}`);
  }
  return Object.values(porUsuario).map(u => {
    const tiempos = u.timestamps.map(t => new Date(t).getTime()).sort((a, b) => a - b);
    let sumaDiffs = 0, n = 0;
    for (let i = 1; i < tiempos.length; i++) { sumaDiffs += (tiempos[i] - tiempos[i - 1]); n++; }
    const promedioMs = n > 0 ? sumaDiffs / n : null;
    const ultimaActividad = u.timestamps.sort().slice(-1)[0] || null;
    return {
      usuario: u.usuario, movimientos: u.movimientos, deshechos: u.deshechos, errores: u.errores,
      tiempoPromedio: promedioMs ? `${Math.round(promedioMs / 1000 / 60)} min` : '—',
      productividad: u.movimientos > 0 ? Math.round((u.movimientos - u.errores - u.deshechos) / u.movimientos * 100) : 0,
      ultimaActividad,
    };
  }).sort((a, b) => b.movimientos - a.movimientos);
}

/** Cuenta movimientos agrupados por una clave arbitraria (fecha, hora redondeada, etc.). */
export function agruparPor(movimientos, claveFn) {
  const acc = {};
  for (const m of movimientos) {
    const k = claveFn(m);
    acc[k] = (acc[k] || 0) + 1;
  }
  return acc;
}
