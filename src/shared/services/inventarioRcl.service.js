import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000;

/** Inventario actual por sub-posición RCL (F1.5-B, `inventario_rcl_actual`) -- se re-importa periódicamente, upsert por sub-posición, nunca un historial. */
export const inventarioRclService = {
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('inventario_rcl_actual')
        .select('rcl_codigo, rcl_nivel, rcl_subnivel, articulo, cantidad')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data.map(d => ({ rclCodigo: d.rcl_codigo, rclNivel: d.rcl_nivel, rclSubnivel: d.rcl_subnivel, articulo: d.articulo, cantidad: d.cantidad })));
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },

  /**
   * Antes de upsertear, borra en dos pasos lo que ya no es real (el archivo
   * es SIEMPRE un export completo de todos los RCL del mezanine, confirmado
   * explícitamente con el usuario 2026-08-24 -- nunca parcial):
   *
   * 1) Racks que quedaron en cero por completo: si un `rcl_codigo` que hoy
   *    existe en la base no aparece EN ABSOLUTO en el archivo nuevo (ningún
   *    nivel/sub-posición), significa que se vació entero -- el archivo no
   *    lista posiciones en cero, las omite. Se borra completo, no solo lo
   *    que "coincide" sub-posición por sub-posición (ese rack nunca
   *    aparecería en ese cruce porque no está en absoluto en el archivo).
   * 2) Artículos "fantasma" dentro de sub-posiciones que SÍ vienen en el
   *    archivo, cuyo artículo ya no aparece en la foto nueva (se
   *    consumió/movió) -- el upsert (clave de 4 columnas: posición+artículo)
   *    solo actualiza o inserta, nunca borra, así que sin esto un artículo
   *    que desaparece de un re-import queda con su cantidad vieja para
   *    siempre.
   */
  async guardarLote(filas, usuarioId) {
    const ahora = new Date().toISOString();
    const filasDb = filas.map(f => ({
      rcl_codigo: f.rclCodigo, rcl_nivel: f.rclNivel, rcl_subnivel: f.rclSubnivel,
      articulo: f.articulo, cantidad: f.cantidad,
      actualizado_por: usuarioId, actualizado_en: ahora,
    }));

    const subposicionesTocadas = new Set(filasDb.map(f => `${f.rcl_codigo}|${f.rcl_nivel}|${f.rcl_subnivel}`));
    const clavesNuevas = new Set(filasDb.map(f => `${f.rcl_codigo}|${f.rcl_nivel}|${f.rcl_subnivel}|${f.articulo}`));
    const codigosUnicos = [...new Set(filasDb.map(f => f.rcl_codigo))];
    const codigosEnArchivo = new Set(codigosUnicos);

    // Paso 1: racks vaciados por completo (ver comentario de arriba).
    const codigosExistentes = new Set();
    {
      let desde = 0;
      while (true) {
        const { data, error } = await supabase.from('inventario_rcl_actual').select('rcl_codigo').range(desde, desde + TAMANO_PAGINA - 1);
        if (error) throw error;
        data.forEach(d => codigosExistentes.add(d.rcl_codigo));
        if (data.length < TAMANO_PAGINA) break;
        desde += TAMANO_PAGINA;
      }
    }
    const codigosVaciados = [...codigosExistentes].filter(c => !codigosEnArchivo.has(c));
    for (let i = 0; i < codigosVaciados.length; i += TAMANO_PAGINA) {
      const { error } = await supabase.from('inventario_rcl_actual').delete().in('rcl_codigo', codigosVaciados.slice(i, i + TAMANO_PAGINA));
      if (error) throw error;
    }

    // Paso 2: artículos fantasma dentro de los rcl_codigo que sí vienen.
    for (let i = 0; i < codigosUnicos.length; i += TAMANO_PAGINA) {
      const { data: existentes, error: errorLectura } = await supabase
        .from('inventario_rcl_actual')
        .select('rcl_codigo, rcl_nivel, rcl_subnivel, articulo')
        .in('rcl_codigo', codigosUnicos.slice(i, i + TAMANO_PAGINA));
      if (errorLectura) throw errorLectura;

      for (const fila of existentes) {
        const claveSubposicion = `${fila.rcl_codigo}|${fila.rcl_nivel}|${fila.rcl_subnivel}`;
        if (!subposicionesTocadas.has(claveSubposicion)) continue; // esta sub-posición no vino en este archivo -- no se toca
        if (clavesNuevas.has(`${claveSubposicion}|${fila.articulo}`)) continue; // sigue estando -- no es fantasma
        const { error } = await supabase.from('inventario_rcl_actual').delete()
          .eq('rcl_codigo', fila.rcl_codigo).eq('rcl_nivel', fila.rcl_nivel).eq('rcl_subnivel', fila.rcl_subnivel).eq('articulo', fila.articulo);
        if (error) throw error;
      }
    }

    for (let i = 0; i < filasDb.length; i += TAMANO_PAGINA) {
      const { error } = await supabase
        .from('inventario_rcl_actual')
        .upsert(filasDb.slice(i, i + TAMANO_PAGINA), { onConflict: 'rcl_codigo,rcl_nivel,rcl_subnivel,articulo' });
      if (error) throw error;
    }
  },
};
