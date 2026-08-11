import { describe, it, expect } from 'vitest';
import { mejorarPorSwaps } from './mejorarPorSwaps.js';
import { calcularMetricasGlobales } from './calcularMetricasGlobales.js';

function articulo(articulo, volumenM3, clase, picksNormalizado = 0) { return { articulo, volumenM3, clase, picksNormalizado }; }
function asignacion(articulo, pasillo, columna, nivel) { return { articulo, pasillo, columna, nivel } }
function cuerpo(pasillo, columna) { return { pasillo, columna }; }

describe('mejorarPorSwaps -- reubicación (prioridad 1, más barata)', () => {
  it('reubica un clase A fuera de la óptima a un hueco LIBRE de la óptima, sin desplazar a nadie', () => {
    const articulos = [articulo('A_AFUERA', 0.01, 'A', 0.5)];
    const asignaciones = [asignacion('A_AFUERA', 'MZ05', 12, 'N01')]; // zona accesible general
    // cuerpos incluye un cuerpo de la zona óptima que NUNCA aparece en `asignaciones` -- completamente libre
    const cuerpos = [cuerpo('MZ02', 20)];
    const calcularMetricas = (asigs) => calcularMetricasGlobales(asigs, articulos, { umbralAltaFrecuencia: 0.9 });
    const { asignaciones: resultado, auditoria } = mejorarPorSwaps(asignaciones, articulos, cuerpos, { calcularMetricas, umbralAltaFrecuencia: 0.9 });

    expect(resultado.find(a => a.articulo === 'A_AFUERA').pasillo).toBe('MZ02');
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].tipo).toBe('reubicacion');
    expect(auditoria[0].articulo).toBe('A_AFUERA');
  });

  it('prefiere reubicar antes que hacer un swap, si hay un hueco libre disponible', () => {
    const articulos = [
      articulo('A_AFUERA', 0.01, 'A', 0.5),
      articulo('C_ADENTRO', 0.01, 'C', 0), // ocupa un lugar en la óptima -- NO debería tocarse
    ];
    const asignaciones = [
      asignacion('A_AFUERA', 'MZ05', 12, 'N01'),
      asignacion('C_ADENTRO', 'MZ02', 20, 'N01'),
    ];
    const cuerpos = [cuerpo('MZ02', 20), cuerpo('MZ02', 21)]; // columna 21 -- libre del todo
    const calcularMetricas = (asigs) => calcularMetricasGlobales(asigs, articulos, { umbralAltaFrecuencia: 0.9 });
    const { asignaciones: resultado, auditoria } = mejorarPorSwaps(asignaciones, articulos, cuerpos, { calcularMetricas, umbralAltaFrecuencia: 0.9 });

    expect(auditoria[0].tipo).toBe('reubicacion');
    // C_ADENTRO nunca se movió -- sigue exactamente en el mismo hueco (sus
    // campos derivados -- costo/afinidad/etc. -- sí se recalculan al final,
    // ver recalcularCamposDerivados en mejorarPorSwaps.js)
    const cAdentro = resultado.find(a => a.articulo === 'C_ADENTRO');
    expect(cAdentro.pasillo).toBe('MZ02');
    expect(cAdentro.columna).toBe(20);
    expect(cAdentro.nivel).toBe('N01');
  });
});

