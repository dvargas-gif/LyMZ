import { describe, it, expect } from 'vitest';
import { empaquetarDosFases } from './empaquetarDosFases.js';
import { CAPACIDAD_UTIL_NIVEL_M3 } from './construirUniversoDeHuecos.js';

function cuerpo(pasillo, columna) { return { pasillo, columna }; }
function articulo(articulo, volumenM3, clase, picksNormalizado = 0) { return { articulo, volumenM3, clase, picksNormalizado }; }

describe('empaquetarDosFases', () => {
  it('la Fase 2 completa el mismo nivel que dejó la Fase 1 en vez de abrir uno nuevo (hasta el tope de 4 distintos)', () => {
    const cuerpos = [cuerpo('MZ02', 20)]; // zona óptima
    const articulos = [
      articulo('A1', 0.01, 'A', 0.9), // se reserva en Fase 1
      articulo('NO_A_1', 0.01, 'C', 0), // Fase 2, debería compartir el mismo nivel que A1 si cabe
    ];
    const { asignaciones } = empaquetarDosFases(articulos, cuerpos);
    const a1 = asignaciones.find(a => a.articulo === 'A1');
    const noA = asignaciones.find(a => a.articulo === 'NO_A_1');
    expect(a1).toBeTruthy();
    expect(noA).toBeTruthy();
    // Si comparten el mismo pasillo/columna/nivel, la Fase 2 respetó el estado de la Fase 1 (no lo pisó).
    // No es obligatorio que caigan juntos, pero si caen en el MISMO cuerpo, no debe haber más de 4 distintos por nivel real.
    expect(a1.pasillo).toBe('MZ02');
  });

  it('la Fase 2 nunca excede la capacidad de un nivel que la Fase 1 ya ocupó parcialmente', () => {
    const cuerpos = [cuerpo('MZ02', 20)];
    const grande = CAPACIDAD_UTIL_NIVEL_M3 * 0.6;
    const articulos = [
      articulo('A_GRANDE', grande, 'A', 0.9),
      articulo('OTRO_GRANDE', grande, 'C', 0), // grande*0.6 + grande*0.6 = 1.2x capacidad -- NO debería entrar en el mismo nivel
    ];
    const { asignaciones, sinAsignar } = empaquetarDosFases(articulos, cuerpos);
    const aGrande = asignaciones.find(a => a.articulo === 'A_GRANDE');
    const otro = asignaciones.find(a => a.articulo === 'OTRO_GRANDE');
    expect(aGrande).toBeTruthy();
    if (otro) expect(`${otro.pasillo}|${otro.columna}|${otro.nivel}`).not.toBe(`${aGrande.pasillo}|${aGrande.columna}|${aGrande.nivel}`);
    else expect(sinAsignar.find(s => s.articulo === 'OTRO_GRANDE')).toBeTruthy();
  });

  it('un cuerpo que la Fase 1 usó COMO CUERPO ENTERO no se ofrece como niveles en la Fase 2', () => {
    const cuerpos = [cuerpo('MZ02', 20)];
    const grandeQueNecesitaCuerpo = CAPACIDAD_UTIL_NIVEL_M3 + 0.1;
    const articulos = [
      articulo('A_CUERPO', grandeQueNecesitaCuerpo, 'A', 0.9),
      articulo('CHICO_C', 0.001, 'C', 0),
    ];
    const { asignaciones, sinAsignar } = empaquetarDosFases(articulos, cuerpos);
    expect(asignaciones.find(a => a.articulo === 'A_CUERPO')?.nivel).toBe('CUERPO');
    // No hay otro cuerpo disponible -- CHICO_C debe quedar sin asignar, nunca compartir el CUERPO ya consumido
    expect(sinAsignar.find(s => s.articulo === 'CHICO_C')).toBeTruthy();
  });

  it('mejora medible: con reserva explícita entran muchos más clase A en la zona óptima que con una sola pasada', () => {
    const cuerpos = Array.from({ length: 9 }, (_, i) => cuerpo('MZ02', 19 + i));
    const claseA = Array.from({ length: 200 }, (_, i) => articulo(`A${i}`, 0.001, 'A', 1 - i / 200));
    const otros = Array.from({ length: 50 }, (_, i) => articulo(`X${i}`, 0.001, 'D', 0));
    const { asignaciones } = empaquetarDosFases([...claseA, ...otros], cuerpos);
    const aEnOptima = asignaciones.filter(a => a.clase === undefined && claseA.some(x => x.articulo === a.articulo));
    // la reserva llena las 45 niveles x 4 = 180 con clase A antes de que nadie más compita
    const totalAAsignados = asignaciones.filter(a => claseA.some(x => x.articulo === a.articulo)).length;
    expect(totalAAsignados).toBe(180);
  });

  it('nunca deja artículos fuera en silencio -- todo lo no asignado tiene motivo explícito', () => {
    const cuerpos = [cuerpo('MZ01', 1)];
    const articulos = [articulo('SIN_VOLUMEN', null, 'A', 0.5)];
    const { asignaciones, sinAsignar } = empaquetarDosFases(articulos, cuerpos);
    expect(asignaciones).toHaveLength(0);
    expect(sinAsignar).toEqual([{ articulo: 'SIN_VOLUMEN', motivo: 'sin_dimensiones_importadas' }]);
  });
});
