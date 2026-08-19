import { describe, it, expect } from 'vitest';
import { empaquetarArticulos } from './empaquetarArticulos.js';
import { CAPACIDAD_UTIL_NIVEL_M3, CAPACIDAD_UTIL_CUERPO_M3 } from './construirUniversoDeHuecos.js';

function cuerpo(pasillo, columna) { return { pasillo, columna }; }
function articulo(articulo, volumenM3, clase = 'C') { return { articulo, volumenM3, clase }; }

describe('empaquetarArticulos -- casos borde', () => {
  it('un artículo sin dimensiones (volumenM3 null) queda sin asignar con motivo explícito, nunca se le asume volumen 0', () => {
    const { asignaciones, sinAsignar } = empaquetarArticulos([articulo('A1', null)], [cuerpo('MZ01', 1)]);
    expect(asignaciones).toHaveLength(0);
    expect(sinAsignar).toEqual([{ articulo: 'A1', motivo: 'sin_dimensiones_importadas' }]);
  });

  it('un artículo con volumenM3 = NaN (dato corrupto, no null) también queda sin asignar con motivo explícito, nunca desaparece en silencio (bug real 2026-08-12: NaN no cae en "grandes" ni en "chicos" porque NaN > x y NaN <= x son ambos false)', () => {
    const { asignaciones, sinAsignar } = empaquetarArticulos([articulo('A1', NaN)], [cuerpo('MZ01', 1)]);
    expect(asignaciones).toHaveLength(0);
    expect(sinAsignar).toEqual([{ articulo: 'A1', motivo: 'sin_dimensiones_importadas' }]);
  });

  it('un artículo que no entra ni en un cuerpo completo queda sin asignar, nunca crashea', () => {
    const { asignaciones, sinAsignar } = empaquetarArticulos([articulo('GIGANTE', CAPACIDAD_UTIL_CUERPO_M3 + 0.5)], [cuerpo('MZ01', 1)]);
    expect(asignaciones).toHaveLength(0);
    expect(sinAsignar).toEqual([{ articulo: 'GIGANTE', motivo: 'excede_capacidad_maxima_de_un_cuerpo' }]);
  });

  it('un artículo más grande que un nivel pero que entra en un cuerpo se asigna a nivel "CUERPO"', () => {
    const { asignaciones } = empaquetarArticulos([articulo('GRANDE', CAPACIDAD_UTIL_NIVEL_M3 + 0.1)], [cuerpo('MZ01', 1)]);
    expect(asignaciones).toHaveLength(1);
    expect(asignaciones[0]).toMatchObject({ articulo: 'GRANDE', pasillo: 'MZ01', columna: 1, nivel: 'CUERPO' });
  });

  it('un artículo chico se asigna a un NIVEL, no a un cuerpo completo', () => {
    const { asignaciones } = empaquetarArticulos([articulo('CHICO', 0.01)], [cuerpo('MZ01', 1)]);
    expect(asignaciones[0].nivel).not.toBe('CUERPO');
    expect(['N01', 'N02', 'N03', 'N04', 'N05']).toContain(asignaciones[0].nivel);
  });

  it('un cuerpo consumido por un artículo grande NO ofrece sus niveles a artículos chicos (exclusividad física del rack)', () => {
    const { asignaciones, sinAsignar } = empaquetarArticulos(
      [articulo('GRANDE', CAPACIDAD_UTIL_NIVEL_M3 + 0.1), articulo('CHICO', 0.01)],
      [cuerpo('MZ01', 1)], // un solo cuerpo en todo el universo
    );
    const grande = asignaciones.find(a => a.articulo === 'GRANDE');
    expect(grande.nivel).toBe('CUERPO');
    expect(asignaciones.find(a => a.articulo === 'CHICO')).toBeUndefined();
    expect(sinAsignar).toEqual([{ articulo: 'CHICO', motivo: 'sin_hueco_disponible' }]);
  });

  it('agota el universo respetando el máximo de 4 distintos por nivel -- el 21° artículo distinto (1 cuerpo = 5 niveles x 4) queda sin asignar', () => {
    const articulos = Array.from({ length: 21 }, (_, i) => articulo(`A${i}`, 0.001));
    const { asignaciones, sinAsignar } = empaquetarArticulos(articulos, [cuerpo('MZ01', 1)]);
    expect(asignaciones).toHaveLength(20);
    expect(sinAsignar).toHaveLength(1);
    expect(sinAsignar[0].motivo).toBe('sin_hueco_disponible');
  });

  it('es determinístico -- misma entrada, mismo resultado exacto en dos corridas', () => {
    const articulos = [articulo('A1', 0.3), articulo('A2', 0.1), articulo('A3', 1.5)];
    const cuerpos = [cuerpo('MZ01', 1), cuerpo('MZ01', 2), cuerpo('MZ02', 1)];
    const r1 = empaquetarArticulos(articulos, cuerpos);
    const r2 = empaquetarArticulos(articulos, cuerpos);
    expect(r1).toEqual(r2);
  });
});

describe('empaquetarArticulos -- zonas de accesibilidad (pedido explícito: "todos los espacios son útiles" salvo las zonas confirmadas)', () => {
  it('evita MZ01-C001 cuando hay una alternativa igual de válida', () => {
    const cuerpos = [cuerpo('MZ01', 1), cuerpo('MZ04', 30)];
    const { asignaciones } = empaquetarArticulos([articulo('A1', 0.01)], cuerpos);
    expect(asignaciones[0].pasillo).not.toBe('MZ01');
  });

  it('evita MZ10/MZ11/MZ12 cuando hay una alternativa', () => {
    const cuerpos = [cuerpo('MZ11', 2), cuerpo('MZ03', 30)];
    const { asignaciones } = empaquetarArticulos([articulo('A1', 0.01)], cuerpos);
    expect(asignaciones[0].pasillo).toBe('MZ03');
  });

  it('si NO hay alternativa, igual asigna en la zona a evitar en vez de dejarlo sin asignar (es preferencia, no bloqueo duro)', () => {
    const { asignaciones, sinAsignar } = empaquetarArticulos([articulo('A1', 0.01)], [cuerpo('MZ10', 1)]);
    expect(sinAsignar).toHaveLength(0);
    expect(asignaciones[0].pasillo).toBe('MZ10');
  });

  it('prefiere la zona accesible general (columnas 9-19 de MZ01-08) por sobre una columna fuera de esa zona, para cualquier clase', () => {
    const cuerpos = [cuerpo('MZ05', 12), cuerpo('MZ05', 30)];
    const { asignaciones } = empaquetarArticulos([articulo('A1', 0.01, 'D')], cuerpos);
    expect(asignaciones[0].columna).toBe(12);
  });

  it('un artículo clase A prefiere la zona óptima (MZ02, 19-27) por sobre la zona accesible general', () => {
    const cuerpos = [cuerpo('MZ02', 23), cuerpo('MZ05', 12)];
    const { asignaciones } = empaquetarArticulos([articulo('A1', 0.01, 'A')], cuerpos);
    expect(asignaciones[0]).toMatchObject({ pasillo: 'MZ02', columna: 23 });
  });
});
