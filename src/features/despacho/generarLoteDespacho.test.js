import { describe, it, expect } from 'vitest';
import { generarLoteDespacho, contenidoActualDeRacks } from './generarLoteDespacho.js';

function movimiento(id, mzPasillo, mzColumna, articulo, rclCodigo = 'RCL-X', rclNivel = '1') {
  return { id, mzPasillo, mzColumna, rclCodigo, rclNivel, articulo };
}

function identidad(mzPasillo, mzColumna, rclCodigo, rclNivel = 1, estadoRcl = 'asignado') {
  return { mzPasillo, mzColumna, rclCodigo, rclNivel, rclSubnivel: 1, estadoRcl };
}

function inventarioRcl(rclCodigo, rclNivel, articulo, cantidad = 1) {
  return { rclCodigo, rclNivel, rclSubnivel: 1, articulo, cantidad };
}

describe('contenidoActualDeRacks', () => {
  it('mapea el contenido real (por identidad RCL) al rack MZ que le corresponde, solo para racks de la oleada', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A', 1), identidad('MZ02', 9, 'RCL-B', 1)];
    const inventario = [inventarioRcl('RCL-A', 1, 'ART-VIEJO-1', 5), inventarioRcl('RCL-B', 1, 'ART-FUERA-DE-OLEADA', 2)];

    const contenido = contenidoActualDeRacks(oleada, identidadLegacy, inventario);

    expect(contenido).toEqual([{ mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 1, articulo: 'ART-VIEJO-1', cantidad: 5 }]);
  });

  it('ignora identidad no asignada y subniveles distintos de 1', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const identidadLegacy = [
      { mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 1, rclSubnivel: 1, estadoRcl: 'disponible' },
      { mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-C', rclNivel: 1, rclSubnivel: 2, estadoRcl: 'asignado' },
    ];
    const inventario = [inventarioRcl('RCL-A', 1, 'ART-X'), inventarioRcl('RCL-C', 1, 'ART-Y')];

    expect(contenidoActualDeRacks(oleada, identidadLegacy, inventario)).toEqual([]);
  });
});

