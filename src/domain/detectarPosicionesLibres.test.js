import { describe, it, expect } from 'vitest';
import { detectarPosicionesLibres, detectarPosicionesLibresDeIdentidad, detectarPosicionesRealmenteLibres, agruparPosicionesLibresPorCuerpo } from './detectarPosicionesLibres.js';
import { COLUMNAS_POR_PASILLO } from '../features/mapa/canvas/posicionesEsquematicas.js';

function filaIdentidad(mzPasillo, mzColumna, mzNivel, estadoRcl = 'asignado') {
  return { mzPasillo, mzColumna, mzNivel, estadoRcl };
}

function filaCuerpo(pasillo, columna) {
  return { pasillo, columna, nivel: 'CUERPO', tipo: 'CUERPO' };
}
function filaNivel(pasillo, columna, nivel) {
  return { pasillo, columna, nivel, tipo: 'NORMAL' };
}

describe('detectarPosicionesLibres', () => {
  it('con inventario_slotting vacío, devuelve las 5 niveles de cada columna real de MZ01-MZ08', () => {
    const libres = detectarPosicionesLibres([]);
    const totalColumnas = ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08']
      .reduce((suma, p) => suma + COLUMNAS_POR_PASILLO[p], 0);
    expect(libres).toHaveLength(totalColumnas * 5);
  });

  it('identidad_legacy NO participa del cálculo -- solo inventario_slotting decide qué está ocupado (corregido en vivo: usarlo hacía que casi todo pareciera ocupado)', () => {
    // Ya no se le pasa identidad_legacy a la función -- esta prueba documenta la firma actual.
    expect(detectarPosicionesLibres.length).toBe(1);
  });

  it('un nivel individual (tipo NORMAL) ocupado en inventario_slotting no aparece como libre', () => {
    const libres = detectarPosicionesLibres([filaNivel('MZ01', 1, 'N02')]);
    expect(libres.find(l => l.pasillo === 'MZ01' && l.columna === 1 && l.nivel === 'N02')).toBeUndefined();
    // el resto de los niveles de esa misma columna SIGUEN libres -- solo se ocupó ESE nivel puntual
    expect(libres.find(l => l.pasillo === 'MZ01' && l.columna === 1 && l.nivel === 'N01')).toBeDefined();
  });

  it('un CUERPO ocupado bloquea los 5 niveles enteros de esa columna', () => {
    const libres = detectarPosicionesLibres([filaCuerpo('MZ01', 1)]);
    const deEsaColumna = libres.filter(l => l.pasillo === 'MZ01' && l.columna === 1);
    expect(deEsaColumna).toHaveLength(0);
  });

  it('ordena por pasillo, columna y nivel', () => {
    const libres = detectarPosicionesLibres([]);
    expect(libres[0]).toMatchObject({ pasillo: 'MZ01', columna: 1, nivel: 'N01' });
    expect(libres[1]).toMatchObject({ pasillo: 'MZ01', columna: 1, nivel: 'N02' });
  });

  it('no incluye pasillos fuera de MZ01-MZ08 (ej. MZ09-MZ12, sin identidad real)', () => {
    const libres = detectarPosicionesLibres([]);
    expect(libres.some(l => !['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08'].includes(l.pasillo))).toBe(false);
  });
});

describe('detectarPosicionesLibresDeIdentidad', () => {
  it('con identidad_legacy vacío, devuelve las 5 niveles de cada columna real de MZ01-MZ08', () => {
    const libres = detectarPosicionesLibresDeIdentidad([]);
    const totalColumnas = ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08']
      .reduce((suma, p) => suma + COLUMNAS_POR_PASILLO[p], 0);
    expect(libres).toHaveLength(totalColumnas * 5);
  });

  it('un MZ con fila en identidad_legacy no aparece como libre (sin importar inventario_slotting)', () => {
    const libres = detectarPosicionesLibresDeIdentidad([filaIdentidad('MZ01', 1, 2)]);
    expect(libres.find(l => l.pasillo === 'MZ01' && l.columna === 1 && l.nivel === 'N02')).toBeUndefined();
    // el resto de los niveles de esa misma columna SIGUEN libres -- identidad_legacy es por nivel, no por cuerpo
    expect(libres.find(l => l.pasillo === 'MZ01' && l.columna === 1 && l.nivel === 'N01')).toBeDefined();
  });

  it('convierte el nivel numérico (1-5) de identidad_legacy al formato N01-N05', () => {
    const libres = detectarPosicionesLibresDeIdentidad([filaIdentidad('MZ02', 3, 5)]);
    expect(libres.find(l => l.pasillo === 'MZ02' && l.columna === 3 && l.nivel === 'N05')).toBeUndefined();
  });

  it('una fila con estadoRcl distinto de "asignado" (ej. pendiente_asignar) SÍ cuenta como libre -- existe la fila pero no tiene un RCL real puesto', () => {
    const libres = detectarPosicionesLibresDeIdentidad([filaIdentidad('MZ07', 4, 1, 'pendiente_asignar')]);
    expect(libres.find(l => l.pasillo === 'MZ07' && l.columna === 4 && l.nivel === 'N01')).toBeDefined();
  });
});

