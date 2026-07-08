import { describe, it, expect } from 'vitest';
import { calcularVistaAjustada, calcularVistaCentradaEnCelda, easeOutCubic, interpolarVista } from './vistaMapa.js';

describe('calcularVistaAjustada', () => {
  it('usa el eje más restrictivo para que TODO el layout entre en pantalla', () => {
    const limites = { ancho: 1000, alto: 500 };
    const tamano = { ancho: 800, alto: 800 }; // el ancho es el eje restrictivo (1000 vs 500 escalados)
    const vista = calcularVistaAjustada(limites, tamano, 1);
    expect(vista.escala).toBeCloseTo(0.8, 5); // 800/1000
  });

  it('centra el layout dentro del viewport (no solo lo pega arriba-izquierda)', () => {
    const limites = { ancho: 100, alto: 100 };
    const tamano = { ancho: 200, alto: 200 };
    const vista = calcularVistaAjustada(limites, tamano, 1);
    // escala=2, el centro del layout (50,50) debe caer en el centro del viewport (100,100)
    expect(vista.x + 50 * vista.escala).toBeCloseTo(100, 5);
    expect(vista.y + 50 * vista.escala).toBeCloseTo(100, 5);
  });

  it('el margen deja aire alrededor -- escala menor que el ajuste exacto', () => {
    const limites = { ancho: 1000, alto: 1000 };
    const tamano = { ancho: 1000, alto: 1000 };
    const vista = calcularVistaAjustada(limites, tamano, 0.9);
    expect(vista.escala).toBeCloseTo(0.9, 5);
  });
});

describe('calcularVistaCentradaEnCelda', () => {
  it('centra la celda encontrada en el medio del viewport, a la escala pedida', () => {
    const celda = { x: 100, y: 200, ancho: 44, alto: 40 };
    const tamano = { ancho: 800, alto: 600 };
    const vista = calcularVistaCentradaEnCelda(celda, tamano, 1.5);
    const centroCeldaX = 100 + 22, centroCeldaY = 200 + 20;
    expect(vista.x + centroCeldaX * 1.5).toBeCloseTo(400, 5);
    expect(vista.y + centroCeldaY * 1.5).toBeCloseTo(300, 5);
    expect(vista.escala).toBe(1.5);
  });
});

describe('easeOutCubic', () => {
  it('empieza en 0 y termina en 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('desacelera -- a mitad de tiempo ya recorrió más de la mitad del camino', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('interpolarVista', () => {
  it('en progreso 0 devuelve el punto de partida', () => {
    const desde = { x: 0, y: 0, escala: 1 };
    const hasta = { x: 100, y: 200, escala: 2 };
    expect(interpolarVista(desde, hasta, 0)).toEqual({ x: 0, y: 0, escala: 1 });
  });

  it('en progreso 1 devuelve el destino exacto', () => {
    const desde = { x: 0, y: 0, escala: 1 };
    const hasta = { x: 100, y: 200, escala: 2 };
    expect(interpolarVista(desde, hasta, 1)).toEqual({ x: 100, y: 200, escala: 2 });
  });

  it('clampea progresos fuera de [0,1]', () => {
    const desde = { x: 0, y: 0, escala: 1 };
    const hasta = { x: 100, y: 100, escala: 2 };
    expect(interpolarVista(desde, hasta, -1)).toEqual(interpolarVista(desde, hasta, 0));
    expect(interpolarVista(desde, hasta, 5)).toEqual(interpolarVista(desde, hasta, 1));
  });
});
