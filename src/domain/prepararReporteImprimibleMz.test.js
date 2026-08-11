import { describe, it, expect } from 'vitest';
import { prepararReporteImprimibleMz } from './prepararReporteImprimibleMz.js';

function racksDe(entradas) {
  return new Map(entradas.map(([clave, valor]) => [clave, valor]));
}

describe('prepararReporteImprimibleMz', () => {
  it('un pasillo sin ningún rack devuelve todas las columnas con niveles vacíos', () => {
    const [reporte] = prepararReporteImprimibleMz(racksDe([]), [{ pasillo: 'MZ01', columnas: 2 }]);
    expect(reporte.pasillo).toBe('MZ01');
    expect(reporte.filas).toHaveLength(2);
    expect(reporte.filas[0].columna).toBe(1);
    expect(reporte.filas[0].niveles.every(n => n.codigos.length === 0)).toBe(true);
  });

  it('los niveles van de arriba (N05) a abajo (N01)', () => {
    const [reporte] = prepararReporteImprimibleMz(racksDe([]), [{ pasillo: 'MZ01', columnas: 1 }]);
    expect(reporte.filas[0].niveles.map(n => n.nivel)).toEqual(['N05', 'N04', 'N03', 'N02', 'N01']);
  });

  it('un nivel NORMAL ocupado lista sus códigos, el resto de niveles de esa columna siguen vacíos', () => {
    const racks = racksDe([
      ['MZ01|3', { pasillo: 'MZ01', columna: 3, niveles: { N02: [{ articulo: 'A1' }, { articulo: 'A2' }] } }],
    ]);
    const [reporte] = prepararReporteImprimibleMz(racks, [{ pasillo: 'MZ01', columnas: 3 }]);
    const columna3 = reporte.filas.find(f => f.columna === 3);
    expect(columna3.niveles.find(n => n.nivel === 'N02').codigos).toEqual(['A1', 'A2']);
    expect(columna3.niveles.find(n => n.nivel === 'N01').codigos).toEqual([]);
  });

  it('un rack tipo CUERPO ocupa los 5 niveles con los mismos códigos', () => {
    const racks = racksDe([
      ['MZ04|5', { pasillo: 'MZ04', columna: 5, niveles: { CUERPO: [{ articulo: 'B1' }] } }],
    ]);
    const [reporte] = prepararReporteImprimibleMz(racks, [{ pasillo: 'MZ04', columnas: 5 }]);
    const columna5 = reporte.filas.find(f => f.columna === 5);
    expect(columna5.niveles.every(n => n.codigos.length === 1 && n.codigos[0] === 'B1')).toBe(true);
  });

  it('varios pasillos se procesan de forma independiente', () => {
    const reporte = prepararReporteImprimibleMz(racksDe([]), [
      { pasillo: 'MZ01', columnas: 2 },
      { pasillo: 'MZ02', columnas: 3 },
    ]);
    expect(reporte).toHaveLength(2);
    expect(reporte[1].pasillo).toBe('MZ02');
    expect(reporte[1].filas).toHaveLength(3);
  });
});
