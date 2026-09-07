import { supabase } from '../../shared/services/supabaseClient.js';

const TAMANO_PAGINA = 1000; // límite por página que aplica PostgREST/Supabase por defecto

/** Gestión de perfiles/roles — protegido por RLS (solo rol Administrador puede ver/editar todos). */
export const usuariosService = {
  /** Trae TODAS las filas paginando — un solo select() se corta en 1000 filas. */
  async listar() {
    const todos = [];
    let desde = 0;
    while (true) {
      const { data, error } = await supabase.from('profiles').select('*').order('nombre').range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw error;
      todos.push(...data);
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    return todos;
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

  /**
   * Resetea la contraseña de OTRO usuario sin pasar por correo (ver
   * supabase/functions/admin-reset-password) -- pensado para cuando el
   * mailer compartido de Supabase está al límite de envíos, o el usuario no
   * tiene acceso a su casilla. La Edge Function vuelve a chequear "solo
   * Administrador" del lado del servidor -- acá no alcanza con que el botón
   * esté oculto en la UI.
   */
  async resetearPassword(userId, nuevaPassword) {
    const { error } = await supabase.functions.invoke('admin-reset-password', {
      body: { userId, password: nuevaPassword },
    });
    if (error) {
      let mensaje = error.message;
      if (error.context?.json) {
        try { mensaje = (await error.context.json()).error || mensaje; } catch { /* deja el mensaje genérico */ }
      }
      throw new Error(mensaje);
    }
  },
};
