import { CAPACIDAD_UTIL_NIVEL_M3, CAPACIDAD_UTIL_CUERPO_M3 } from './construirUniversoDeHuecos.js';
import { calcularAfinidadZonas, enRango, ZONA_ACCESIBLE_GENERAL, ZONA_OPTIMA_CLASE_A } from './calcularAfinidadZonas.js';
import { calcularAfinidadFrecuencia } from './calcularAfinidadFrecuencia.js';
import { evaluarReglas, MAX_ARTICULOS_DISTINTOS_POR_NIVEL, REGLAS_POR_DEFECTO } from './reglasDistribucion.js';
import { calcularCosto, PESOS_POR_DEFECTO } from './costoCandidato.js';

/**
 * Post-procesamiento de la Fase 2 (pedido explícito 2026-08-10, propuesto
 * por segunda opinión externa): dos operaciones, por artículo prioritario
 * que se quedó AFUERA de su zona (porque la reserva de la Fase 1 ya estaba
 * llena) --
 *
 * 1) REUBICACIÓN (más barata, se intenta primero): moverlo a un hueco de la
 *    zona con lugar de sobra (incluyendo huecos que hoy no tiene NADIE --
 *    de los ~680 niveles nunca tocados en todo el almacén), sin desplazar a
 *    nadie.
 * 2) SWAP (si no hay hueco libre): intercambiarlo con un ocupante NO
 *    prioritario que sí está adentro.
 *
 * Ambas solo si son físicamente válidas (reglas duras) y mejoran al menos
 * una métrica de cumplimiento SIN empeorar ninguna otra. Cada movimiento
 * ejecutado queda en `auditoria`, con el motivo exacto -- auditable paso a
 * paso (Ley 9).
 */
const MAX_PASADAS = 3;
const NIVELES = ['N01', 'N02', 'N03', 'N04', 'N05'];

function claveBin(a) { return `${a.pasillo}|${a.columna}|${a.nivel}`; }
function capacidadDe(nivel) { return nivel === 'CUERPO' ? CAPACIDAD_UTIL_CUERPO_M3 : CAPACIDAD_UTIL_NIVEL_M3; }

function construirBins(asignaciones) {
  const bins = new Map();
  for (const a of asignaciones) {
    const clave = claveBin(a);
    if (!bins.has(clave)) bins.set(clave, { pasillo: a.pasillo, columna: a.columna, nivel: a.nivel, articulos: new Set() });
    bins.get(clave).articulos.add(a.articulo);
  }
  return bins;
}

function volumenDeBin(bin, volumenPorArticulo, excluir = null) {
  let total = 0;
  for (const art of bin.articulos) { if (art !== excluir) total += volumenPorArticulo.get(art) ?? 0; }
  return total;
}

function cabeEnBin(bin, articuloEntrante, volumenPorArticulo, saliente) {
  if (bin.nivel !== 'CUERPO') {
    const distintosSinSaliente = new Set(bin.articulos);
    distintosSinSaliente.delete(saliente);
    if (!distintosSinSaliente.has(articuloEntrante) && distintosSinSaliente.size >= MAX_ARTICULOS_DISTINTOS_POR_NIVEL) return false;
  }
  const volumenSinSaliente = volumenDeBin(bin, volumenPorArticulo, saliente);
  return volumenSinSaliente + (volumenPorArticulo.get(articuloEntrante) ?? 0) <= capacidadDe(bin.nivel);
}

/** Todos los niveles NIVEL-type de una zona -- ocupados o completamente vacíos (nunca tocados por ninguna asignación). Los cuerpos ya usados como CUERPO entero no ofrecen niveles (misma exclusividad física de siempre). */
function nivelesDeZona(cuerpos, predicadoZona, bins, cuerposComoCuerpoEntero) {
  const resultado = [];
  for (const c of cuerpos) {
    if (!predicadoZona(c)) continue;
    const claveCuerpo = `${c.pasillo}|${c.columna}`;
    if (cuerposComoCuerpoEntero.has(claveCuerpo)) continue;
    for (const nivel of NIVELES) {
      const clave = `${c.pasillo}|${c.columna}|${nivel}`;
      resultado.push(bins.get(clave) ?? { pasillo: c.pasillo, columna: c.columna, nivel, articulos: new Set() });
    }
  }
  return resultado;
}