describe('generarLoteDespacho -- orden por cuerpo, reparto PAREJO por cabeza (2026-07-22, ajustado el mismo día)', () => {
  it('con un solo cuerpo y varios operadores, el reparto parejo deja todas sus tareas juntas en un solo trabajador', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const aVaciar = [{ mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 1, articulo: 'VIEJO-A', cantidad: 1 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'ART-NUEVO-1'), movimiento(2, 'MZ01', 1, 'ART-NUEVO-2')];

    const { trabajadores } = generarLoteDespacho(oleada, aVaciar, movimientos, 5);

    // Con 5 operadores disponibles pero solo 3 tareas totales, solo 3 trabajadores reciben algo (1 tarea cada uno).
    expect(trabajadores).toHaveLength(3);
    expect(trabajadores.flatMap(t => t.tareas)).toHaveLength(3); // 1 vaciar + 2 recolectar, todas juntas en la lista aplanada
  });

  it('dentro de un cuerpo, las tareas de vaciar van ANTES que las de recolectar (orden físico real)', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const aVaciar = [{ mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 1, articulo: 'VIEJO-A', cantidad: 1 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'ART-NUEVO')];

    const { trabajadores } = generarLoteDespacho(oleada, aVaciar, movimientos, 1);

    expect(trabajadores[0].tareas.map(t => t.tipo)).toEqual(['vaciar', 'recolectar']);
  });

  it('los cuerpos con MENOS artículos que vaciar quedan PRIMERO en la lista aplanada (arranque liviano)', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }, { mzPasillo: 'MZ01', mzColumna: 2 }];
    // Rack 1 (columna 1): 3 artículos que vaciar (más pesado).
    // Rack 2 (columna 2): 1 artículo que vaciar (más liviano) -- debe ir primero.
    const aVaciar = [
      { mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 1, articulo: 'PESADO-1', cantidad: 1 },
      { mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 2, articulo: 'PESADO-2', cantidad: 1 },
      { mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 3, articulo: 'PESADO-3', cantidad: 1 },
      { mzPasillo: 'MZ01', mzColumna: 2, rclCodigo: 'RCL-B', rclNivel: 1, articulo: 'LIVIANO-1', cantidad: 1 },
    ];

    // Con un solo operador se ve el orden crudo, sin que el reparto lo oculte.
    const { trabajadores } = generarLoteDespacho(oleada, aVaciar, [], 1);

    expect(trabajadores[0].tareas.map(t => t.mzColumna)).toEqual([2, 1, 1, 1]);
  });

  it('reparto parejo por cabeza: 4 tareas entre 2 operadores, 2 cada uno -- sin importar a qué cuerpo pertenecen', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }, { mzPasillo: 'MZ01', mzColumna: 2 }, { mzPasillo: 'MZ01', mzColumna: 3 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'A'), movimiento(2, 'MZ01', 2, 'B'), movimiento(3, 'MZ01', 3, 'C')];

    const { trabajadores, advertencias } = generarLoteDespacho(oleada, [], movimientos, 2);

    expect(trabajadores).toHaveLength(2);
    // 3 tareas entre 2 operadores -> 2 y 1 (base 1, resto 1 va al primero), en el orden de la lista aplanada.
    expect(trabajadores[0].tareas.map(t => t.mzColumna)).toEqual([1, 2]);
    expect(trabajadores[1].tareas.map(t => t.mzColumna)).toEqual([3]);
    expect(advertencias.some(a => a.includes('cuerpo(s)') && a.includes('tarea(s) en total'))).toBe(true);
  });

  it('si un cuerpo no divide justo en el corte, su cola contigua pasa al siguiente trabajador (mismo cuerpo, dos personas)', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'A'), movimiento(2, 'MZ01', 1, 'B'), movimiento(3, 'MZ01', 1, 'C')];

    const { trabajadores } = generarLoteDespacho(oleada, [], movimientos, 2);

    // 3 tareas de UN solo cuerpo entre 2 operadores -> 2 y 1, ambos trabajando el mismo cuerpo.
    expect(trabajadores[0].tareas.map(t => t.movimientoId)).toEqual([1, 2]);
    expect(trabajadores[1].tareas.map(t => t.movimientoId)).toEqual([3]);
  });

  it('con menos tareas totales que operadores, los que sobran no reciben hoja y se advierte', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'A'), movimiento(2, 'MZ01', 1, 'B')];

    const { trabajadores, advertencias } = generarLoteDespacho(oleada, [], movimientos, 5);

    expect(trabajadores).toHaveLength(2);
    expect(advertencias.some(a => a.includes('menos tareas totales que gente'))).toBe(true);
  });

  it('nunca asigna el mismo movimiento (artículo a recolectar) ni el mismo artículo a vaciar a dos trabajadores distintos', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }, { mzPasillo: 'MZ01', mzColumna: 2 }, { mzPasillo: 'MZ01', mzColumna: 3 }];
    const aVaciar = [
      { mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 1, articulo: 'VIEJO-A1', cantidad: 1 },
      { mzPasillo: 'MZ01', mzColumna: 2, rclCodigo: 'RCL-B', rclNivel: 1, articulo: 'VIEJO-B1', cantidad: 1 },
    ];
    const movimientos = [movimiento(1, 'MZ01', 1, 'ART-A'), movimiento(2, 'MZ01', 2, 'ART-B'), movimiento(3, 'MZ01', 3, 'ART-C')];

    const { trabajadores } = generarLoteDespacho(oleada, aVaciar, movimientos, 3);

    const articulosAVaciar = trabajadores.flatMap(t => t.tareas.filter(x => x.tipo === 'vaciar').map(x => x.articulo));
    const idsARecolectar = trabajadores.flatMap(t => t.tareas.filter(x => x.tipo === 'recolectar').map(x => x.movimientoId));
    expect(new Set(articulosAVaciar).size).toBe(articulosAVaciar.length);
    expect(new Set(idsARecolectar).size).toBe(idsARecolectar.length);
    expect(idsARecolectar.sort()).toEqual([1, 2, 3]);
  });

  it('ignora contenido a vaciar y movimientos que NO pertenecen a ningún rack de esta oleada', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const aVaciar = [{ mzPasillo: 'MZ02', mzColumna: 9, rclCodigo: 'RCL-Z', rclNivel: 1, articulo: 'FUERA-DE-OLEADA', cantidad: 1 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'ART-A'), movimiento(2, 'MZ02', 9, 'ART-FUERA-DE-OLEADA')];

    const { trabajadores } = generarLoteDespacho(oleada, aVaciar, movimientos, 1);

    const idsAsignados = trabajadores.flatMap(t => t.tareas.filter(x => x.tipo === 'recolectar').map(x => x.movimientoId));
    expect(idsAsignados).toEqual([1]);
  });

  it('un rack sin ninguna tarea real (ni vaciar ni recolectar) no genera un cuerpo vacío', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }, { mzPasillo: 'MZ01', mzColumna: 2 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'ART-A')]; // columna 2 no tiene nada

    const { trabajadores } = generarLoteDespacho(oleada, [], movimientos, 5);

    expect(trabajadores).toHaveLength(1);
  });

  it('caso borde: ningún rack tiene tareas reales -- no genera trabajadores y advierte', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const { trabajadores, advertencias } = generarLoteDespacho(oleada, [], [], 5);
    expect(trabajadores).toEqual([]);
    expect(advertencias.length).toBeGreaterThan(0);
  });

  it('caso borde: oleada vacía -- no genera trabajadores y advierte', () => {
    const { trabajadores, advertencias } = generarLoteDespacho([], [], [], 5);
    expect(trabajadores).toEqual([]);
    expect(advertencias.length).toBeGreaterThan(0);
  });

  it('caso borde: cantidad de operadores inválida -- no genera trabajadores y advierte', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    expect(generarLoteDespacho(oleada, [], [], 0).trabajadores).toEqual([]);
    expect(generarLoteDespacho(oleada, [], [], -2).trabajadores).toEqual([]);
    expect(generarLoteDespacho(oleada, [], [], 2.5).trabajadores).toEqual([]);
  });

  it('caso real reportado en piso, corregido: un rack cuyo plan COMPLETO es 1 solo artículo NO se marca desbalanceado aunque haya que vaciar 14 para llegar ahí', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const aVaciar = Array.from({ length: 14 }, (_, i) => ({
      mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: i + 1, articulo: `V${i + 1}`, cantidad: 1,
    }));
    const movimientos = [movimiento(1, 'MZ01', 1, 'NUEVO-1')]; // 14 a vaciar, 1 a recolectar
    // El plan completo de este rack SIEMPRE fue 1 solo artículo (totalPlanificado
    // === totalConMovimiento === 1) -- no hay nada faltante por falta de stock,
    // este rack se completa del todo con lo que ya está acá.
    const datosPlan = {
      totalPlanificadoPorRack: new Map([['MZ01|1', 1]]),
      totalConMovimientoPorRack: new Map([['MZ01|1', 1]]),
    };

    const { advertencias } = generarLoteDespacho(oleada, aVaciar, movimientos, 1, datosPlan);

    expect(advertencias.some(a => a.includes('⚠ Rack'))).toBe(false);
  });

  it('advierte con números reales cuando el plan de un rack pide MÁS artículos de los que alguna vez tuvieron stock real', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const aVaciar = Array.from({ length: 14 }, (_, i) => ({
      mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: i + 1, articulo: `V${i + 1}`, cantidad: 1,
    }));
    const movimientos = [movimiento(1, 'MZ01', 1, 'NUEVO-1')]; // 1 listo hoy...
    // ...pero el plan completo (inventario_slotting) pide 6 artículos para este
    // rack, y solo 1 alguna vez tuvo movimiento real -- 5 van a quedar sin
    // resolver hasta que haya más stock. ESTE es el caso real que se reportó.
    const datosPlan = {
      totalPlanificadoPorRack: new Map([['MZ01|1', 6]]),
      totalConMovimientoPorRack: new Map([['MZ01|1', 1]]),
    };

    const { advertencias } = generarLoteDespacho(oleada, aVaciar, movimientos, 1, datosPlan);

    expect(advertencias.some(a =>
      a.includes('MZ01-C001') && a.includes('el plan destina 6') && a.includes('solo 1 tienen stock real') && a.includes('quedar 5 sin resolver')
    )).toBe(true);
  });

  it('los racks que SÍ se completan del todo van primero que los que van a quedar incompletos por falta de stock, sin importar el costo de vaciado', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }, { mzPasillo: 'MZ01', mzColumna: 2 }];
    // Rack columna 1: 8 para vaciar, se completa del todo (plan completo = lo que ya está acá).
    // Rack columna 2: 2 para vaciar (más "liviano"), pero el plan pide 5 y solo 1 tiene stock -- queda incompleto.
    const aVaciar = [
      ...Array.from({ length: 8 }, (_, i) => ({ mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: i + 1, articulo: `V${i + 1}`, cantidad: 1 })),
      { mzPasillo: 'MZ01', mzColumna: 2, rclCodigo: 'RCL-B', rclNivel: 1, articulo: 'LIVIANO-1', cantidad: 1 },
      { mzPasillo: 'MZ01', mzColumna: 2, rclCodigo: 'RCL-B', rclNivel: 2, articulo: 'LIVIANO-2', cantidad: 1 },
    ];
    const movimientos = [movimiento(1, 'MZ01', 1, 'NUEVO-COL1'), movimiento(2, 'MZ01', 2, 'NUEVO-COL2')];
    const datosPlan = {
      totalPlanificadoPorRack: new Map([['MZ01|1', 1], ['MZ01|2', 5]]),
      totalConMovimientoPorRack: new Map([['MZ01|1', 1], ['MZ01|2', 1]]),
    };

    const { trabajadores } = generarLoteDespacho(oleada, aVaciar, movimientos, 1, datosPlan);

    // Columna 1 (se completa del todo) va PRIMERO pese a costar más vaciar -- columna 2 (incompleto) queda al final.
    const columnas = trabajadores[0].tareas.map(t => t.mzColumna);
    expect(columnas.slice(0, 9)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]); // 8 vaciar + 1 recolectar de columna 1
    expect(columnas.slice(9)).toEqual([2, 2, 2]);
  });

  it('sin datosPlan (parámetro omitido), ningún rack se marca desbalanceado -- mismo comportamiento que antes del chequeo', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const aVaciar = Array.from({ length: 14 }, (_, i) => ({
      mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: i + 1, articulo: `V${i + 1}`, cantidad: 1,
    }));
    const movimientos = [movimiento(1, 'MZ01', 1, 'NUEVO-1')];

    const { advertencias } = generarLoteDespacho(oleada, aVaciar, movimientos, 1); // sin 5to argumento

    expect(advertencias.some(a => a.includes('⚠ Rack'))).toBe(false);
  });

  it('cada tarea trae su propio índice de orden secuencial, empezando en 0, dentro del trabajador', () => {
    const oleada = [{ mzPasillo: 'MZ01', mzColumna: 1 }];
    const aVaciar = [{ mzPasillo: 'MZ01', mzColumna: 1, rclCodigo: 'RCL-A', rclNivel: 1, articulo: 'VIEJO-A', cantidad: 1 }];
    const movimientos = [movimiento(1, 'MZ01', 1, 'ART-A')];

    const { trabajadores } = generarLoteDespacho(oleada, aVaciar, movimientos, 1);

    expect(trabajadores[0].tareas.map(t => t.orden)).toEqual([0, 1]);
  });
});
