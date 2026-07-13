/**
 * Layout esquemático de los 12 pasillos reales del mezanine (ver
 * DECISIONES.md ADR-010/011/012) para el canvas nuevo (Fase A). "Esquemático"
 * a propósito, no 1:1 a los metros del DXF: los pasillos reales vienen en
 * pares pegados a 0.645m entre sí y otros a ~3.5m -- con celdas de tamaño
 * fijo, una escala 100% fiel los superpondría. Se respeta el ORDEN real
 * (de arriba hacia abajo, igual que el mapa legacy hoy) y la perpendicularidad
 * de MZ11/MZ12, no el milímetro exacto.
 *
 * Función pura, sin dependencias de React/Konva -- fácil de testear sola.
 */

export const CELDA_ANCHO = 44;
export const CELDA_ALTO = 40;
export const GAP = 4;

/**
 * Cantidad real de columnas por pasillo (ver ADR-010/011/012 -- mismos
 * números que public/legacy/js/03-configuracion.js más los 4 nuevos).
 *
 * MZ08=41 y MZ10=6 corregidos (ver ADR nuevo): las etiquetas REALES del DXF
 * confirman `MZ08-C041` (último cuerpo real) y `MZ10-C006` (no hay ninguna
 * etiqueta MZ10-C007 en adelante) -- la extracción anterior había asignado
 * por proximidad geométrica 4 cuerpos sin etiqueta a MZ10, al otro lado del
 * hueco físico de 76 unidades que ocupa la banda transportadora.
 */
export const COLUMNAS_POR_PASILLO = {
  MZ01: 27, MZ02: 36, MZ03: 36, MZ04: 36, MZ05: 36, MZ06: 36, MZ07: 36, MZ08: 41,
  MZ09: 4, MZ10: 6, MZ11: 5, MZ12: 7,
};

/** MZ11/MZ12 son perpendiculares en la realidad -- se dibujan en su propia franja, no en la pila horizontal. */
export const PASILLOS_VERTICALES = ['MZ11', 'MZ12'];

/**
 * Orden real de arriba hacia abajo, agrupado en los pares que están
 * pegados en la realidad (MZ02-03, MZ04-05, MZ06-07, MZ08-09, ~0.6-0.645m
 * entre sí -- ver ADR-010/011/012 y la geometría real de
 * geometriaMezanine.data.json) vs. los que están solos (MZ01, MZ10,
 * ~1.7-3.5m de cualquier vecino). El espaciado visual usa esta agrupación
 * (gap chico DENTRO de un par, gap grande ENTRE grupos) para que la
 * cercanía real se note a simple vista -- antes todo tenía el mismo
 * espaciado parejo y no se distinguía nada.
 */
const GRUPOS_HORIZONTAL = [['MZ10'], ['MZ09', 'MZ08'], ['MZ07', 'MZ06'], ['MZ05', 'MZ04'], ['MZ03', 'MZ02'], ['MZ01']];
const ORDEN_HORIZONTAL = GRUPOS_HORIZONTAL.flat();
const ORDEN_VERTICAL = ['MZ12', 'MZ11'];
// 29 = 22 base + el margen muerto recuperado (14px de ETIQUETA_ANCHO + 22px
// del offset superior que ya no usa calcularYPorPasillo(), repartidos
// uniforme entre los 5 huecos entre grupos: 36/5=7.2 -> +7 por hueco).
const GAP_ENTRE_GRUPOS = 29; // además del GAP normal -- separación extra entre grupos, no dentro de un par

/**
 * Cortes de "PASILLO" (espacio de paso físico) DENTRO de una fila -- mismo
 * criterio que gapsDe() en public/legacy/js/03-configuracion.js: los
 * pasillos "largos" (clase de 36 columnas de fábrica) cortan tras
 * C009/C019/C026; el resto, tras C007/C022.
 *
 * OJO: esto es sobre la CLASE del pasillo, no su cuenta real de columnas --
 * MZ08 tiene 35 cuerpos reales (ADR-012, construcción quedó 1 rack corta),
 * pero sigue siendo un pasillo "largo" igual que sus vecinos MZ02-07. Si se
 * decide por cantidad real (`>=36`), MZ08 queda mal clasificado y sus
 * cortes no alinean en X con el resto de las filas -- exactamente el bug
 * que reportó el usuario. Por eso es una lista explícita, no un umbral.
 */
