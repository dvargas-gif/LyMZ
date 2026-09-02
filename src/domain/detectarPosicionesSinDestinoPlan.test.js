import { describe, it, expect } from 'vitest';
import { detectarPosicionesSinDestinoPlan, agruparPosicionesSinDestinoPorCuerpo } from './detectarPosicionesSinDestinoPlan.js';
import { COLUMNAS_POR_PASILLO } from '../features/mapa/canvas/posicionesEsquematicas.js';

function movimiento(mzPasillo, mzColumna, mzNivel, estado = 'pendiente') {
  return { mzPasillo, mzColumna, mzNivel, estado };
}

describe('detectarPosicionesSinDestinoPlan', () => {
  it('con el plan vacío, devuelve las 5 niveles de cada columna real de los 12 pasillos', () => {
    const sinDestino = detectarPosicionesSinDestinoPlan([]);
    const totalColumnas = Object.values(COLUMNAS_POR_PASILLO).reduce((suma, n) => suma + n, 0);
    expect(sinDestino).toHaveLength(totalColumnas * 5);
  });

  it('una posición con un movimiento pendiente NO aparece como sin destino', () => {
    const sinDestino = detectarPosicionesSinDestinoPlan([movimiento('MZ01', 1, 'N02')]);
    expect(sinDestino.find(s => s.pasillo === 'MZ01' && s.columna === 1 && s.nivel === 'N02')).toBeUndefined();
    // el resto de los niveles de esa misma columna SIGUEN sin destino -- es por nivel, no por cuerpo
    expect(sinDestino.find(s => s.pasillo === 'MZ01' && s.columna === 1 && s.nivel === 'N01')).toBeDefined();
  });

  it('una posición con un movimiento recolectado (en curso) tampoco aparece como sin destino', () => {
    const sinDestino = detectarPosicionesSinDestinoPlan([movimiento('MZ03', 5, 'N03', 'recolectado')]);
    expect(sinDestino.find(s => s.pasillo === 'MZ03' && s.columna === 5 && s.nivel === 'N03')).toBeUndefined();
  });

  it('un movimiento descartado SÍ cuenta como sin destino -- ya no es parte del plan vigente (decisión explícita del usuario)', () => {
    const sinDestino = detectarPosicionesSinDestinoPlan([movimiento('MZ02', 10, 'N01', 'descartado')]);
    expect(sinDestino.find(s => s.pasillo === 'MZ02' && s.columna === 10 && s.nivel === 'N01')).toBeDefined();
  });

  it('incluye MZ09-MZ12 -- a diferencia de detectarPosicionesLibres.js, el plan puede apuntar a cualquier pasillo real', () => {
    const sinDestino = detectarPosicionesSinDestinoPlan([]);
    expect(sinDestino.some(s => s.pasillo === 'MZ09')).toBe(true);
    expect(sinDestino.some(s => s.pasillo === 'MZ12')).toBe(true);
  });

  it('ordena por pasillo, columna y nivel', () => {
    const sinDestino = detectarPosicionesSinDestinoPlan([]);
    expect(sinDestino[0]).toMatchObject({ pasillo: 'MZ01', columna: 1, nivel: 'N01' });
    expect(sinDestino[1]).toMatchObject({ pasillo: 'MZ01', columna: 1, nivel: 'N02' });
  });
});

describe('agruparPosicionesSinDestinoPorCuerpo', () => {
  it('un cuerpo con los 5 niveles sin destino da UNA fila con las 5 nomenclaturas completas', () => {
    const sinDestino = [
      { pasillo: 'MZ08', columna: 5, nivel: 'N01' },
      { pasillo: 'MZ08', columna: 5, nivel: 'N02' },
      { pasillo: 'MZ08', columna: 5, nivel: 'N03' },
      { pasillo: 'MZ08', columna: 5, nivel: 'N04' },
      { pasillo: 'MZ08', columna: 5, nivel: 'N05' },
    ];
    const filas = agruparPosicionesSinDestinoPorCuerpo(sinDestino);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual({
      pasillo: 'MZ08', columna: 5,
      N01: 'MZ08-C005-N01', N02: 'MZ08-C005-N02', N03: 'MZ08-C005-N03',
      N04: 'MZ08-C005-N04', N05: 'MZ08-C005-N05',
    });
  });

  it('un cuerpo con solo algunos niveles sin destino deja vacíos los que sí tienen destino', () => {
    const sinDestino = [
      { pasillo: 'MZ01', columna: 1, nivel: 'N01' },
      { pasillo: 'MZ01', columna: 1, nivel: 'N03' },
    ];
    const filas = agruparPosicionesSinDestinoPorCuerpo(sinDestino);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ N01: 'MZ01-C001-N01', N02: '', N03: 'MZ01-C001-N03', N04: '', N05: '' });
  });
});
