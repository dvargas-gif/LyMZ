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

function tiempoPromedioYUltima(timestamps) {
  const validos = timestamps.filter(Boolean);
  const tiempos = validos.map(t => new Date(t).getTime()).sort((a, b) => a - b);
  let sumaDiffs = 0, n = 0;
  for (let i = 1; i < tiempos.length; i++) { sumaDiffs += (tiempos[i] - tiempos[i - 1]); n++; }
  const promedioMs = n > 0 ? sumaDiffs / n : null;
  return {
    tiempoPromedio: promedioMs ? `${Math.round(promedioMs / 1000 / 60)} min` : '—',
    ultimaActividad: validos.length > 0 ? validos.sort().slice(-1)[0] : null,
  };
}

/**
 * Trabajo del módulo Despacho por TRABAJADOR (número de piso, pedido
 * explícito 2026-08-19: "medir métricas de trabajo" ahora que arranca el
 * uso real). Solo cuenta `estado==='confirmada'` como trabajo hecho de
 * verdad -- las canceladas se reportan aparte, mismo criterio que
 * errores/deshechos en calcularMetricasPorUsuario. `trabajadorNumero` es un
 * NÚMERO de piso (sin cuenta/login, ver despacho.service.js), nunca una
 * persona identificada -- lo resuelve quien llama a texto ("Operador N").
 */
export function calcularMetricasDespachoPorTrabajador(tareas) {
  const porTrabajador = {};
  for (const t of tareas) {
    const n = t.trabajadorNumero;
    porTrabajador[n] = porTrabajador[n] || { trabajadorNumero: n, completadas: 0, vaciar: 0, recolectar: 0, canceladas: 0, timestamps: [] };
    const g = porTrabajador[n];
    if (t.estado === 'confirmada') {
      g.completadas++;
      if (t.tipo === 'vaciar') g.vaciar++;
      if (t.tipo === 'recolectar') g.recolectar++;
      g.timestamps.push(t.resueltoEn);
    } else if (t.estado === 'cancelada') {
      g.canceladas++;
    }
  }
  return Object.values(porTrabajador).map(g => {
    const { tiempoPromedio, ultimaActividad } = tiempoPromedioYUltima(g.timestamps);
    return { trabajadorNumero: g.trabajadorNumero, completadas: g.completadas, vaciar: g.vaciar, recolectar: g.recolectar, canceladas: g.canceladas, tiempoPromedio, ultimaActividad };
  }).sort((a, b) => b.completadas - a.completadas);
}

/**
 * Trabajo de la migración RCL→MZ por PERSONA real -- a diferencia de
 * Despacho, acá cada etapa (`iniciar`/`marcarBloqueado`/`confirmar`/`aprobar`,
 * migracionSlots.service.js) SÍ queda atribuida a un `profiles.id` real. Una
 * misma persona puede aparecer en varias etapas de distintos slots -- se
 * agrega por persona, sumando lo que hizo en cada rol.
 * @param {Array} slots -- valores de migracionSlotsService.listar()
 * @param {(id: string) => string} resolverNombre -- ej. id => profiles.get(id)?.nombre ?? 'Desconocido'
 */
export function calcularMetricasMigracionPorPersona(slots, resolverNombre) {
  const porPersona = {};
  function sumar(id, campo, timestamp) {
    if (!id) return;
    porPersona[id] = porPersona[id] || { id, iniciados: 0, bloqueados: 0, confirmados: 0, aprobados: 0, timestamps: [] };
    porPersona[id][campo]++;
    porPersona[id].timestamps.push(timestamp);
  }
  for (const s of slots) {
    sumar(s.iniciadoPor, 'iniciados', s.iniciadoEn);
    sumar(s.bloqueadoPor, 'bloqueados', s.bloqueadoEn);
    sumar(s.confirmadoPor, 'confirmados', s.confirmadoEn);
    sumar(s.aprobadoPor, 'aprobados', s.aprobadoEn);
  }
  return Object.values(porPersona).map(g => {
    const { tiempoPromedio, ultimaActividad } = tiempoPromedioYUltima(g.timestamps);
    const totalAcciones = g.iniciados + g.bloqueados + g.confirmados + g.aprobados;
    return {
      usuario: resolverNombre(g.id) ?? 'Desconocido',
      iniciados: g.iniciados, bloqueados: g.bloqueados, confirmados: g.confirmados, aprobados: g.aprobados,
      totalAcciones, tiempoPromedio, ultimaActividad,
    };
  }).sort((a, b) => b.totalAcciones - a.totalAcciones);
}