/**
 * Los movimientos de arriba solo tocan pasillo/columna/nivel de la
 * simulación (así se puede comparar métrica contra métrica sin recalcular
 * todo en cada intento) -- por eso costo/utilizaciónResultante/afinidad/
 * reglasEvaluadas de CADA asignación (movida o no, si comparte hueco con
 * una que sí se movió) quedan desactualizados hasta este recálculo final.
 * Sin esto, el diff explicable (Ley 9) mostraría el motivo/% de la posición
 * VIEJA para cualquier artículo que terminó movido por un swap/reubicación.
 */
function recalcularCamposDerivados(asignaciones, articulos, zonas, pesos, reglas) {
  const infoPorArticulo = new Map(articulos.map(a => [a.articulo, a]));
  const volumenPorArticulo = new Map(articulos.map(a => [a.articulo, a.volumenM3]));
  const bins = construirBins(asignaciones);

  return asignaciones.map(a => {
    const bin = bins.get(claveBin(a));
    const capacidadUtil = capacidadDe(a.nivel);
    const volumenOcupadoSinEste = volumenDeBin(bin, volumenPorArticulo, a.articulo);
    const articulosDistintosSinEste = new Set(bin.articulos);
    articulosDistintosSinEste.delete(a.articulo);
    const binParaEvaluar = {
      tipo: a.nivel === 'CUERPO' ? 'CUERPO' : 'NIVEL',
      pasillo: a.pasillo, columna: a.columna, nivel: a.nivel,
      capacidadUtil, volumenOcupado: volumenOcupadoSinEste, articulosDistintos: articulosDistintosSinEste,
    };
    const info = infoPorArticulo.get(a.articulo);
    const { resultados } = evaluarReglas(binParaEvaluar, info, reglas);
    const utilizacionResultante = (volumenOcupadoSinEste + (info?.volumenM3 ?? 0)) / capacidadUtil;
    const afinidad = calcularAfinidadZonas(binParaEvaluar, info, zonas);
    const afinidadFrecuencia = calcularAfinidadFrecuencia(binParaEvaluar, info, zonas);
    const costo = calcularCosto({ utilizacionResultante, violacionesBlandas: 0, afinidad, afinidadFrecuencia }, pesos);
    return { ...a, costo, utilizacionResultante, afinidad, afinidadFrecuencia, reglasEvaluadas: resultados };
  });
}

function mejoraSegunMetricas(metricasAntes, metricasDespues) {
  return metricasDespues.densidadPonderada >= metricasAntes.densidadPonderada
    && (metricasDespues.tasaClaseAEnOptima ?? 0) >= (metricasAntes.tasaClaseAEnOptima ?? 0)
    && (metricasDespues.tasaAltaFrecuenciaEnAccesible ?? 0) >= (metricasAntes.tasaAltaFrecuenciaEnAccesible ?? 0)
    && ((metricasDespues.tasaClaseAEnOptima ?? 0) > (metricasAntes.tasaClaseAEnOptima ?? 0)
      || (metricasDespues.tasaAltaFrecuenciaEnAccesible ?? 0) > (metricasAntes.tasaAltaFrecuenciaEnAccesible ?? 0));
}

/**
 * @param {Array} asignaciones -- salida de empaquetarDosFases.js
 * @param {Array} articulos -- {articulo, volumenM3, clase, picksNormalizado}
 * @param {Array} cuerpos -- universo completo (construirUniversoDeHuecos.js) -- necesario para encontrar huecos libres que nunca aparecen en `asignaciones`
 * @param {{umbralAltaFrecuencia, zonas, calcularMetricas}} opciones
 * @returns {{asignaciones, auditoria}}
 */