const PASILLOS_LARGOS = ['MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08'];
const CORTE_AFTER_DEFAULT = [9, 19, 26];
const CORTE_AFTER_CORTO = [7, 22];
const ANCHO_CORTE = 26;

function cortesDe(pasillo) {
  return PASILLOS_LARGOS.includes(pasillo) ? CORTE_AFTER_DEFAULT : CORTE_AFTER_CORTO;
}

/**
 * Offset horizontal extra por pasillo -- hoy solo MZ01, corrida a la
 * derecha 2 columnas de pitch para que su C001 quede alineada (misma X)
 * contra MZ02-C003, tal como muestra el plano real. No se busca que el
 * resto de las columnas calcen entre MZ01 y MZ02 -- el plano ya tiene
 * desviaciones menores más allá de esa referencia, y está bien que se
 * mantengan.
 */
const OFFSET_X_PASILLO = { MZ01: 2 * (CELDA_ANCHO + GAP) };

function offsetXDe(pasillo) {
  return OFFSET_X_PASILLO[pasillo] || 0;
}

// Espacio reservado para las etiquetas de nombre de pasillo -- sin esto no
// se puede distinguir a simple vista cuál pasillo es cuál, ni cuáles son
// horizontales vs. verticales (pedido explícito del usuario tras ver la
// primera versión sin etiquetas).
const ETIQUETA_ALTO = 22; // franja arriba de las columnas verticales (MZ11/MZ12) -- NO afecta a las filas horizontales, ver calcularYPorPasillo()
const ETIQUETA_ANCHO = 40; // franja a la izquierda de cada fila horizontal -- antes 54, sobraba aire además del texto del nombre de pasillo

function limitesBloqueVertical() {
  const COL_ANCHO = CELDA_ANCHO + GAP;
  return ORDEN_VERTICAL.length * COL_ANCHO + GAP * 3;
}

/**
 * Y de la fila de cada pasillo horizontal, ya con el gap extra entre grupos
 * aplicado -- una sola fuente de verdad para celdas y etiquetas.
 *
 * Arranca en 0 (pegado al borde real de la grilla, "la baranda superior")
 * -- MZ10 no necesita el aire de ETIQUETA_ALTO, ese offset es solo para la
 * etiqueta de MZ11/MZ12 (que se dibuja arriba de SUS columnas, en un rango
 * de X totalmente distinto al de las filas horizontales).
 */
function calcularYPorPasillo() {
  const FILA_ALTO = CELDA_ALTO + GAP;
  const y = new Map();
  let cursor = 0;
  GRUPOS_HORIZONTAL.forEach((grupo, grupoIdx) => {
    if (grupoIdx > 0) cursor += GAP_ENTRE_GRUPOS;
    grupo.forEach(pasillo => {
      y.set(pasillo, cursor);
      cursor += FILA_ALTO;
    });
  });
  return y;
}

/**
 * Devuelve {pasillo, columna, x, y, ancho, alto} para cada celda de los 12
 * pasillos -- listo para dibujar, sin lógica de artículos/colores (eso lo
 * resuelve quien consuma esto, cruzando con WarehouseModel.racks()).
 */
export function calcularLayoutEsquematico() {
  const celdas = [];
  const FILA_ALTO = CELDA_ALTO + GAP;
  const COL_ANCHO = CELDA_ANCHO + GAP;
  const anchoBloqueVertical = limitesBloqueVertical();
  const xInicioHorizontal = anchoBloqueVertical + ETIQUETA_ANCHO;
  const yPorPasillo = calcularYPorPasillo();

  ORDEN_HORIZONTAL.forEach(pasillo => {
    const y = yPorPasillo.get(pasillo);
    const columnas = COLUMNAS_POR_PASILLO[pasillo];
    const cortes = cortesDe(pasillo);
    const offsetX = offsetXDe(pasillo);
    let corteAcumulado = 0;
    for (let c = 1; c <= columnas; c++) {
      celdas.push({
        pasillo, columna: c,
        x: xInicioHorizontal + offsetX + (c - 1) * COL_ANCHO + corteAcumulado,
        y,
        ancho: CELDA_ANCHO, alto: CELDA_ALTO,
      });
      if (cortes.includes(c)) corteAcumulado += ANCHO_CORTE + GAP;
    }
  });

  ORDEN_VERTICAL.forEach((pasillo, colIdx) => {
    const x = colIdx * COL_ANCHO;
    const columnas = COLUMNAS_POR_PASILLO[pasillo];
    for (let c = 1; c <= columnas; c++) {
      celdas.push({
        pasillo, columna: c,
        x,
        y: ETIQUETA_ALTO + (c - 1) * FILA_ALTO,
        ancho: CELDA_ANCHO, alto: CELDA_ALTO,
      });
    }
  });

  return celdas;
}

