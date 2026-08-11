import { construirUniversoDeHuecos } from './construirUniversoDeHuecos.js';
import { empaquetarDosFases } from './empaquetarDosFases.js';
import { mejorarPorSwaps } from './mejorarPorSwaps.js';
import { calcularMetricasGlobales } from './calcularMetricasGlobales.js';
import { construirDiffPropuesta } from './construirDiffPropuesta.js';

/**
 * Única función expuesta del motor de distribución -- (snapshot +
 * parámetros) entra, un objeto plano serializable sale. Sin
 * React/DOM/Supabase en ningún punto de la cadena que llama (Ley 7) --
 * movible a Web Worker sin reescritura (F5c).
 *
 * NUNCA escribe nada real -- devuelve una PROPUESTA. Aprobar/aplicar es
 * responsabilidad de la capa de servicio (fuera de este motor).
 *
 * Corrección de fondo 2026-08-10/11 (ver DECISIONES.md ADR-017): antes
 * llamaba al empaque de una sola pasada (generarCandidatosLayout), que
 * dejaba que artículos "grandes" se comieran los cuerpos completos de la
 * zona óptima y bloquearan a los cientos de clase A que sí debían entrar
 * por nivel -- el "techo físico" reportado no era físico, era el motor.
 * Ahora usa el motor de dos fases (Fase 1 reserva la zona óptima/accesible
 * EXCLUSIVAMENTE para sus beneficiarios reales por nivel, Fase 2 empaqueta
 * todo lo demás sobre lo que quedó libre) más un post-proceso de
 * reubicación/swap que rescata lo que quedó afuera de su zona sin empeorar
 * ninguna métrica de negocio (ver empaquetarDosFases.js/mejorarPorSwaps.js).
 *
 * @param {Array<{articulo, volumenM3, clase, picksNormalizado}>} articulos
 * @param {Map<string, {pasillo, columna, nivel}|null>} posicionActualPorArticulo
 * @param {{pasillos: Array<{pasillo, orientacion, ubicaciones: Array<{columna,x,y}>}>}} geometria -- geometriaMezanine.data.json ya validado
 * @param {object} opciones -- {zonas, pesos, reglas, percentilAltaFrecuencia} (todos opcionales, ver empaquetarDosFases/empaquetarArticulos/calcularAfinidadZonas)
 * @returns {{variante, metricas, swapsAplicados, diff, sinAsignar, resumen}}
 */
export function generarPropuestaDistribucion(articulos, posicionActualPorArticulo, geometria, opciones = {}) {
  const cuerpos = construirUniversoDeHuecos(geometria);

  const fases = empaquetarDosFases(articulos, cuerpos, opciones);
  const opcionesConUmbral = { ...opciones, umbralAltaFrecuencia: fases.umbralAltaFrecuencia };
  const calcularMetricas = asignaciones => calcularMetricasGlobales(asignaciones, articulos, opcionesConUmbral);
  const { asignaciones, auditoria: swapsAplicados } = mejorarPorSwaps(fases.asignaciones, articulos, cuerpos, { ...opcionesConUmbral, calcularMetricas });

  const diff = construirDiffPropuesta(asignaciones, posicionActualPorArticulo);
  const metricas = calcularMetricas(asignaciones);
  const totalMovimientos = diff.filter(d => d.cambiaUbicacion).length;

  return {
    // Sin competencia de variantes (eso era del motor de una sola pasada) --
    // se deja el campo para no romper el shape que espera
    // distribucionPropuesta.service.js (parametros.variante, trazabilidad).
    variante: 'dos_fases_con_reserva_y_swaps',
    resultadosPorVariante: null,
    metricas,
    swapsAplicados,
    diff,
    sinAsignar: fases.sinAsignar,
    resumen: {
      totalArticulos: articulos.length,
      totalAsignados: asignaciones.length,
      totalSinAsignar: fases.sinAsignar.length,
      totalMovimientos,
      utilizacionPromedio: metricas.densidadPonderada,
    },
  };
}
