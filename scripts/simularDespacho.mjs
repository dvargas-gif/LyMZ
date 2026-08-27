// Simula (SOLO LECTURA, nunca toca Supabase) exactamente lo que
// despachoService.generarLote() generaría con el estado real de hoy --
// misma lógica pura (planificarSecuencia + generarLoteDespacho), corrida
// contra exports en CSV en vez de contra la base en vivo.
//
// Cómo usarlo:
// 1) Exportá 5 CSV frescos a "Docs/Documentos de base de datos/" (mismos
//    nombres exactos que abajo, o cambiá las rutas):
//    - migracion_movimientos pendiente: id, mz_pasillo, mz_columna, mz_nivel, rcl_codigo, rcl_nivel, articulo, cantidad, orden
//    - identidad_legacy completo: mz_pasillo, mz_columna, mz_nivel, mz_subnivel, rcl_codigo, rcl_nivel, rcl_subnivel, estado_rcl
//    - inventario_rcl_actual completo: rcl_codigo, rcl_nivel, rcl_subnivel, articulo, cantidad
//    - inventario_slotting completo: articulo, pasillo, columna, nivel (el resto de columnas se ignora acá)
//    - migracion_movimientos CUALQUIER estado: mz_pasillo, mz_columna, articulo
// 2) Actualizá NOMBRES_ARCHIVO y SLOTS_ACTUALES abajo con lo que tengas.
// 3) node scripts/simularDespacho.mjs

import { planificarSecuencia } from '../src/features/migracion/planificarSecuencia.js';
import { contenidoActualDeRacks, generarLoteDespacho, seleccionarRacksCompletos } from '../src/features/despacho/generarLoteDespacho.js';
import fs from 'node:fs';

const D = 'Docs/Documentos de base de datos/';
const NOMBRES_ARCHIVO = {
  movimientosPendientes: 'Migracion de moviminetos Faltante.csv',
  identidadLegacy: 'identidad_legacy completo.csv',
  inventarioRclActual: 'Consulta de invetario actual para prueba de acciones.csv',
  inventarioSlotting: 'inventario_slotting completo (el plan de fábrica).csv',
  movimientosCualquierEstado: 'Migracion de movimeintos para prueba de acciones.csv',
};

// Editá esto con el resultado real de:
//   select mz_pasillo, mz_columna, estado from migracion_slots;
const SLOTS_ACTUALES = new Map([
  ['MZ02|36', { estado: 'esperando_aprobacion' }],
  ['MZ01|21', { estado: 'esperando_aprobacion' }],
  ['MZ02|1', { estado: 'vaciando' }],
  ['MZ03|5', { estado: 'bloqueado' }],
  ['MZ03|12', { estado: 'bloqueado' }],
]);

const CANTIDAD_OPERADORES = 3;

function parseCsv(path) {
  const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (vals[i] ?? '').trim());
    return obj;
  });
}

const movimientosPendientes = parseCsv(D + NOMBRES_ARCHIVO.movimientosPendientes).map(m => ({
  mzPasillo: m.mz_pasillo, mzColumna: Number(m.mz_columna), rclCodigo: m.rcl_codigo, rclNivel: m.rcl_nivel, articulo: m.articulo,
}));
const identidadLegacy = parseCsv(D + NOMBRES_ARCHIVO.identidadLegacy).map(r => ({
  mzPasillo: r.mz_pasillo, mzColumna: Number(r.mz_columna), mzNivel: Number(r.mz_nivel), mzSubnivel: Number(r.mz_subnivel),
  rclCodigo: r.rcl_codigo === 'null' ? null : r.rcl_codigo, rclNivel: r.rcl_nivel === 'null' ? null : r.rcl_nivel,
  rclSubnivel: r.rcl_subnivel === 'null' ? null : r.rcl_subnivel, estadoRcl: r.estado_rcl,
}));
const inventarioRclActual = parseCsv(D + NOMBRES_ARCHIVO.inventarioRclActual).map(r => ({
  rclCodigo: r.rcl_codigo, rclNivel: r.rcl_nivel, rclSubnivel: r.rcl_subnivel, articulo: r.articulo, cantidad: Number(r.cantidad),
}));
const inventarioSlotting = parseCsv(D + NOMBRES_ARCHIVO.inventarioSlotting).map(r => ({
  articulo: r.articulo, pasillo: r.pasillo, columna: Number(r.columna), nivel: r.nivel,
}));
const movimientosCualquierEstado = parseCsv(D + NOMBRES_ARCHIVO.movimientosCualquierEstado).map(r => ({
  mzPasillo: r.mz_pasillo, mzColumna: Number(r.mz_columna), articulo: r.articulo,
}));

