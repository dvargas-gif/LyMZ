import { describe, it, expect } from 'vitest';
import { normalizarFilasPicks, parsearTextoPegado, calcularAnalisis } from './analisisPicks.js';

describe('normalizarFilasPicks', () => {
  it('reconoce encabezados flexibles y convierte picks/frecuencia a número', () => {
    const filas = normalizarFilasPicks([
      { Codigo: 'ABC1', Cantidad: '150', Prioridad: 'Alta' },
    ]);
    expect(filas).toEqual([
      { articulo: 'ABC1', nombre: '', cantidad_picks: 150, frecuencia: null, prioridad: 'Alta', periodo: null },
    ]);
  });

  it('descarta filas sin código de artículo', () => {
    expect(normalizarFilasPicks([{ Cantidad: '10' }])).toHaveLength(0);
  });

  it('cantidad_picks no numérica cae a 0 en vez de NaN', () => {
    const filas = normalizarFilasPicks([{ articulo: 'X1', cantidad: 'no-es-numero' }]);
    expect(filas[0].cantidad_picks).toBe(0);
  });
});

describe('parsearTextoPegado', () => {
  it('parsea texto separado por tabs con encabezado', () => {
    const filas = parsearTextoPegado('articulo\tpicks\nABC1\t100');
    expect(filas).toEqual([{ articulo: 'ABC1', picks: '100' }]);
  });

  it('parsea texto separado por comas si no hay tabs', () => {
    const filas = parsearTextoPegado('articulo,picks\nABC1,100');
    expect(filas).toEqual([{ articulo: 'ABC1', picks: '100' }]);
  });

  it('devuelve [] si no hay al menos encabezado + una fila', () => {
    expect(parsearTextoPegado('solo-encabezado')).toEqual([]);
    expect(parsearTextoPegado('')).toEqual([]);
  });
});

describe('calcularAnalisis', () => {
  // Pareto clásico: Alta <=80% acumulado, Media <=95%, Baja el resto.
  const picks = [
    { articulo: 'A1', nombre: '', cantidad_picks: 800, frecuencia: 0, prioridad: null, periodo: null },
    { articulo: 'A2', nombre: '', cantidad_picks: 150, frecuencia: 0, prioridad: null, periodo: null },
    { articulo: 'A3', nombre: '', cantidad_picks: 40, frecuencia: 0, prioridad: null, periodo: null },
    { articulo: 'A4', nombre: '', cantidad_picks: 10, frecuencia: 0, prioridad: null, periodo: null },
  ];
  const posiciones = [
    { articulo: 'A1', pasillo: 'MZ01', columna: 1, clase: 'C' }, // alta rotación, mal clasificado
    { articulo: 'A2', pasillo: 'MZ02', columna: 2, clase: 'B' }, // media, coherente
    { articulo: 'A3', pasillo: 'MZ03', columna: 3, clase: 'A' }, // baja rotación pero clase A -> sobrevalorado
    // A4 sin posición -> "Sin ubicación"
  ];

  it('clasifica rotación Alta/Media/Baja por Pareto acumulado (80%/95%)', () => {
    const { filas } = calcularAnalisis(picks, posiciones);
    const porArticulo = Object.fromEntries(filas.map(f => [f.articulo, f]));
    expect(porArticulo.A1.rotacion).toBe('Alta');
    expect(porArticulo.A2.rotacion).toBe('Media');
    expect(porArticulo.A3.rotacion).toBe('Baja');
    expect(porArticulo.A4.rotacion).toBe('Baja');
  });

  it('detecta "Mal ubicado" (alta rotación, clase C/D) y sugiere la zona preferente', () => {
    const { filas } = calcularAnalisis(picks, posiciones);
    const a1 = filas.find(f => f.articulo === 'A1');
    expect(a1.estado).toBe('Mal ubicado');
    expect(a1.recomendacion).toMatch(/MZ03/); // única posición clase A -> zona preferente
  });

  it('detecta "Sobrevalorado" (baja rotación, clase A)', () => {
    const { filas } = calcularAnalisis(picks, posiciones);
    const a3 = filas.find(f => f.articulo === 'A3');
    expect(a3.estado).toBe('Sobrevalorado');
  });

  it('detecta "Sin ubicación" cuando el artículo no tiene posición', () => {
    const { filas } = calcularAnalisis(picks, posiciones);
    const a4 = filas.find(f => f.articulo === 'A4');
    expect(a4.estado).toBe('Sin ubicación');
    expect(a4.pasilloActual).toBeNull();
  });

  it('arma el resumen: total de picks, oportunidades de mejora y zona preferente', () => {
    const { resumen } = calcularAnalisis(picks, posiciones);
    expect(resumen.totalArticulos).toBe(4);
    expect(resumen.totalPicks).toBe(1000);
    expect(resumen.zonaPreferente).toBe('MZ03');
    expect(resumen.oportunidadesMejora).toBe(2); // Mal ubicado (A1) + Sobrevalorado (A3)
    expect(resumen.porRotacion).toEqual({ Alta: 1, Media: 1, Baja: 2 });
  });
});
