import { describe, it, expect } from 'vitest';
import { detectarSobrecarga } from './detectarSobrecargaRacks.js';
import { VOLUMEN_NIVEL_REFERENCIA_M3, VOLUMEN_CUERPO_REFERENCIA_M3 } from './reglasAsignacionCuerpo.js';

function filaCuerpo(articulo, pasillo, columna) {
  return { articulo, pasillo, columna, nivel: 'CUERPO', tipo: 'CUERPO' };
}
function filaNivel(articulo, pasillo, columna, nivel) {
  return { articulo, pasillo, columna, nivel, tipo: 'NORMAL' };
}
function dimension(articulo, volumenM3) {
  return { articulo, volumenM3 };
}

describe('detectarSobrecarga -- cuerpos (tipo CUERPO, capacidad 2.16 m³)', () => {
  it('un solo artículo por debajo de la capacidad del cuerpo -- no reporta nada', () => {
    const slotting = [filaCuerpo('A1', 'MZ01', 5)];
    const dimensiones = [dimension('A1', 1.5)];
    expect(detectarSobrecarga(slotting, dimensiones)).toHaveLength(0);
  });

  it('un solo artículo que EXCEDE la capacidad del cuerpo -- reporta sobrecarga', () => {
    const slotting = [filaCuerpo('A1', 'MZ01', 5)];
    const dimensiones = [dimension('A1', 3.0)];
    const resultado = detectarSobrecarga(slotting, dimensiones);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ pasillo: 'MZ01', columna: 5, nivel: 'CUERPO', volumenTotal: 3.0, capacidad: VOLUMEN_CUERPO_REFERENCIA_M3 });
    expect(resultado[0].porcentaje).toBeCloseTo(3.0 / VOLUMEN_CUERPO_REFERENCIA_M3, 6);
  });

  it('exactamente al límite (100%) NO es sobrecarga -- el límite es "supera", no "alcanza"', () => {
    const slotting = [filaCuerpo('A1', 'MZ01', 5)];
    const dimensiones = [dimension('A1', VOLUMEN_CUERPO_REFERENCIA_M3)];
    expect(detectarSobrecarga(slotting, dimensiones)).toHaveLength(0);
  });

  it('VARIOS artículos compartiendo el mismo cuerpo -- suma sus volúmenes (a diferencia de reglasAsignacionCuerpo.js, acá SÍ aplica)', () => {
    const slotting = [filaCuerpo('A1', 'MZ01', 5), filaCuerpo('A2', 'MZ01', 5), filaCuerpo('A3', 'MZ01', 5)];
    const dimensiones = [dimension('A1', 0.9), dimension('A2', 0.9), dimension('A3', 0.9)]; // suma 2.7 > 2.16
    const resultado = detectarSobrecarga(slotting, dimensiones);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].volumenTotal).toBeCloseTo(2.7, 6);
    expect(resultado[0].articulos.sort()).toEqual(['A1', 'A2', 'A3']);
  });
});

describe('detectarSobrecarga -- niveles individuales (tipo distinto de CUERPO, capacidad 0.432 m³ por nivel)', () => {
  it('un nivel con un solo artículo dentro de capacidad -- no reporta nada', () => {
    const slotting = [filaNivel('A1', 'MZ02', 10, 'N01')];
    const dimensiones = [dimension('A1', 0.2)];
    expect(detectarSobrecarga(slotting, dimensiones)).toHaveLength(0);
  });

  it('dos artículos en el MISMO nivel cuya suma supera la capacidad del nivel -- reporta ese nivel puntual', () => {
    const slotting = [filaNivel('A1', 'MZ02', 10, 'N01'), filaNivel('A2', 'MZ02', 10, 'N01')];
    const dimensiones = [dimension('A1', 0.3), dimension('A2', 0.25)]; // suma 0.55 > 0.432
    const resultado = detectarSobrecarga(slotting, dimensiones);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ pasillo: 'MZ02', columna: 10, nivel: 'N01', capacidad: VOLUMEN_NIVEL_REFERENCIA_M3 });
  });

  it('otros niveles del MISMO rack no se contaminan entre sí -- cada nivel es su propio hueco', () => {
    const slotting = [
      filaNivel('A1', 'MZ02', 10, 'N01'), filaNivel('A2', 'MZ02', 10, 'N01'), // sobrecargado
      filaNivel('A3', 'MZ02', 10, 'N02'), // dentro de capacidad
    ];
    const dimensiones = [dimension('A1', 0.3), dimension('A2', 0.25), dimension('A3', 0.1)];
    const resultado = detectarSobrecarga(slotting, dimensiones);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nivel).toBe('N01');
  });
});

describe('detectarSobrecarga -- casos generales', () => {
  it('no asume nada si el artículo no tiene dimensiones importadas -- ese artículo no suma', () => {
    const slotting = [filaCuerpo('SIN-DIMENSION', 'MZ01', 5)];
    expect(detectarSobrecarga(slotting, [])).toHaveLength(0);
  });

  it('artículo sin dimensión conviviendo con uno sí sobrecargado -- solo el conocido cuenta, pero igual puede alcanzar para reportar', () => {
    const slotting = [filaCuerpo('A1', 'MZ01', 5), filaCuerpo('SIN-DIMENSION', 'MZ01', 5)];
    const dimensiones = [dimension('A1', 3.0)];
    const resultado = detectarSobrecarga(slotting, dimensiones);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].articulos).toEqual(['A1']); // el artículo sin dimensión ni aparece en la lista
  });

  it('ordena del más sobrecargado (mayor % sobre capacidad) al menos', () => {
    const slotting = [filaCuerpo('A1', 'MZ01', 1), filaCuerpo('A2', 'MZ01', 2)];
    const dimensiones = [dimension('A1', 2.5), dimension('A2', 4.0)]; // A2 más sobrecargado
    const resultado = detectarSobrecarga(slotting, dimensiones);
    expect(resultado.map(r => r.columna)).toEqual([2, 1]);
  });

  it('un rack sin ninguna fila de inventario no aparece (nada que evaluar)', () => {
    expect(detectarSobrecarga([], [])).toHaveLength(0);
  });
});
