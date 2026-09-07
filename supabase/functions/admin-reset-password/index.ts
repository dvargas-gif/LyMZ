// Edge Function: un Administrador le pone una contraseña nueva a otro
// usuario directamente (sin mandar ningún correo) -- pensada para cuando el
// correo de recuperación de Supabase no es una opción (límite de envíos del
// mailer compartido, o el usuario no tiene acceso a su casilla). Corre en el
// servidor de Supabase, nunca en el navegador -- por eso es el único lugar
// autorizado a usar la SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
// Mismo patrón de autenticación que admin-create-user/index.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), { status: 401 });
  }

  // Cliente "como el usuario que llama" (respeta RLS) — para confirmar quién
  // es y su rol. Esta verificación es la que de verdad importa: el botón
  // en UsuariosPanel.jsx ya está oculto para quien no es Administrador, pero
  // eso solo evita que alguien lo vea -- cualquiera podría llamar a esta
  // función directo (DevTools, curl) sin pasar por el botón, así que la
  // restricción real tiene que vivir acá, del lado del servidor.
  const clienteLlamador = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await clienteLlamador.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401 });
  }

  const { data: perfilLlamador } = await clienteLlamador
    .from('profiles')
    .select('rol')
    .eq('id', userData.user.id)
    .single();

  if (perfilLlamador?.rol !== 'Administrador') {
    return new Response(JSON.stringify({ error: 'Solo un Administrador puede resetear contraseñas' }), { status: 403 });
  }

  const { userId, password } = await req.json();
  if (!userId || !password) {
    return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
  }

  // Cliente admin (service_role) — el único paso que realmente necesita bypassear RLS.
  const clienteAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: resetError } = await clienteAdmin.auth.admin.updateUserById(userId, { password });
  if (resetError) {
    return new Response(JSON.stringify({ error: resetError.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
