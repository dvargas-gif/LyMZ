/**
 * Posiciones MZ realmente libres (2026-07-28, pedido explícito: "un botón
 * para exportar todos los racks que no tienen mercadería").
 *
 * CORRECCIÓN EN VIVO (mismo día): la primera versión también excluía
 * cualquier posición con una fila en `identidad_legacy` -- pero
 * `identidad_legacy` NO significa "está ocupado", es un import de una sola
 * vez que casi cubre el 100% de las posiciones posibles (1496-1506 filas
 * de ~1420 reales) y que YA demostramos que puede estar completamente
 * desactualizado (ver detectarDestinosDesactualizados.js, el caso real del
 * artículo 5180060). Usarlo acá hacía que casi TODO pareciera ocupado --
 * de un warehouse con 1420 posiciones, devolvía 6 cuerpos libres para 1263
 * artículos sin ubicación, un resultado imposible que debería haber hecho
 * ruido antes de entregarlo. La ÚNICA fuente confiable de "está ocupado"
 * es `inventario_slotting` (el plan real, vigente) -- `identidad_legacy`
 * no participa en este cálculo en absoluto.
 *
 * Acotado a MZ01-MZ08 (mismo alcance que ya usa identidad_legacy/
 * pasillos_config -- el archivo real del cliente solo cubre estos 8
 * pasillos, no los 12 del layout completo del mapa) y N01-N05 (mismo
 * rango que numeroANivelWms()).
 *
 * Función pura, sin Supabase -- SOLO detecta y reporta, no cambia nada.
 */
import { COLUMNAS_POR_PASILLO } from '../features/mapa/canvas/posicionesEsquematicas.js';
import { numeroANivelWms } from '../features/migracion/nivelWms.js';

const PASILLOS_CON_IDENTIDAD = ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08'];
const NIVELES_WMS = ['N01', 'N02', 'N03', 'N04', 'N05'];

/**
 * @param {Array<{pasillo, columna, nivel, tipo}>} inventarioSlotting -- inventarioService.listar(), única fuente de ocupación real
 * @returns {Array<{pasillo, columna, nivel}>} posiciones libres, ordenadas por pasillo/columna/nivel.
 */
export function detectarPosicionesLibres(inventarioSlotting) {
  const cuerposOcupados = new Set(); // "pasillo|columna" -- un CUERPO ocupa los 5 niveles enteros
  const nivelesOcupados = new Set(); // "pasillo|columna|nivel" -- una fila NORMAL ocupa solo su nivel puntual
  for (const fila of inventarioSlotting) {
    if (fila.tipo === 'CUERPO') cuerposOcupados.add(`${fila.pasillo}|${fila.columna}`);
    else nivelesOcupados.add(`${fila.pasillo}|${fila.columna}|${fila.nivel}`);
  }

  const libres = [];
  for (const pasillo of PASILLOS_CON_IDENTIDAD) {
    const columnas = COLUMNAS_POR_PASILLO[pasillo];
    for (let columna = 1; columna <= columnas; columna++) {
      if (cuerposOcupados.has(`${pasillo}|${columna}`)) continue; // cuerpo entero ocupado -- ningún nivel libre acá
      for (const nivel of NIVELES_WMS) {
        if (nivelesOcupados.has(`${pasillo}|${columna}|${nivel}`)) continue;
        libres.push({ pasillo, columna, nivel });
      }
    }
  }
  return libres;
}

/**
 * Posiciones MZ libres de IDENTIDAD (2026-07-29, pedido explícito: "no es si
 * está ocupado actualmente, solo veamos la identidad del MZ, tiene que estar
 * libre para los MZ" -- corregido en vivo el mismo día: la primera versión
 * trataba CUALQUIER fila en identidad_legacy como "ocupado" y eso dejaba
 * MZ07 entero afuera, mismo resultado chico e implausible que el bug
 * original de detectarPosicionesLibres(). La fila SOLO representa un MZ
 * realmente tomado si `estadoRcl === 'asignado'` -- mismo campo y mismo
 * criterio que ya usa detectarDestinosDesactualizados.js:50. Otros valores
 * (ej. 'pendiente_asignar') significan que esa fila existe pero todavía NO
 * tiene un RCL real puesto ahí -- esa posición SÍ está libre).
 *
 * Distinto a propósito de detectarPosicionesLibres() de arriba -- ese
 * responde "¿hay mercadería real ahí?" (fuente: inventario_slotting). Esta
 * responde una pregunta distinta: "¿ese MZ ya tiene un RCL asignado en
 * identidad_legacy?" (fuente: identidad_legacy, campo estadoRcl). Hace falta
 * esta segunda pregunta para el caso de uso real: identidad_legacy tiene
 * (mz_pasillo, mz_columna, mz_nivel, mz_subnivel) como clave única, así que
 * al armar el archivo definitivo para asignarle un MZ nuevo a un RCL sin
 * ubicación, el MZ elegido no puede tener YA un RCL asignado en esa tabla --
 * sin importar si inventario_slotting dice que hay mercadería real ahí o no.
 * No mezclar los dos criterios en una sola función: son dos preguntas
 * distintas con dos respuestas distintas (ver detectarPosicionesLibres()).
 *
 * @param {Array<{mzPasillo, mzColumna, mzNivel, estadoRcl}>} identidadLegacy -- identidadLegacyService.listar()
 * @returns {Array<{pasillo, columna, nivel}>} posiciones sin RCL asignado en identidad_legacy, ordenadas por pasillo/columna/nivel.
 */