describe('detectarPosicionesRealmenteLibres', () => {
  it('con todo vacío, devuelve las 5 niveles de cada columna real de MZ01-MZ08', () => {
    const libres = detectarPosicionesRealmenteLibres([], []);
    const totalColumnas = ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08']
      .reduce((suma, p) => suma + COLUMNAS_POR_PASILLO[p], 0);
    expect(libres).toHaveLength(totalColumnas * 5);
  });

  it('caso real: MZ07-C026-N01 con mercadería real en inventario_slotting NO aparece como libre, aunque identidad_legacy no tenga ningún RCL asignado ahí', () => {
    const libres = detectarPosicionesRealmenteLibres(
      [filaNivel('MZ07', 26, 'N01')],
      [],
    );
    expect(libres.find(l => l.pasillo === 'MZ07' && l.columna === 26 && l.nivel === 'N01')).toBeUndefined();
  });

  it('una posición con RCL asignado en identidad_legacy NO aparece como libre, aunque inventario_slotting no tenga mercadería ahí', () => {
    const libres = detectarPosicionesRealmenteLibres(
      [],
      [filaIdentidad('MZ03', 8, 2)],
    );
    expect(libres.find(l => l.pasillo === 'MZ03' && l.columna === 8 && l.nivel === 'N02')).toBeUndefined();
  });

  it('una posición libre en ambos sentidos a la vez SÍ aparece', () => {
    const libres = detectarPosicionesRealmenteLibres(
      [filaNivel('MZ01', 1, 'N01')],
      [filaIdentidad('MZ01', 1, 2)],
    );
    expect(libres.find(l => l.pasillo === 'MZ01' && l.columna === 1 && l.nivel === 'N03')).toBeDefined();
  });
});

describe('agruparPosicionesLibresPorCuerpo', () => {
  it('un cuerpo con los 5 niveles libres da UNA fila con las 5 nomenclaturas completas', () => {
    const libres = [
      { pasillo: 'MZ04', columna: 5, nivel: 'N01' },
      { pasillo: 'MZ04', columna: 5, nivel: 'N02' },
      { pasillo: 'MZ04', columna: 5, nivel: 'N03' },
      { pasillo: 'MZ04', columna: 5, nivel: 'N04' },
      { pasillo: 'MZ04', columna: 5, nivel: 'N05' },
    ];
    const filas = agruparPosicionesLibresPorCuerpo(libres);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual({
      pasillo: 'MZ04', columna: 5,
      N01: 'MZ04-C005-N01', N02: 'MZ04-C005-N02', N03: 'MZ04-C005-N03',
      N04: 'MZ04-C005-N04', N05: 'MZ04-C005-N05',
    });
  });

  it('un cuerpo con solo ALGUNOS niveles libres deja vacíos los que no lo están', () => {
    const libres = [
      { pasillo: 'MZ01', columna: 1, nivel: 'N01' },
      { pasillo: 'MZ01', columna: 1, nivel: 'N03' },
    ];
    const filas = agruparPosicionesLibresPorCuerpo(libres);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ N01: 'MZ01-C001-N01', N02: '', N03: 'MZ01-C001-N03', N04: '', N05: '' });
  });

  it('varios cuerpos distintos dan una fila cada uno', () => {
    const libres = [
      { pasillo: 'MZ01', columna: 1, nivel: 'N01' },
      { pasillo: 'MZ02', columna: 3, nivel: 'N02' },
    ];
    const filas = agruparPosicionesLibresPorCuerpo(libres);
    expect(filas).toHaveLength(2);
  });
});
