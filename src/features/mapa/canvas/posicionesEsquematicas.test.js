import { describe, it, expect } from 'vitest';
import { calcularLayoutEsquematico, calcularEtiquetas, calcularCortesPasillo, COLUMNAS_POR_PASILLO, PASILLOS_VERTICALES } from './posicionesEsquematicas.js';

describe('calcularLayoutEsquematico', () => {
  it('genera una celda por columna real de cada uno de los 12 pasillos', () => {
    const celdas = calcularLayoutEsquematico();
    const total = Object.values(COLUMNAS_POR_PASILLO).reduce((s, n) => s + n, 0);
    expect(celdas).toHaveLength(total);
  });

  it('MZ11/MZ12 avanzan en Y (columnas apiladas verticalmente), no en X', () => {
    const celdas = calcularLayoutEsquematico();
    for (const pasillo of PASILLOS_VERTICALES) {
      const propias = celdas.filter(c => c.pasillo === pasillo);
      const xs = new Set(propias.map(c => c.x));
      expect(xs.size).toBe(1); // misma X para todas las columnas de este pasillo
      const ys = propias.map(c => c.y);
      expect(new Set(ys).size).toBe(propias.length); // cada columna con su propia Y
    }
  });

  it('los pasillos horizontales avanzan en X (columnas lado a lado), no en Y', () => {
    const celdas = calcularLayoutEsquematico();
    const propias = celdas.filter(c => c.pasillo === 'MZ01');
    const ys = new Set(propias.map(c => c.y));
    expect(ys.size).toBe(1);
    expect(new Set(propias.map(c => c.x)).size).toBe(propias.length);
  });

  it('no hay dos celdas superpuestas en el mismo x,y', () => {
    const celdas = calcularLayoutEsquematico();
    const claves = celdas.map(c => `${c.x}|${c.y}`);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe('calcularEtiquetas', () => {
  it('devuelve una etiqueta por cada uno de los 12 pasillos', () => {
    expect(calcularEtiquetas()).toHaveLength(12);
  });

  it('marca vertical:true solo para MZ11/MZ12', () => {
    const etiquetas = calcularEtiquetas();
    const verticales = etiquetas.filter(e => e.vertical).map(e => e.pasillo).sort();
    expect(verticales).toEqual([...PASILLOS_VERTICALES].sort());
  });
});

describe('calcularCortesPasillo', () => {
  it('MZ01 (27 columnas, corte corto) tiene cortes tras C007 y C022', () => {
    const cortes = calcularCortesPasillo().filter(c => c.pasillo === 'MZ01');
    expect(cortes).toHaveLength(2);
  });

  it('un pasillo de 36 columnas tiene cortes tras C009/C019/C026', () => {
    const cortes = calcularCortesPasillo().filter(c => c.pasillo === 'MZ02');
    expect(cortes).toHaveLength(3);
  });

  it('MZ08 (41 columnas reales, pero clase "larga" igual que sus vecinos) usa el MISMO patrón de cortes que MZ02-07 -- regresión del bug de desalineación reportado', () => {
    const mz02 = calcularCortesPasillo().filter(c => c.pasillo === 'MZ02');
    const mz08 = calcularCortesPasillo().filter(c => c.pasillo === 'MZ08');
    expect(mz08).toHaveLength(3);
    expect(mz08.map(c => c.x)).toEqual(mz02.map(c => c.x)); // mismas posiciones X -- las filas alinean
  });

  it('MZ09 (4 columnas) no llega a ningún corte -- ninguno de los dos criterios aplica con tan pocas columnas', () => {
    const cortes = calcularCortesPasillo().filter(c => c.pasillo === 'MZ09');
    expect(cortes).toHaveLength(0);
  });

  it('el corte cae DESPUÉS de la celda que lo dispara y ANTES de la siguiente, sin superponerse a ninguna celda real', () => {
    const celdas = calcularLayoutEsquematico();
    const cortes = calcularCortesPasillo();
    for (const corte of cortes) {
      const celdasDelPasillo = celdas.filter(c => c.pasillo === corte.pasillo);
      const seSuperpone = celdasDelPasillo.some(c => c.x < corte.x + corte.ancho && c.x + c.ancho > corte.x);
      expect(seSuperpone).toBe(false);
    }
  });
});