export function mejorarPorSwaps(asignaciones, articulos, cuerpos, opciones) {
  const { calcularMetricas, umbralAltaFrecuencia = 0, pesos = PESOS_POR_DEFECTO, reglas = REGLAS_POR_DEFECTO } = opciones;
  const zonaOptima = opciones.zonas?.optimaClaseA ?? ZONA_OPTIMA_CLASE_A;
  const zonaAccesible = opciones.zonas?.accesibleGeneral ?? ZONA_ACCESIBLE_GENERAL;
  const enZonaOptima = c => enRango(c, zonaOptima);
  const enZonaAccesibleSolo = c => enRango(c, zonaAccesible) && !enRango(c, zonaOptima);

  const infoPorArticulo = new Map(articulos.map(a => [a.articulo, a]));
  const volumenPorArticulo = new Map(articulos.map(a => [a.articulo, a.volumenM3]));

  let actuales = asignaciones.map(a => ({ ...a }));
  const auditoria = [];

  for (let pasada = 0; pasada < MAX_PASADAS; pasada++) {
    const bins = construirBins(actuales);
    const cuerposComoCuerpoEntero = new Set(actuales.filter(a => a.nivel === 'CUERPO').map(a => `${a.pasillo}|${a.columna}`));
    const nivelesOptima = nivelesDeZona(cuerpos, enZonaOptima, bins, cuerposComoCuerpoEntero);
    const nivelesAccesible = nivelesDeZona(cuerpos, enZonaAccesibleSolo, bins, cuerposComoCuerpoEntero);

    // Dos poblaciones separadas -- cada una apunta a SU zona específica, no
    // a "cualquier zona prioritaria": un clase A que ya está en la zona
    // accesible general (pero no en la óptima) igual cuenta como candidato
    // para la óptima -- son métricas distintas (tasaClaseAEnOptima vs.
    // tasaAltaFrecuenciaEnAccesible), cada una con su propio par candidato/ocupante.
    const candidatosOptima = actuales.filter(a => infoPorArticulo.get(a.articulo)?.clase === 'A' && !enRango(a, zonaOptima));
    const ocupantesOptima = actuales.filter(a => infoPorArticulo.get(a.articulo)?.clase !== 'A' && enRango(a, zonaOptima));

    const esAltaFrecuencia = art => (infoPorArticulo.get(art)?.picksNormalizado ?? 0) >= umbralAltaFrecuencia;
    const candidatosAccesible = actuales.filter(a => {
      const info = infoPorArticulo.get(a.articulo);
      return info?.clase !== 'A' && esAltaFrecuencia(a.articulo) && !enRango(a, zonaOptima) && !enRango(a, zonaAccesible);
    });
    const ocupantesAccesible = actuales.filter(a => {
      const info = infoPorArticulo.get(a.articulo);
      return info?.clase !== 'A' && !esAltaFrecuencia(a.articulo) && (enRango(a, zonaOptima) || enRango(a, zonaAccesible));
    });

    const candidatos = [
      ...candidatosOptima.map(c => ({ candidato: c, pool: ocupantesOptima, niveles: nivelesOptima })),
      ...candidatosAccesible.map(c => ({ candidato: c, pool: ocupantesAccesible, niveles: nivelesAccesible })),
    ];

    if (candidatos.length === 0) break;

    let huboMejora = false;
    for (const { candidato, pool, niveles } of candidatos) {
      const binCandidato = bins.get(claveBin(candidato));

      // 1) Reubicación -- más barata, se intenta primero: un hueco de la
      // zona con lugar de sobra, sin desplazar a nadie.
      let mejorMovimiento = null;
      for (const destino of niveles) {
        if (destino.pasillo === candidato.pasillo && destino.columna === candidato.columna && destino.nivel === candidato.nivel) continue;
        if (!cabeEnBin(destino, candidato.articulo, volumenPorArticulo, null)) continue;

        const metricasAntes = calcularMetricas(actuales);
        const simulacion = actuales.map(a => a.articulo === candidato.articulo ? { ...a, pasillo: destino.pasillo, columna: destino.columna, nivel: destino.nivel } : a);
        const metricasDespues = calcularMetricas(simulacion);
        if (mejoraSegunMetricas(metricasAntes, metricasDespues)) {
          mejorMovimiento = { tipo: 'reubicacion', destino, metricasAntes, metricasDespues, simulacion };
          break;
        }
      }

      // 2) Swap -- si no hay hueco libre, intercambiar con un ocupante no prioritario.
      if (!mejorMovimiento) {
        for (const ocupante of pool) {
          if (candidato.articulo === ocupante.articulo) continue;
          const binOcupante = bins.get(claveBin(ocupante));
          if (!binCandidato || !binOcupante) continue;
          if (!cabeEnBin(binOcupante, candidato.articulo, volumenPorArticulo, ocupante.articulo)) continue;
          if (!cabeEnBin(binCandidato, ocupante.articulo, volumenPorArticulo, candidato.articulo)) continue;

          const metricasAntes = calcularMetricas(actuales);
          const simulacion = actuales.map(a => {
            if (a.articulo === candidato.articulo) return { ...a, pasillo: ocupante.pasillo, columna: ocupante.columna, nivel: ocupante.nivel };
            if (a.articulo === ocupante.articulo) return { ...a, pasillo: candidato.pasillo, columna: candidato.columna, nivel: candidato.nivel };
            return a;
          });
          const metricasDespues = calcularMetricas(simulacion);
          if (mejoraSegunMetricas(metricasAntes, metricasDespues)) {
            mejorMovimiento = { tipo: 'swap', ocupante, metricasAntes, metricasDespues, simulacion };
            break;
          }
        }
      }

      if (mejorMovimiento) {
        actuales = mejorMovimiento.simulacion;
        if (mejorMovimiento.tipo === 'reubicacion') {
          auditoria.push({
            tipo: 'reubicacion', articulo: candidato.articulo,
            desde: { pasillo: candidato.pasillo, columna: candidato.columna, nivel: candidato.nivel },
            hacia: { pasillo: mejorMovimiento.destino.pasillo, columna: mejorMovimiento.destino.columna, nivel: mejorMovimiento.destino.nivel },
            metricasAntes: mejorMovimiento.metricasAntes, metricasDespues: mejorMovimiento.metricasDespues,
          });
        } else {
          auditoria.push({
            tipo: 'swap', candidato: candidato.articulo, ocupante: mejorMovimiento.ocupante.articulo,
            desde: { candidato: { pasillo: candidato.pasillo, columna: candidato.columna, nivel: candidato.nivel }, ocupante: { pasillo: mejorMovimiento.ocupante.pasillo, columna: mejorMovimiento.ocupante.columna, nivel: mejorMovimiento.ocupante.nivel } },
            hacia: { candidato: { pasillo: mejorMovimiento.ocupante.pasillo, columna: mejorMovimiento.ocupante.columna, nivel: mejorMovimiento.ocupante.nivel }, ocupante: { pasillo: candidato.pasillo, columna: candidato.columna, nivel: candidato.nivel } },
            metricasAntes: mejorMovimiento.metricasAntes, metricasDespues: mejorMovimiento.metricasDespues,
          });
        }
        huboMejora = true;
      }
    }
    if (!huboMejora) break;
  }

  const asignacionesFinales = auditoria.length > 0
    ? recalcularCamposDerivados(actuales, articulos, opciones.zonas ?? {}, pesos, reglas)
    : actuales;

  return { asignaciones: asignacionesFinales, auditoria };
}
