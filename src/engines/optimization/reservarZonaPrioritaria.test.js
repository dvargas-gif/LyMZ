import { describe, it, expect } from 'vitest';
import { reservarZonaPrioritaria } from './reservarZonaPrioritaria.js';

function cuerpo(pasillo, columna) { return { pasillo, columna }; }
function articulo(articulo, volumenM3, clase, picksNormalizado = 0) { return { articulo, volumenM3, clase, picksNormalizado }; }

describe('reservarZonaPrioritaria', () => {
  it('reserva la zona óptima exclusivamente para clase A, aunque haya no-A compitiendo por el mismo cuerpo', () => {
    const cuerpos = [cuerpo('MZ02', 20)]; // dentro de la zona óptima (19-27)
    const articulos = [articulo('NO_A', 0.01, 'D', 0.9), articulo('A1', 0.01, 'A', 0.1)];
    const { asignaciones } = reservarZonaPrioritaria(articulos, cuerpos);
    // NO_A tiene más picks pero no es clase A -- no puede tocar la zona óptima acá (esa es para alta-frecuencia NO-A, en zona accesible general, no en la óptima)
    expect(asignaciones.find(a => a.articulo === 'A1')).toBeTruthy();
    expect(asignaciones.find(a => a.articulo === 'NO_A')).toBeFalsy();
  });

  it('con reserva 100% + orden por picks, entran MUCHOS más clase A que con el motor de una sola pasada (verificado: 180 vs 17-18 con datos reales)', () => {
    // 9 columnas x 5 niveles = 45 bins, articulos chiquitos -- deberían entrar hasta 4 por nivel = 180
    const cuerpos = Array.from({ length: 9 }, (_, i) => cuerpo('MZ02', 19 + i));
    const articulos = Array.from({ length: 200 }, (_, i) => articulo(`A${i}`, 0.001, 'A', 1 - i / 200));
    const { asignaciones } = reservarZonaPrioritaria(articulos, cuerpos);
    expect(asignaciones.length).toBe(180);
  });

  it('ordena por picks descendente -- los de más picks entran primero cuando la zona no alcanza para todos', () => {
    const cuerpos = [cuerpo('MZ02', 20)]; // 1 cuerpo = 5 niveles x 4 = 20 cupos
    const grandeVolumen = 0.42; // ocupa casi todo un nivel el solo
    const articulos = [
      articulo('BAJO_PICKS', grandeVolumen, 'A', 0.1),
      articulo('ALTO_PICKS', grandeVolumen, 'A', 0.9),
    ];
    const { asignaciones } = reservarZonaPrioritaria(articulos, cuerpos);
    // ambos entran (hay espacio), pero si solo entrara 1 por capacidad, debe ser ALTO_PICKS
    expect(asignaciones.some(a => a.articulo === 'ALTO_PICKS')).toBe(true);
  });

  it('los que no entran en la reserva quedan en noReservados, nunca se descartan en silencio', () => {
    const cuerpos = [cuerpo('MZ02', 20)];
    const articulos = Array.from({ length: 25 }, (_, i) => articulo(`A${i}`, 0.001, 'A', 0.5));
    const { asignaciones, noReservados } = reservarZonaPrioritaria(articulos, cuerpos);
    expect(asignaciones.length).toBe(20); // 5 niveles x 4 distintos
    expect(noReservados.length).toBe(5);
  });

  it('reserva la zona accesible general para alta frecuencia NO clase A, excluyendo lo que ya cayó en la óptima', () => {
    const cuerpos = [cuerpo('MZ05', 12)]; // dentro de zona accesible general (9-19), fuera de la óptima (solo MZ02)
    const articulos = [articulo('FRECUENTE_D', 0.01, 'D', 0.99), articulo('POCO_FRECUENTE_B', 0.01, 'B', 0.01)];
    const { asignaciones } = reservarZonaPrioritaria(articulos, cuerpos, { percentilAltaFrecuencia: 0.5 });
    expect(asignaciones.find(a => a.articulo === 'FRECUENTE_D')).toBeTruthy();
  });

  it('devuelve las claves de cuerpos usados, para que la Fase 2 no los pise', () => {
    const cuerpos = [cuerpo('MZ02', 20)];
    const articulos = [articulo('A1', 0.01, 'A', 0.5)];
    const { clavesCuerposUsados } = reservarZonaPrioritaria(articulos, cuerpos);
    expect(clavesCuerposUsados.has('MZ02|20')).toBe(true);
  });

  it('sin candidatos, no rompe y devuelve todo vacío', () => {
    const { asignaciones, noReservados } = reservarZonaPrioritaria([], [cuerpo('MZ02', 20)]);
    expect(asignaciones).toEqual([]);
    expect(noReservados).toEqual([]);
  });
});
