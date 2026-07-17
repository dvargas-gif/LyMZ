import { describe, it, expect } from 'vitest';
import { planificarSecuencia, evaluarListoParaIniciar } from './planificarSecuencia.js';

function identidad(mzPasillo, mzColumna, rclCodigo, rclNivel = 1) {
  return { mzPasillo, mzColumna, mzNivel: 1, mzSubnivel: 1, rclCodigo, rclNivel, rclSubnivel: 1, estadoRcl: 'asignado' };
}

function movimiento(mzPasillo, mzColumna, rclCodigo, rclNivel, articulo) {
  return { mzPasillo, mzColumna, rclCodigo, rclNivel: String(rclNivel), articulo };
}

const SIN_PROGRESO = new Map();

describe('planificarSecuencia', () => {
  it('cadena simple sin ciclos -- A antes que B antes que C', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A'), identidad('MZ01', 2, 'RCL-B'), identidad('MZ01', 3, 'RCL-C')];
    const movimientos = [
      movimiento('MZ01', 1, 'RCL-Z', 1, 'ART-A'), // origen no identificado (RCL-Z no está en identidadLegacy) -- A siempre disponible
      movimiento('MZ01', 2, 'RCL-A', 1, 'ART-B'), // B necesita lo que hoy está físicamente en A
      movimiento('MZ01', 3, 'RCL-B', 1, 'ART-C'), // C necesita lo que hoy está físicamente en B
    ];

    const { oleadas, advertencias } = planificarSecuencia(movimientos, identidadLegacy, SIN_PROGRESO);

    expect(advertencias).toEqual([]);
    expect(oleadas).toHaveLength(3);
    expect(oleadas[0]).toEqual([{ mzPasillo: 'MZ01', mzColumna: 1, requiereAprobacion: false, rompeCiclo: false, libera: 1, nivelesPropios: 1 }]);
    expect(oleadas[1]).toEqual([{ mzPasillo: 'MZ01', mzColumna: 2, requiereAprobacion: false, rompeCiclo: false, libera: 1, nivelesPropios: 1 }]);
    expect(oleadas[2]).toEqual([{ mzPasillo: 'MZ01', mzColumna: 3, requiereAprobacion: false, rompeCiclo: false, libera: 0, nivelesPropios: 0 }]);
  });

  it('ciclo de 2 racks -- se fuerzan los 2 juntos (el cupo alcanza), ordenados por menos niveles de origen propios', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A', 1), identidad('MZ01', 1, 'RCL-A', 2), identidad('MZ01', 2, 'RCL-B', 1)];
    const movimientos = [
      movimiento('MZ01', 1, 'RCL-B', 1, 'ART-A'), // A necesita lo de B -- B entrega 1 solo nivel
      movimiento('MZ01', 2, 'RCL-A', 1, 'ART-B1'), // B necesita 2 niveles distintos de A -- A entrega más "carga propia" que B
      movimiento('MZ01', 2, 'RCL-A', 2, 'ART-B2'),
    ];

    const { oleadas, advertencias } = planificarSecuencia(movimientos, identidadLegacy, SIN_PROGRESO);

    expect(advertencias.some(a => a.includes('bloques de racks interdependientes'))).toBe(true);
    // Con cupo para 3, un ciclo de 2 se fuerza ENTERO en la misma oleada --
    // no tiene sentido resolverlo de a uno si hay lugar para los dos juntos
    // (feedback real: forzar de a uno con datos reales daba cientos de
    // oleadas de 1 solo rack cada una).
    expect(oleadas).toHaveLength(1);
    // Grado de salida empatado (1 y 1) -- el orden final de la oleada lo decide el desempate alfabético de ordenarListos, no quién se forzó primero.
    expect(oleadas[0]).toEqual([
      { mzPasillo: 'MZ01', mzColumna: 1, requiereAprobacion: false, rompeCiclo: true, libera: 1, nivelesPropios: 2 },
      { mzPasillo: 'MZ01', mzColumna: 2, requiereAprobacion: true, rompeCiclo: true, libera: 1, nivelesPropios: 1 },
    ]);
  });

  it('ciclo de 3 racks -- el cupo (3) alcanza para forzarlos todos juntos', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A'), identidad('MZ01', 2, 'RCL-B'), identidad('MZ01', 3, 'RCL-C')];
    const movimientos = [
      movimiento('MZ01', 1, 'RCL-C', 1, 'ART-A'), // A <- C
      movimiento('MZ01', 2, 'RCL-A', 1, 'ART-B'), // B <- A
      movimiento('MZ01', 3, 'RCL-B', 1, 'ART-C'), // C <- B  (cierra el ciclo A->B->C->A)
    ];

    const { oleadas } = planificarSecuencia(movimientos, identidadLegacy, SIN_PROGRESO);

    expect(oleadas).toHaveLength(1);
    expect(oleadas[0]).toHaveLength(3);
    expect(oleadas[0].every(o => o.rompeCiclo)).toBe(true);
  });

  it('ciclo más grande que el cupo -- se fuerzan solo los que entran, el resto sigue en una oleada siguiente', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A'), identidad('MZ01', 2, 'RCL-B'), identidad('MZ01', 3, 'RCL-C'), identidad('MZ01', 4, 'RCL-D')];
    const movimientos = [
      movimiento('MZ01', 1, 'RCL-D', 1, 'ART-A'), // A <- D
      movimiento('MZ01', 2, 'RCL-A', 1, 'ART-B'), // B <- A
      movimiento('MZ01', 3, 'RCL-B', 1, 'ART-C'), // C <- B
      movimiento('MZ01', 4, 'RCL-C', 1, 'ART-D'), // D <- C (ciclo de 4: A->B->C->D->A)
    ];

    const { oleadas } = planificarSecuencia(movimientos, identidadLegacy, SIN_PROGRESO, { capacidadMax: 3 });

    expect(oleadas.length).toBeGreaterThanOrEqual(2);
    expect(oleadas[0]).toHaveLength(3); // cupo de 3 -- no puede forzar los 4 juntos
    expect(oleadas.flat()).toHaveLength(4);
  });

  it('más candidatos listos que cupo -- prioriza por grado de salida y marca requiereAprobacion desde el 2do', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-P'), identidad('MZ01', 2, 'RCL-Q')];
    const movimientos = [
      // P y Q listos desde el inicio (sus propios orígenes no son destino de nadie).
      movimiento('MZ01', 1, 'RCL-X', 1, 'ART-P'),
      movimiento('MZ01', 2, 'RCL-Y', 1, 'ART-Q'),
      // R y S también listos (sin identidad -- da igual, solo importa que sean destinos con origen no-bloqueante).
      movimiento('MZ01', 3, 'RCL-Z1', 1, 'ART-R'),
      movimiento('MZ01', 4, 'RCL-Z2', 1, 'ART-S'),
      // T y U dependen de P -- le dan a P grado de salida 2 (el mayor de los 4).
      movimiento('MZ01', 5, 'RCL-P', 1, 'ART-T'),
      movimiento('MZ01', 6, 'RCL-P', 1, 'ART-U'),
      // V depende de Q -- grado de salida 1.
      movimiento('MZ01', 7, 'RCL-Q', 1, 'ART-V'),
    ];

    const { oleadas } = planificarSecuencia(movimientos, identidadLegacy, SIN_PROGRESO, { capacidadMax: 3 });

    // Oleada 0: P (grado 2) primero y libre; Q (grado 1) y R (grado 0, antes que S alfabéticamente) necesitan aprobación; S queda para la próxima.
    expect(oleadas[0]).toEqual([
      { mzPasillo: 'MZ01', mzColumna: 1, requiereAprobacion: false, rompeCiclo: false, libera: 2, nivelesPropios: 1 },
      { mzPasillo: 'MZ01', mzColumna: 2, requiereAprobacion: true, rompeCiclo: false, libera: 1, nivelesPropios: 1 },
      { mzPasillo: 'MZ01', mzColumna: 3, requiereAprobacion: true, rompeCiclo: false, libera: 0, nivelesPropios: 0 },
    ]);
    // S (columna 4) quedó afuera de la oleada 0 por cupo -- aparece en una oleada posterior.
    const todasLasColumnas = oleadas.flat().map(o => o.mzColumna);
    expect(todasLasColumnas).toContain(4);
  });

  it('un origen en "vaciando" real todavía NO satisface el prerequisito -- recién desde "recolectando"', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A'), identidad('MZ01', 2, 'RCL-B')];
    const movimientos = [
      // A ya tiene su propio slot en curso (estado real 'vaciando'), pero
      // TODAVÍA tiene movimientos propios pendientes -- migracion_slots.estado
      // y migracion_movimientos.estado son independientes (A sigue siendo
      // "destino" del plan aunque su slot ya haya arrancado).
      movimiento('MZ01', 1, 'RCL-X', 1, 'ART-A'),
      movimiento('MZ01', 2, 'RCL-A', 1, 'ART-B'), // B depende de A
    ];

    const slotsConAVaciando = new Map([['MZ01|1', { estado: 'vaciando' }]]);
    const resultadoVaciando = planificarSecuencia(movimientos, identidadLegacy, slotsConAVaciando);
    // A ya está iniciado (no se re-sugiere) y B sigue bloqueado porque A todavía no llegó a "recolectando".
    expect(resultadoVaciando.oleadas.flat()).toEqual([]);

    const slotsConARecolectando = new Map([['MZ01|1', { estado: 'recolectando' }]]);
    const resultadoRecolectando = planificarSecuencia(movimientos, identidadLegacy, slotsConARecolectando);
    expect(resultadoRecolectando.oleadas.flat().map(o => o.mzColumna)).toEqual([2]);
  });

  it('cupo lleno hoy (3 equipos activos reales) -- no sugiere ningún inicio nuevo', () => {
    const identidadLegacy = [];
    const movimientos = [movimiento('MZ01', 1, 'RCL-X', 1, 'ART-A')];
    const slotsLlenos = new Map([
      ['MZ02|1', { estado: 'vaciando' }],
      ['MZ02|2', { estado: 'recolectando' }],
      ['MZ02|3', { estado: 'vaciando' }],
    ]);

    const { oleadas, advertencias, equiposActivosIniciales } = planificarSecuencia(movimientos, identidadLegacy, slotsLlenos);

    expect(equiposActivosIniciales).toBe(3);
    expect(oleadas).toEqual([]);
    expect(advertencias.some(a => a.includes('Cupo lleno'))).toBe(true);
  });

  it('slots ya iniciados (cualquier estado post-pendiente) no vuelven a aparecer como candidatos', () => {
    const identidadLegacy = [];
    const movimientos = [
      movimiento('MZ01', 1, 'RCL-X', 1, 'ART-A'),
      movimiento('MZ01', 2, 'RCL-Y', 1, 'ART-B'),
    ];
    const slotsActuales = new Map([['MZ01|1', { estado: 'bloqueado' }]]);

    const { oleadas } = planificarSecuencia(movimientos, identidadLegacy, slotsActuales);

    const columnas = oleadas.flat().map(o => o.mzColumna);
    expect(columnas).not.toContain(1);
    expect(columnas).toContain(2);
  });
});

