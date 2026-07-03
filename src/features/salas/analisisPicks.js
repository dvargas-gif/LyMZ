/**
 * Análisis de picks cargados en una sala — primera versión práctica (no IA):
 * frecuencia real de picks -> clasificación de rotación (ABC/Pareto) ->
 * comparación contra la clase (A/B/C/D) que el mapa usa hoy para ese
 * artículo -> recomendación. Todo esto es JS puro, sin llamadas a Supabase,
 * para poder testearlo/reusarlo desde cualquier panel.
 */

// Palabras clave (ya normalizadas: sin acentos/espacios/guiones) que puede
// contener el encabezado real de la columna, sea cual sea cómo lo tituló
// quien armó el Excel — se busca por "contiene", no por igualdad exacta.
import { normalizarClave } from '../cargaMasiva/cargaMasiva.service.js';

const PALABRAS_CLAVE = {
  articulo: ['articulo', 'codigo', 'sku', 'material', 'item'],
  nombre: ['nombre', 'descripcion', 'producto'],
  cantidad_picks: ['pick', 'cantidad', 'qty', 'unidades'],
  frecuencia: ['frecuencia', 'frequency', 'freq'],
  prioridad: ['prioridad', 'priority'],
  periodo: ['periodo', 'fecha', 'period', 'date'],
};

/** Convierte filas crudas (de Excel/CSV/pegado) a la forma canónica, sea cual sea el nombre de columna que traigan. */
export function normalizarFilasPicks(rawRows) {
  if (!rawRows || rawRows.length === 0) return [];
  const filas = [];
  for (const raw of rawRows) {
    const porClave = {};
    for (const k of Object.keys(raw)) porClave[normalizarClave(k)] = raw[k];
    const claves = Object.keys(porClave);

    const buscar = campo => {
      const clave = claves.find(c => PALABRAS_CLAVE[campo].some(kw => c.includes(kw)));
      const valor = clave !== undefined ? porClave[clave] : undefined;
      return valor !== undefined && valor !== '' ? valor : undefined;
    };

    const articulo = buscar('articulo');
    if (!articulo) continue; // fila sin código de artículo no sirve de nada
    const cantidad = Number(buscar('cantidad_picks'));
    filas.push({
      articulo: String(articulo).trim(),
      nombre: buscar('nombre') ? String(buscar('nombre')).trim() : '',
      cantidad_picks: Number.isFinite(cantidad) ? cantidad : 0,
      frecuencia: buscar('frecuencia') !== undefined ? Number(buscar('frecuencia')) || 0 : null,
      prioridad: buscar('prioridad') ? String(buscar('prioridad')).trim() : null,
      periodo: buscar('periodo') ? String(buscar('periodo')).trim() : null,
    });
  }
  return filas;
}

/** Parsea texto pegado (tab o coma separado, con encabezado en la primera línea) al mismo formato que produce Excel. */
export function parsearTextoPegado(texto) {
  const lineas = texto.trim().split(/\r?\n/).filter(l => l.trim());
  if (lineas.length < 2) return [];
  const sep = lineas[0].includes('\t') ? '\t' : ',';
  const encabezados = lineas[0].split(sep).map(h => h.trim());
  return lineas.slice(1).map(linea => {
    const valores = linea.split(sep);
    const fila = {};
    encabezados.forEach((h, i) => { fila[h] = (valores[i] || '').trim(); });
    return fila;
  });
}

const CLASES_BAJA_ROTACION = ['C', 'D'];

/**
 * Calcula rotación (Pareto/ABC clásico sobre picks acumulados), la compara
 * contra la clase A/B/C/D que el mapa usa hoy para ese artículo, y arma
 * recomendaciones. `posiciones` = [{articulo, pasillo, columna, clase, tipo}]
 * ya resuelto (base + lo que esté movido en ESTA sala).
 */
