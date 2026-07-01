import { supabase } from '../services/supabaseClient.js';

/**
 * El hash/verificación de contraseña ya no pasa por el cliente: lo hace
 * Supabase Auth (GoTrue) del lado del servidor. Esta capa solo traduce
 * la sesión de Supabase + la fila de `profiles` a la forma de "sesión"
 * que ya consumía el resto de la app (usuarioId, nombre, rol, ip...).
 */
async function obtenerIP() {
  // Sigue sin haber forma confiable de obtener la IP real desde el navegador.
  return 'no-disponible-en-cliente';
}

async function cargarPerfil(user) {
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!data) return null;
  return { usuarioId: user.id, nombre: data.nombre, usuario: user.email, rol: data.rol, activo: data.activo };
}

function construirSesion(perfil, ip) {
  return {
    usuarioId: perfil.usuarioId, nombre: perfil.nombre, usuario: perfil.usuario,
    rol: perfil.rol, inicio: new Date().toISOString(), ip,
  };
}

export const authService = {
  async login(email, password) {
    const ip = await obtenerIP();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // El intento queda registrado exista o no la cuenta, exitoso o no.
    await supabase.from('intentos_login').insert({ email, ip, exitoso: !error });

    if (error) throw new Error('Usuario o contraseña incorrectos');

    const perfil = await cargarPerfil(data.user);
    if (!perfil) {
      await supabase.auth.signOut();
      throw new Error('El usuario no tiene un perfil asignado en la app.');
    }
    if (!perfil.activo) {
      await supabase.auth.signOut();
      throw new Error('Usuario inactivo');
    }

    return construirSesion(perfil, ip);
  },

  async logout() {
    await supabase.auth.signOut();
  },

  /** Sesión actual (si hay una válida). Async porque ahora depende de Supabase, no de localStorage sincrónico. */
  async getSesion() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const perfil = await cargarPerfil(session.user);
    if (!perfil || !perfil.activo) return null;
    return construirSesion(perfil, 'no-disponible-en-cliente');
  },

  /** Se dispara en login/logout/refresh de token, incluso si ocurren en otra pestaña. */
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) { callback(null); return; }
      const perfil = await cargarPerfil(session.user);
      callback(perfil && perfil.activo ? construirSesion(perfil, 'no-disponible-en-cliente') : null);
    });
  },

  async cambiarPassword(nuevaPassword) {
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
    if (error) throw new Error(error.message);
  },
};
