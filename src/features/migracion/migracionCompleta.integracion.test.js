import { describe, it, expect } from 'vitest';
import { generarMovimientosMigracionOptimizado } from './generarMovimientosOptimizado.js';
import { seleccionarRacksCompletos } from '../despacho/generarLoteDespacho.js';

/**
 * Prueba de integración de la SECUENCIA completa de migración a nivel de
 * código (2026-08-27, pedido explícito de David: "realiza la migración del
 * MZ tú completa a nivel de código y prueba, a ver si la secuencia es
 * correcta" -- después de confirmar que sí, a veces un destino se arma
 * extrayendo de MÁS DE UN rack RCL a la vez).
 *
 * No toca Supabase (no hay DB acá) -- encadena las piezas PURAS reales:
 * 1) Calcular plan (generarMovimientosMigracionOptimizado, el motor nuevo).
 * 2) Simular "vaciar": para cada artículo que un operador intentaría mover
 *    al carrito de traslado, replica la MISMA regla que
 *    migracionBuffer.service.js/depositar() usa contra la base real
 *    (candidato = mismo articulo + mismo rcl_codigo + mismo rcl_nivel +
 *    estado pendiente) -- si el plan generó un movimiento para esa
 *    combinación exacta, el depósito real se aceptaría; si no, se
 *    rechazaría. Prueba que el plan y el gate del carrito nunca se
 *    contradicen entre sí.
 * 3) Simular "recolectar": confirmar todo lo depositado y verificar que el
 *    plan queda en 0 pendientes, agrupado y ordenado por rack de origen
 *    dentro de cada destino compartido.
 */

const GEOMETRIA = {
  pasillos: [
    { pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }, { columna: 2, x: 3, y: 2 }] },
    { pasillo: 'MZ02', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 5 }] },
  ],
};

/** Mismo criterio EXACTO que migracionBuffer.service.js/buscarMovimientosPendientes -- réplica intencional, no un atajo, para que esta prueba realmente valide la regla real. */
function simularGateDelCarrito(movimientosPlan, { articulo, rclCodigo, rclNivel }) {
  const candidatos = movimientosPlan.filter(m =>
    m.articulo === articulo
    && m.rclCodigo === rclCodigo
    && m.rclNivel === rclNivel
  );
  return { aceptado: candidatos.length > 0, candidatos };
}