export function detectarPosicionesLibresDeIdentidad(identidadLegacy) {
  const conIdentidad = new Set(); // "pasillo|columna|nivelWms"
  for (const fila of identidadLegacy) {
    if (fila.estadoRcl !== 'asignado') continue; // fila existe pero sin RCL real puesto -- no cuenta como ocupado
    const nivel = numeroANivelWms(fila.mzNivel);
    if (nivel) conIdentidad.add(`${fila.mzPasillo}|${fila.mzColumna}|${nivel}`);
  }

  const libres = [];
  for (const pasillo of PASILLOS_CON_IDENTIDAD) {
    const columnas = COLUMNAS_POR_PASILLO[pasillo];
    for (let columna = 1; columna <= columnas; columna++) {
      for (const nivel of NIVELES_WMS) {
        if (conIdentidad.has(`${pasillo}|${columna}|${nivel}`)) continue;
        libres.push({ pasillo, columna, nivel });
      }
    }
  }
  return libres;
}

/**
 * Posiciones MZ REALMENTE libres para meter un artículo nuevo (2026-07-30,
 * pedido explícito tras un caso real: el reporte de solo-identidad daba
 * MZ07-C026 como libre, pero esa posición YA tiene 20 artículos reales
 * puestos ahí -- "tengo cosas ahí"). Ni detectarPosicionesLibres() (solo
 * mercadería real) ni detectarPosicionesLibresDeIdentidad() (solo RCL
 * asignado) alcanzan solas: para poder ubicar un artículo nuevo hace falta
 * que la posición esté libre en AMBOS sentidos a la vez -- sin mercadería
 * real Y sin un RCL ya asignado en identidad_legacy (esa tabla no admite dos
 * RCL en el mismo MZ). Es la intersección de las dos, no la unión de sus
 * criterios de ocupación.
 *
 * @param {Array<{pasillo, columna, nivel, tipo}>} inventarioSlotting -- inventarioService.listar()
 * @param {Array<{mzPasillo, mzColumna, mzNivel, estadoRcl}>} identidadLegacy -- identidadLegacyService.listar()
 * @returns {Array<{pasillo, columna, nivel}>} posiciones libres en ambos sentidos, ordenadas por pasillo/columna/nivel.
 */
export function detectarPosicionesRealmenteLibres(inventarioSlotting, identidadLegacy) {
  const libresDeInventario = new Set(
    detectarPosicionesLibres(inventarioSlotting).map(l => `${l.pasillo}|${l.columna}|${l.nivel}`),
  );
  return detectarPosicionesLibresDeIdentidad(identidadLegacy)
    .filter(l => libresDeInventario.has(`${l.pasillo}|${l.columna}|${l.nivel}`));
}

/**
 * Agrupa el resultado de detectarPosicionesLibres() por cuerpo (2026-07-28,
 * pedido explícito: "no quiero MZ04-C005-N01 y el de nivel 2,3,4,5 así con
 * todos... de un cuerpo salen 5 nomenclaturas distintas") -- UNA fila por
 * rack (pasillo+columna), con una columna por nivel (N01-N05) que trae la
 * nomenclatura completa si ese nivel está libre, o vacío si no lo está.
 * Un cuerpo sin NINGÚN nivel libre no aparece (nada que ofrecer ahí).
 *
 * @param {Array<{pasillo, columna, nivel}>} libres -- salida de detectarPosicionesLibres()
 * @returns {Array<{pasillo, columna, N01, N02, N03, N04, N05}>}
 */
export function agruparPosicionesLibresPorCuerpo(libres) {
  const porRack = new Map(); // "pasillo|columna" -> { pasillo, columna, niveles: Set }
  for (const l of libres) {
    const clave = `${l.pasillo}|${l.columna}`;
    if (!porRack.has(clave)) porRack.set(clave, { pasillo: l.pasillo, columna: l.columna, niveles: new Set() });
    porRack.get(clave).niveles.add(l.nivel);
  }

  const resultado = [];
  for (const { pasillo, columna, niveles } of porRack.values()) {
    const fila = { pasillo, columna };
    const codigoRack = `${pasillo}-C${String(columna).padStart(3, '0')}`;
    for (const nivel of NIVELES_WMS) {
      fila[nivel] = niveles.has(nivel) ? `${codigoRack}-${nivel}` : '';
    }
    resultado.push(fila);
  }
  return resultado;
}
