import { describe, it, expect } from 'vitest';
import { evaluarReglas, MAX_ARTICULOS_DISTINTOS_POR_NIVEL, EXCEPCIONES_CAPACIDAD_CUERPO } from './reglasDistribucion.js';

function bin({ tipo = 'NIVEL', capacidadUtil = 0.4212, volumenOcupado = 0, articulosDistintos = new Set() } = {}) {
  return { tipo, capacidadUtil, volumenOcupado, articulosDistintos };
}
function articulo({ articulo = 'A1', volumenM3 = 0.1, clase = 'A' } = {}) {
  return { articulo, volumenM3, clase };
}

describe('evaluarReglas -- capacidad_hueco', () => {
  it('cumple si el volumen total entra en la capacidad útil (borde exacto)', () => {
    const { cumpleTodasLasDuras } = evaluarReglas(bin({ capacidadUtil: 0.5, volumenOcupado: 0.3 }), articulo({ volumenM3: 0.2 }));
    expect(cumpleTodasLasDuras).toBe(true);
  });

  it('no cumple si el volumen total supera la capacidad útil aunque sea por muy poco', () => {
    const { cumpleTodasLasDuras } = evaluarReglas(bin({ capacidadUtil: 0.5, volumenOcupado: 0.3 }), articulo({ volumenM3: 0.2001 }));
    expect(cumpleTodasLasDuras).toBe(false);
  });

  it('excepción puntual 2026-08-11 (7501137): usa la capacidad de referencia completa (2.16 m3), no la útil (2.106), solo para ese artículo', () => {
    const cuerpo = bin({ tipo: 'CUERPO', capacidadUtil: 2.106, volumenOcupado: 0 });
    const { cumpleTodasLasDuras: conExcepcion } = evaluarReglas(cuerpo, articulo({ articulo: '7501137', volumenM3: 2.16 }));
    expect(conExcepcion).toBe(true); // sin la excepción, 2.16 > 2.106 (capacidadUtil) fallaría -- la excepción es lo que lo hace pasar
    expect(EXCEPCIONES_CAPACIDAD_CUERPO['7501137']).toBeCloseTo(2.16, 2);
  });

  it('sin excepción, otro artículo con el mismo volumen (2.16) NO entra en la capacidad útil normal (2.106)', () => {
    const cuerpo = bin({ tipo: 'CUERPO', capacidadUtil: 2.106, volumenOcupado: 0 });
    const { cumpleTodasLasDuras } = evaluarReglas(cuerpo, articulo({ articulo: 'OTRO_ARTICULO', volumenM3: 2.16 }));
    expect(cumpleTodasLasDuras).toBe(false);
  });
});

describe('evaluarReglas -- max_articulos_distintos_por_nivel', () => {
  it(`no cumple si ya hay ${MAX_ARTICULOS_DISTINTOS_POR_NIVEL} artículos distintos y el nuevo es uno más, aunque sobre volumen`, () => {
    const nivel = bin({ tipo: 'NIVEL', capacidadUtil: 10, volumenOcupado: 0.01, articulosDistintos: new Set(['A1', 'A2', 'A3', 'A4']) });
    const { cumpleTodasLasDuras, resultados } = evaluarReglas(nivel, articulo({ articulo: 'A5', volumenM3: 0.01 }));
    expect(cumpleTodasLasDuras).toBe(false);
    expect(resultados.find(r => r.id === 'max_articulos_distintos_por_nivel').cumple).toBe(false);
  });

  it('cumple si el artículo YA está en ese nivel (no es un 5to distinto, es más cantidad del mismo)', () => {
    const nivel = bin({ tipo: 'NIVEL', capacidadUtil: 10, volumenOcupado: 0.01, articulosDistintos: new Set(['A1', 'A2', 'A3', 'A4']) });
    const { cumpleTodasLasDuras } = evaluarReglas(nivel, articulo({ articulo: 'A1', volumenM3: 0.01 }));
    expect(cumpleTodasLasDuras).toBe(true);
  });

  it('no aplica a un hueco tipo CUERPO (esa regla es específica de nivel)', () => {
    const cuerpo = bin({ tipo: 'CUERPO', capacidadUtil: 10, volumenOcupado: 0.01, articulosDistintos: new Set(['A1', 'A2', 'A3', 'A4', 'A5']) });
    const { resultados } = evaluarReglas(cuerpo, articulo({ articulo: 'A6', volumenM3: 0.01 }));
    expect(resultados.find(r => r.id === 'max_articulos_distintos_por_nivel').cumple).toBe(true);
  });
});