/** Devuelve {pasillo, x, y, ancho, alto} -- un marcador "PASILLO" por cada corte real dentro de una fila (ver cortesDe()), para dibujarlo en el hueco que calcularLayoutEsquematico() ya dejó. */
export function calcularCortesPasillo() {
  const cortes = [];
  const FILA_ALTO = CELDA_ALTO + GAP;
  const COL_ANCHO = CELDA_ANCHO + GAP;
  const anchoBloqueVertical = limitesBloqueVertical();
  const xInicioHorizontal = anchoBloqueVertical + ETIQUETA_ANCHO;
  const yPorPasillo = calcularYPorPasillo();

  ORDEN_HORIZONTAL.forEach(pasillo => {
    const y = yPorPasillo.get(pasillo);
    const columnas = COLUMNAS_POR_PASILLO[pasillo];
    const cortesDeEstePasillo = cortesDe(pasillo);
    const offsetX = offsetXDe(pasillo);
    let corteAcumulado = 0;
    for (let c = 1; c <= columnas; c++) {
      if (cortesDeEstePasillo.includes(c)) {
        const xCelda = xInicioHorizontal + offsetX + (c - 1) * COL_ANCHO + corteAcumulado;
        cortes.push({ pasillo, x: xCelda + CELDA_ANCHO + GAP / 2, y, ancho: ANCHO_CORTE, alto: CELDA_ALTO });
        corteAcumulado += ANCHO_CORTE + GAP;
      }
    }
  });

  return cortes;
}

/** Y del punto medio de cada separación entre grupos de pasillos -- para dibujar una línea divisoria sutil ahí (refuerzo visual de "estos son grupos distintos"). */
export function calcularDivisoresGrupo() {
  const FILA_ALTO = CELDA_ALTO + GAP;
  const yPorPasillo = calcularYPorPasillo();
  const divisores = [];
  for (let i = 0; i < GRUPOS_HORIZONTAL.length - 1; i++) {
    const finGrupoActual = yPorPasillo.get(GRUPOS_HORIZONTAL[i][GRUPOS_HORIZONTAL[i].length - 1]) + FILA_ALTO;
    const inicioGrupoSiguiente = yPorPasillo.get(GRUPOS_HORIZONTAL[i + 1][0]);
    divisores.push((finGrupoActual + inicioGrupoSiguiente) / 2);
  }
  return divisores;
}

/**
 * Devuelve {pasillo, x, y, vertical} -- una etiqueta de texto por pasillo,
 * ubicada al lado de su primera celda (a la izquierda si es horizontal,
 * arriba si es vertical), para poder distinguir a simple vista cuál es
 * cuál y su orientación real.
 */
export function calcularEtiquetas() {
  const etiquetas = [];
  const COL_ANCHO = CELDA_ANCHO + GAP;
  const anchoBloqueVertical = limitesBloqueVertical();
  const xInicioHorizontal = anchoBloqueVertical + ETIQUETA_ANCHO;
  const yPorPasillo = calcularYPorPasillo();

  ORDEN_HORIZONTAL.forEach(pasillo => {
    // SIN offsetXDe(pasillo) a propósito -- las celdas de MZ01 están corridas
    // a la derecha (ver OFFSET_X_PASILLO), pero su ETIQUETA debe seguir en la
    // misma columna que las demás filas, no arrastrar el corrimiento y romper
    // la alineación visual del bloque de nombres.
    const x = xInicioHorizontal - ETIQUETA_ANCHO;
    etiquetas.push({ pasillo, x, y: yPorPasillo.get(pasillo), ancho: ETIQUETA_ANCHO, alto: CELDA_ALTO, vertical: false });
  });

  ORDEN_VERTICAL.forEach((pasillo, colIdx) => {
    etiquetas.push({ pasillo, x: colIdx * COL_ANCHO, y: 0, ancho: CELDA_ANCHO, alto: ETIQUETA_ALTO, vertical: true });
  });

  return etiquetas;
}