describe('mejorarPorSwaps -- swap (respaldo cuando no hay hueco libre)', () => {
  it('intercambia un clase A fuera de la óptima con un no-prioritario adentro, si mejora el cumplimiento', () => {
    const articulos = [
      articulo('A_AFUERA', 0.01, 'A', 0.5), // clase A pero está en zona accesible general, no en la óptima
      articulo('C_ADENTRO', 0.01, 'C', 0), // no prioritario, ocupa un lugar en la óptima
    ];
    const asignaciones = [
      asignacion('A_AFUERA', 'MZ05', 12, 'N01'), // zona accesible general
      asignacion('C_ADENTRO', 'MZ02', 20, 'N01'), // zona óptima
    ];
    const calcularMetricas = (asigs) => calcularMetricasGlobales(asigs, articulos, { umbralAltaFrecuencia: 0.9 });
    const { asignaciones: resultado, auditoria } = mejorarPorSwaps(asignaciones, articulos, [], { calcularMetricas, umbralAltaFrecuencia: 0.9 });

    const aFinal = resultado.find(a => a.articulo === 'A_AFUERA');
    expect(aFinal.pasillo).toBe('MZ02');
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].tipo).toBe('swap');
    expect(auditoria[0].candidato).toBe('A_AFUERA');
    expect(auditoria[0].ocupante).toBe('C_ADENTRO');
  });

  it('no ejecuta un swap si no mejora ninguna métrica (ej. ambos ya están donde corresponde)', () => {
    const articulos = [articulo('A1', 0.01, 'A', 0.5), articulo('D1', 0.01, 'D', 0.5)];
    const asignaciones = [asignacion('A1', 'MZ02', 20, 'N01'), asignacion('D1', 'MZ05', 12, 'N01')];
    const calcularMetricas = (asigs) => calcularMetricasGlobales(asigs, articulos, { umbralAltaFrecuencia: 0.9 });
    const { asignaciones: resultado, auditoria } = mejorarPorSwaps(asignaciones, articulos, [], { calcularMetricas });
    expect(auditoria).toHaveLength(0);
    expect(resultado).toEqual(asignaciones);
  });

  it('no ejecuta un swap si el ocupante no cabe físicamente en el hueco del candidato (respeta reglas duras)', () => {
    const articulos = [
      articulo('A_AFUERA', 0.01, 'A', 0.5),
      articulo('C_GRANDE', 0.42, 'C', 0), // casi toda la capacidad de un nivel
    ];
    const asignaciones = [
      asignacion('A_AFUERA', 'MZ05', 12, 'N01'),
      asignacion('C_GRANDE', 'MZ02', 20, 'N01'),
    ];
    // A_AFUERA es diminuto, entraría fácil en el nivel de C_GRANDE -- pero C_GRANDE (0.42) puede no
    // entrar en el nivel de A_AFUERA si ya tiene otro ocupante que lo deje sin espacio.
    const articulosConTercero = [...articulos, articulo('YA_ESTABA', 0.05, 'D', 0)];
    const asignacionesConTercero = [...asignaciones, asignacion('YA_ESTABA', 'MZ05', 12, 'N01')];
    const calcularMetricas = (asigs) => calcularMetricasGlobales(asigs, articulosConTercero);
    const { asignaciones: resultado } = mejorarPorSwaps(asignacionesConTercero, articulosConTercero, [], { calcularMetricas });
    const cGrande = resultado.find(a => a.articulo === 'C_GRANDE');
    // 0.42 (C_GRANDE) + 0.05 (YA_ESTABA) > capacidad de un nivel -- el swap NO debe ejecutarse
    expect(cGrande.pasillo).toBe('MZ02');
  });

  it('cada swap ejecutado queda registrado en auditoria con métricas antes/después', () => {
    const articulos = [articulo('A1', 0.01, 'A', 0.9), articulo('D1', 0.01, 'D', 0)];
    const asignaciones = [asignacion('A1', 'MZ05', 12, 'N01'), asignacion('D1', 'MZ02', 20, 'N01')];
    const calcularMetricas = (asigs) => calcularMetricasGlobales(asigs, articulos, { umbralAltaFrecuencia: 0.5 });
    const { auditoria } = mejorarPorSwaps(asignaciones, articulos, [], { calcularMetricas, umbralAltaFrecuencia: 0.5 });
    expect(auditoria[0]).toHaveProperty('metricasAntes');
    expect(auditoria[0]).toHaveProperty('metricasDespues');
    expect(auditoria[0].metricasDespues.tasaClaseAEnOptima).toBeGreaterThan(auditoria[0].metricasAntes.tasaClaseAEnOptima);
  });

  it('sin candidatos o sin ocupantes desplazables, no hace nada y no rompe', () => {
    const articulos = [articulo('A1', 0.01, 'A', 0.5)];
    const asignaciones = [asignacion('A1', 'MZ02', 20, 'N01')]; // ya está donde debe
    const calcularMetricas = (asigs) => calcularMetricasGlobales(asigs, articulos);
    const { asignaciones: resultado, auditoria } = mejorarPorSwaps(asignaciones, articulos, [], { calcularMetricas });
    expect(auditoria).toEqual([]);
    expect(resultado).toEqual(asignaciones);
  });
});