describe('evaluarListoParaIniciar', () => {
  it('sin dependencias -- listo, sin nada que lo bloquee', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A')];
    const movimientos = [movimiento('MZ01', 1, 'RCL-Z', 1, 'ART-A')]; // origen no identificado -- nunca bloquea

    const resultado = evaluarListoParaIniciar('MZ01', 1, movimientos, identidadLegacy, SIN_PROGRESO);

    expect(resultado).toEqual({ listo: true, bloqueadoPor: [] });
  });

  it('con una dependencia sin resolver -- bloqueado, informa cuál rack falta', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A'), identidad('MZ01', 2, 'RCL-B')];
    const movimientos = [
      movimiento('MZ01', 1, 'RCL-X', 1, 'ART-A'),
      movimiento('MZ01', 2, 'RCL-A', 1, 'ART-B'), // B depende de A
    ];

    const resultado = evaluarListoParaIniciar('MZ01', 2, movimientos, identidadLegacy, SIN_PROGRESO);

    expect(resultado).toEqual({ listo: false, bloqueadoPor: [{ mzPasillo: 'MZ01', mzColumna: 1 }] });
  });

  it('la dependencia ya está en "recolectando" -- deja de bloquear', () => {
    const identidadLegacy = [identidad('MZ01', 1, 'RCL-A'), identidad('MZ01', 2, 'RCL-B')];
    const movimientos = [
      movimiento('MZ01', 1, 'RCL-X', 1, 'ART-A'),
      movimiento('MZ01', 2, 'RCL-A', 1, 'ART-B'),
    ];
    const slotsActuales = new Map([['MZ01|1', { estado: 'recolectando' }]]);

    const resultado = evaluarListoParaIniciar('MZ01', 2, movimientos, identidadLegacy, slotsActuales);

    expect(resultado).toEqual({ listo: true, bloqueadoPor: [] });
  });

  it('rack sin ningún movimiento pendiente -- listo por defecto (nada que evaluar)', () => {
    const resultado = evaluarListoParaIniciar('MZ09', 5, [], [], SIN_PROGRESO);
    expect(resultado).toEqual({ listo: true, bloqueadoPor: [] });
  });
});