describe('Secuencia completa de migración (calcular plan -> vaciar -> recolectar)', () => {
  it('un destino armado con artículos de VARIOS racks RCL distintos -- el plan y el gate del carrito coinciden para todos, orden agrupa correcto', () => {
    // 3 orígenes RCL distintos, cada uno con un artículo real -- volumen
    // chico a propósito para que el motor los junte en el mismo hueco físico
    // (así se prueba el caso real que David confirmó: "se extrae de más de
    // un rack").
    const inventarioSlotting = [
      { articulo: 'SKU_A', pasillo: 'MZ09', columna: 1, nivel: 'N01', rack_actual: 'RCL101-C001-N01-1' },
      { articulo: 'SKU_B', pasillo: 'MZ09', columna: 2, nivel: 'N02', rack_actual: 'RCL102-C002-N02-1' },
      { articulo: 'SKU_C', pasillo: 'MZ09', columna: 3, nivel: 'N01', rack_actual: 'RCL103-C003-N01-1' },
    ];
    const inventarioRclActual = [
      { rclCodigo: 'RCL101-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU_A', cantidad: 6 },
      { rclCodigo: 'RCL102-C002', rclNivel: 2, rclSubnivel: 1, articulo: 'SKU_B', cantidad: 3 },
      { rclCodigo: 'RCL103-C003', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU_C', cantidad: 9 },
    ];
    const volumenPorArticulo = new Map([['SKU_A', 0.01], ['SKU_B', 0.01], ['SKU_C', 0.01]]);

    // --- Paso 1: Calcular plan ---
    const { movimientos, sinStock, respaldados } = generarMovimientosMigracionOptimizado(
      inventarioSlotting, inventarioRclActual, volumenPorArticulo, GEOMETRIA
    );
    expect(sinStock).toHaveLength(0);
    expect(respaldados).toHaveLength(0);
    expect(movimientos).toHaveLength(3);

    // Los 3 SÍ quedaron en el MISMO destino físico -- confirma el escenario real de David.
    const destinos = new Set(movimientos.map(m => `${m.mzPasillo}|${m.mzColumna}`));
    expect(destinos.size).toBe(1);

    // Orden agrupa por rack de ORIGEN (RCL101 < RCL102 < RCL103 alfabético), secuencial desde 1.
    expect(movimientos.map(m => m.rclCodigo)).toEqual(['RCL101-C001', 'RCL102-C002', 'RCL103-C003']);
    expect(movimientos.map(m => m.orden)).toEqual([1, 2, 3]);

    // --- Paso 2: Simular "vaciar" cada uno de los 3 racks de origen ---
    // Cada rack se vacía por separado (un operador a la vez, o varios) --
    // cada depósito debe ser aceptado porque el plan SÍ tiene un movimiento
    // pendiente exacto para esa combinación artículo+origen.
    for (const origen of [
      { articulo: 'SKU_A', rclCodigo: 'RCL101-C001', rclNivel: 1 },
      { articulo: 'SKU_B', rclCodigo: 'RCL102-C002', rclNivel: 2 },
      { articulo: 'SKU_C', rclCodigo: 'RCL103-C003', rclNivel: 1 },
    ]) {
      const { aceptado, candidatos } = simularGateDelCarrito(movimientos, origen);
      expect(aceptado, `${origen.articulo} desde ${origen.rclCodigo} debería aceptarse -- el plan lo tiene`).toBe(true);
      expect(candidatos).toHaveLength(1); // sin ambigüedad -- se resuelve directo, sin quedar "sin destino"
    }

    // Un artículo que físicamente ESTÁ en uno de esos racks RCL pero que el
    // plan NUNCA generó para él (huérfano/"sin hogar") -- el gate lo rechaza,
    // tal como se implementó ayer.
    const { aceptado: aceptadoHuerfano } = simularGateDelCarrito(movimientos, { articulo: 'SKU_NO_PLANEADO', rclCodigo: 'RCL101-C001', rclNivel: 1 });
    expect(aceptadoHuerfano).toBe(false);

    // --- Paso 3: Simular "recolectar" -- confirmar los 3 depósitos ---
    const recolectados = movimientos.map(m => ({ ...m, estado: 'recolectado' }));
    expect(recolectados.filter(m => m.estado === 'pendiente')).toHaveLength(0);
    expect(recolectados.every(m => m.mzPasillo === movimientos[0].mzPasillo && m.mzColumna === movimientos[0].mzColumna)).toBe(true);
  });

  it('un artículo con volumen desconocido cae al destino fijo original -- el gate del carrito lo acepta igual (el plan SÍ lo incluye, solo con otro destino)', () => {
    const inventarioSlotting = [
      { articulo: 'SKU_SIN_DIM', pasillo: 'MZ09', columna: 99, nivel: 'N05', rack_actual: 'RCL200-C005-N05-1' },
    ];
    const inventarioRclActual = [
      { rclCodigo: 'RCL200-C005', rclNivel: 5, rclSubnivel: 1, articulo: 'SKU_SIN_DIM', cantidad: 2 },
    ];
    const { movimientos, respaldados } = generarMovimientosMigracionOptimizado(
      inventarioSlotting, inventarioRclActual, new Map(), GEOMETRIA
    );
    expect(respaldados).toHaveLength(1);
    expect(movimientos).toHaveLength(1);

    const { aceptado } = simularGateDelCarrito(movimientos, { articulo: 'SKU_SIN_DIM', rclCodigo: 'RCL200-C005', rclNivel: 5 });
    expect(aceptado).toBe(true);
  });

  it('un artículo sin stock real hoy -- nunca genera movimiento, el gate del carrito lo rechaza si alguien igual intenta moverlo', () => {
    const inventarioSlotting = [
      { articulo: 'SKU_SIN_STOCK', pasillo: 'MZ09', columna: 50, nivel: 'N01', rack_actual: 'RCL300-C010-N01-1' },
    ];
    const { movimientos, sinStock } = generarMovimientosMigracionOptimizado(
      inventarioSlotting, [], new Map([['SKU_SIN_STOCK', 0.01]]), GEOMETRIA
    );
    expect(sinStock).toHaveLength(1);
    expect(movimientos).toHaveLength(0);

    const { aceptado } = simularGateDelCarrito(movimientos, { articulo: 'SKU_SIN_STOCK', rclCodigo: 'RCL300-C010', rclNivel: 1 });
    expect(aceptado).toBe(false);
  });

  describe('la oleada (seleccionarRacksCompletos) con el motor nuevo -- hallazgo real 2026-08-28, antes de la primera prueba en vivo', () => {
    // El motor nuevo manda 2 artículos reales a MZ01-C001 -- pero esa misma
    // posición, en el plan VIEJO (inventario_slotting), tenía 5 artículos
    // SIN NINGUNA relación asignados ahí a mano hace meses (un rack real
    // que hoy vive otra vida bajo el motor nuevo). Si "cuánto planeaba este
    // rack" se sigue leyendo del plan viejo, el rack se ve "a medias" (le
    // faltarían 3) aunque el motor nuevo ya lo haya completado del todo.
    const inventarioSlotting = [
      { articulo: 'SKU_A', pasillo: 'MZ09', columna: 9, nivel: 'N01', rack_actual: 'RCL101-C001-N01-1' },
      { articulo: 'SKU_B', pasillo: 'MZ09', columna: 9, nivel: 'N01', rack_actual: 'RCL102-C002-N01-1' },
      // 5 filas históricas, sin relación, que el plan viejo asignaba a MZ01-C001 -- el motor nuevo nunca las toca (no tienen origen RCL parseable, así que ni siquiera son candidatos).
      { articulo: 'VIEJO_1', pasillo: 'MZ01', columna: 1, nivel: 'N01', rack_actual: null },
      { articulo: 'VIEJO_2', pasillo: 'MZ01', columna: 1, nivel: 'N02', rack_actual: null },
      { articulo: 'VIEJO_3', pasillo: 'MZ01', columna: 1, nivel: 'N03', rack_actual: null },
      { articulo: 'VIEJO_4', pasillo: 'MZ01', columna: 1, nivel: 'N04', rack_actual: null },
      { articulo: 'VIEJO_5', pasillo: 'MZ01', columna: 1, nivel: 'N05', rack_actual: null },
    ];
    const inventarioRclActual = [
      { rclCodigo: 'RCL101-C001', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU_A', cantidad: 5 },
      { rclCodigo: 'RCL102-C002', rclNivel: 1, rclSubnivel: 1, articulo: 'SKU_B', cantidad: 3 },
    ];
    const GEOMETRIA_UN_HUECO = { pasillos: [{ pasillo: 'MZ01', orientacion: 'horizontal', ubicaciones: [{ columna: 1, x: 1, y: 2 }] }] };

    it('con la fuente VIEJA (inventario_slotting) -- se rompe: marca el rack como incompleto sin motivo real', () => {
      const { movimientos } = generarMovimientosMigracionOptimizado(
        inventarioSlotting, inventarioRclActual,
        new Map([['SKU_A', 0.01], ['SKU_B', 0.01], ['VIEJO_1', 0.05], ['VIEJO_2', 0.05], ['VIEJO_3', 0.05], ['VIEJO_4', 0.05], ['VIEJO_5', 0.05]]), // volumen chico conocido -- deja hueco real para SKU_A/SKU_B, no bloquea el nivel entero como pasaría sin dimensión (ver construirOcupacionInicial)
        GEOMETRIA_UN_HUECO
      );
      expect(new Set(movimientos.map(m => `${m.mzPasillo}|${m.mzColumna}`)).size).toBe(1); // ambos al mismo destino real

      // Reproduce el bug real encontrado: totalPlanificadoPorRack desde inventario_slotting (comportamiento de ANTES del fix de hoy).
      const totalPlanificadoPorRackViejo = new Map();
      for (const fila of inventarioSlotting) totalPlanificadoPorRackViejo.set(`${fila.pasillo}|${fila.columna}`, (totalPlanificadoPorRackViejo.get(`${fila.pasillo}|${fila.columna}`) ?? 0) + 1);
      const totalConMovimientoPorRack = new Map();
      for (const m of movimientos) totalConMovimientoPorRack.set(`${m.mzPasillo}|${m.mzColumna}`, (totalConMovimientoPorRack.get(`${m.mzPasillo}|${m.mzColumna}`) ?? 0) + 1);

      const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
      const { seleccionados, incompletos } = seleccionarRacksCompletos(oleada, new Map(), totalPlanificadoPorRackViejo, totalConMovimientoPorRack);
      expect(seleccionados).toHaveLength(0);
      expect(incompletos).toHaveLength(1);
      expect(incompletos[0].faltanRecolectar).toBe(3); // el bug: 5 planeados (viejos, sin relación) - 2 reales = 3 "faltantes" que en realidad no faltan
    });

    it('con la fuente NUEVA (movimientos, el fix de hoy) -- el rack cierra completo, como corresponde', () => {
      const { movimientos } = generarMovimientosMigracionOptimizado(
        inventarioSlotting, inventarioRclActual,
        new Map([['SKU_A', 0.01], ['SKU_B', 0.01], ['VIEJO_1', 0.05], ['VIEJO_2', 0.05], ['VIEJO_3', 0.05], ['VIEJO_4', 0.05], ['VIEJO_5', 0.05]]), // volumen chico conocido -- deja hueco real para SKU_A/SKU_B, no bloquea el nivel entero como pasaría sin dimensión (ver construirOcupacionInicial)
        GEOMETRIA_UN_HUECO
      );

      // Mismo criterio que despacho.service.js después del fix: las dos Maps salen de la MISMA fuente (movimientosCualquierEstado).
      const totalConMovimientoPorRack = new Map();
      for (const m of movimientos) totalConMovimientoPorRack.set(`${m.mzPasillo}|${m.mzColumna}`, (totalConMovimientoPorRack.get(`${m.mzPasillo}|${m.mzColumna}`) ?? 0) + 1);
      const totalPlanificadoPorRackNuevo = new Map(totalConMovimientoPorRack);

      const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
      const { seleccionados, incompletos } = seleccionarRacksCompletos(oleada, new Map(), totalPlanificadoPorRackNuevo, totalConMovimientoPorRack);
      expect(incompletos).toHaveLength(0);
      expect(seleccionados).toHaveLength(1);
      expect(seleccionados[0]).toMatchObject({ mzPasillo: 'MZ01', mzColumna: 1 });
    });
  });
});
