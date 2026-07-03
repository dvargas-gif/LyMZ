import { supabase } from '../../shared/services/supabaseClient.js';

/**
 * Cambios que cualquier usuario puede hacer sobre SU PROPIO perfil.
 * Usa una función de base (security definer) en vez de un update directo:
 * así nunca hay riesgo de que alguien intente colarse un cambio de rol
 * junto con el apodo — la función solo toca la columna `apodo`.
 */
export const miPerfilService = {
  async actualizarApodo(nuevoApodo) {
    const { error } = await supabase.rpc('actualizar_mi_apodo', { nuevo_apodo: nuevoApodo });
    if (error) throw error;
  },
};