export function calcularAnalisis(filasPicksCrudas, posiciones) {
  const porArticulo = new Map();
  for (const f of filasPicksCrudas) {
    const acc = porArticulo.get(f.articulo) || { articulo: f.articulo, nombre: f.nombre, cantidad_picks: 0, frecuencia: 0, prioridad: f.prioridad, periodo: f.periodo };
    acc.cantidad_picks += f.cantidad_picks || 0;
    acc.frecuencia += f.frecuencia || 0;
    if (!acc.nombre && f.nombre) acc.nombre = f.nombre;
    if (!acc.prioridad && f.prioridad) acc.prioridad = f.prioridad;
    porArticulo.set(f.articulo, acc);
  }
  const agregadas = [...porArticulo.values()].sort((a, b) => b.cantidad_picks - a.cantidad_picks);
  const totalPicks = agregadas.reduce((s, a) => s + a.cantidad_picks, 0) || 1;

  const posPorArticulo = new Map(posiciones.map(p => [p.articulo, p]));
  // "Zona preferente" real: el pasillo donde hoy vive más artículo clase A.
  const conteoAporPasillo = {};
  for (const p of posiciones) if (p.clase === 'A') conteoAporPasillo[p.pasillo] = (conteoAporPasillo[p.pasillo] || 0) + 1;
  const zonaPreferente = Object.entries(conteoAporPasillo).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  let acumulado = 0;
  const filas = agregadas.map(a => {
    acumulado += a.cantidad_picks;
    const pctAcumulado = (acumulado / totalPicks) * 100;
    const rotacion = pctAcumulado <= 80 ? 'Alta' : pctAcumulado <= 95 ? 'Media' : 'Baja';
    const posicion = posPorArticulo.get(a.articulo) || null;
    const claseActual = posicion?.clase || null;

    let estado = 'Coherente';
    let recomendacion = 'Ubicación coherente con su rotación real.';
    if (rotacion === 'Alta' && claseActual && CLASES_BAJA_ROTACION.includes(claseActual)) {
      estado = 'Mal ubicado';
      recomendacion = zonaPreferente
        ? `Alta rotación pero clasificado como ${claseActual}. Reclasificar a A y mover a ${zonaPreferente} (zona con más artículos A).`
        : `Alta rotación pero clasificado como ${claseActual}. Reclasificar a A y priorizar una zona de fácil acceso.`;
    } else if (rotacion === 'Baja' && claseActual === 'A') {
      estado = 'Sobrevalorado';
      recomendacion = 'Ocupa una posición de alta rotación (A) pero casi no tiene picks reales. Liberar ese espacio para un artículo de más movimiento.';
    } else if (!posicion) {
      estado = 'Sin ubicación';
      recomendacion = 'No tiene posición asignada en esta sala — no se puede evaluar su acomodo.';
    }

    return {
      articulo: a.articulo,
      nombre: a.nombre || posicion?.descripcion || '',
      cantidad_picks: a.cantidad_picks,
      frecuencia: a.frecuencia,
      prioridad: a.prioridad,
      pctAcumulado: Math.round(pctAcumulado * 10) / 10,
      rotacion,
      claseActual,
      pasilloActual: posicion?.pasillo || null,
      columnaActual: posicion?.columna || null,
      estado,
      recomendacion,
    };
  });

  const malUbicados = filas.filter(f => f.estado === 'Mal ubicado' || f.estado === 'Sobrevalorado');

  return {
    filas,
    resumen: {
      totalArticulos: filas.length,
      totalPicks: agregadas.reduce((s, a) => s + a.cantidad_picks, 0),
      topMasPickeados: filas.slice(0, 10),
      malUbicados,
      zonaPreferente,
      oportunidadesMejora: malUbicados.length,
      porRotacion: {
        Alta: filas.filter(f => f.rotacion === 'Alta').length,
        Media: filas.filter(f => f.rotacion === 'Media').length,
        Baja: filas.filter(f => f.rotacion === 'Baja').length,
      },
    },
  };
}
