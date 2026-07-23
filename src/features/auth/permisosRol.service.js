import { supabase } from '../../shared/services/supabaseClient.js';

/**
 * Matriz de permisos por rol, editable en vivo (2026-07-23) -- ver
 * supabase/sql/2026-07-23_permisos_rol.sql y establecerPermisosPersonalizados
 * en roles.js. Si la tabla no existe todavía (SQL sin aplicar), `listar()`
 * tira -- quien lo llama (AuthContext) lo atrapa y sigue con el default de
 * roles.js sin romper nada.
 */
export const permisosRolService = {
  async listar() {
    const { data, error } = await supabase.from('permisos_rol').select('rol, accion, permitido');
    if (error) throw error;
    return data;
  },

  /** Solo Administrador (RLS) -- una sola casilla de la matriz. */
  async actualizar(rol, accion, permitido) {
    const { error } = await supabase.from('permisos_rol').upsert({ rol, accion, permitido }, { onConflict: 'rol,accion' });
    if (error) throw error;
  },
};
