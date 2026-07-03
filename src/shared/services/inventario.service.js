import { supabase } from './supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/** Plan base del slotting (foto original, 3016 artículos) — solo lectura. */
export const inventarioService = {
  async listar() {
    const todas = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase
        .from('inventario_slotting')
        .select('articulo,pasillo,columna,nivel,clase,tipo,picks,consumo,rack_actual,niveles_a_armar')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todas.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todas;
  },
};