// === misma lógica que despachoService.generarLote() ===
const destinosUnicos = [...new Map(movimientosPendientes.map(m => [`${m.mzPasillo}|${m.mzColumna}`, { mzPasillo: m.mzPasillo, mzColumna: m.mzColumna }])).values()];
const { contenido: cTodos } = contenidoActualDeRacks(destinosUnicos, identidadLegacy, inventarioRclActual);
const destinosConContenido = new Set(cTodos.map(c => `${c.mzPasillo}|${c.mzColumna}`));
const racksSinContenido = new Set(destinosUnicos.map(r => `${r.mzPasillo}|${r.mzColumna}`).filter(c => !destinosConContenido.has(c)));

const { oleadas } = planificarSecuencia(movimientosPendientes, identidadLegacy, SLOTS_ACTUALES, { racksSinContenido });
const oleadaCandidata = oleadas[0] ?? [];

const totalPlanificadoPorRack = new Map();
for (const fila of inventarioSlotting) {
  const c = `${fila.pasillo}|${fila.columna}`;
  totalPlanificadoPorRack.set(c, (totalPlanificadoPorRack.get(c) ?? 0) + 1);
}
const totalConMovimientoPorRack = new Map();
for (const m of movimientosCualquierEstado) {
  const c = `${m.mzPasillo}|${m.mzColumna}`;
  totalConMovimientoPorRack.set(c, (totalConMovimientoPorRack.get(c) ?? 0) + 1);
}

const articulosConDestinoReal = new Set(movimientosCualquierEstado.map(m => m.articulo));
const { contenido: contenidoDeLaOleada, sinDestino } = contenidoActualDeRacks(oleadaCandidata, identidadLegacy, inventarioRclActual, articulosConDestinoReal);
const sinDestinoPorRack = new Map();
for (const a of sinDestino) {
  const c = `${a.mzPasillo}|${a.mzColumna}`;
  sinDestinoPorRack.set(c, (sinDestinoPorRack.get(c) ?? 0) + 1);
}

const { seleccionados, diferidosPorCupo, incompletos } = seleccionarRacksCompletos(oleadaCandidata, sinDestinoPorRack, totalPlanificadoPorRack, totalConMovimientoPorRack);

console.log('=== CANDIDATOS ORIGINALES (oleadas[0]) ===', oleadaCandidata.length);
console.log('=== SELECCIONADOS (esta oleada, van a cerrar completos) ===');
console.log(seleccionados.map(r => `${r.mzPasillo}-C${String(r.mzColumna).padStart(3, '0')} (${r.dificultad})`).join(', ') || '(ninguno)');
console.log('=== DIFERIDOS por cupo (completos, para la próxima) ===');
console.log(diferidosPorCupo.map(r => `${r.mzPasillo}-C${String(r.mzColumna).padStart(3, '0')}`).join(', ') || '(ninguno)');
console.log('=== INCOMPLETOS (necesitan atención, no entran) ===');
console.log(incompletos.map(r => `${r.mzPasillo}-C${String(r.mzColumna).padStart(3, '0')} (${r.faltanRecolectar} recolectar, ${r.faltanVaciar} vaciar)`).join('\n') || '(ninguno)');

if (seleccionados.length > 0) {
  const clavesOleada = new Set(seleccionados.map(r => `${r.mzPasillo}|${r.mzColumna}`));
  const contenidoActual = contenidoDeLaOleada.filter(c => clavesOleada.has(`${c.mzPasillo}|${c.mzColumna}`));
  const { trabajadores, advertencias } = generarLoteDespacho(seleccionados, contenidoActual, movimientosPendientes, CANTIDAD_OPERADORES, { totalPlanificadoPorRack, totalConMovimientoPorRack });
  console.log();
  console.log('=== TRABAJADORES (' + CANTIDAD_OPERADORES + ' operadores) ===');
  for (const t of trabajadores) console.log(`Trabajador ${t.numero} - ${t.tareas.length} tareas`);
  console.log();
  console.log('=== ADVERTENCIAS ===');
  console.log(advertencias.join('\n'));
}
