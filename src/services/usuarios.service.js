import { supabase } from './supabaseClient.js';

/** Gestión de perfiles/roles — protegido por RLS (solo rol Administrador puede ver/editar todos). */
export const usuariosService = {
  async listar() {
    const { data, error } = await supabase.from('profiles').select('*').order('nombre');
    if (error) throw error;
    return data;
  },

  async actualizarRol(id, rol) {
    const { error } = await supabase.from('profiles').update({ rol }).eq('id', id);
    if (error) throw error;
  },

  async actualizarActivo(id, activo) {
    const { error } = await supabase.from('profiles').update({ activo }).eq('id', id);
    if (error) throw error;
  },

  async actualizarNombre(id, nombre) {
    const { error } = await supabase.from('profiles').update({ nombre }).eq('id', id);
    if (error) throw error;
  },
};
