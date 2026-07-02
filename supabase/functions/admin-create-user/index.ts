// Edge Function: crea un usuario nuevo (Supabase Auth + fila en `profiles`).
// Corre en el servidor de Supabase, nunca en el navegador — por eso es el
// único lugar autorizado a usar la SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
// Solo un usuario cuyo perfil tiene rol "Administrador" puede invocarla.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ROLES_VALIDOS = ['Administrador', 'Supervisor', 'Operador', 'Solo lectura'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), { status: 401 });
  }

  // Cliente "como el usuario que llama" (respeta RLS) — para confirmar quién es y su rol.
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
    return new Response(JSON.stringify({ error: 'Solo un Administrador puede crear usuarios' }), { status: 403 });
  }

  const { nombre, email, password, rol } = await req.json();
  if (!nombre || !email || !password || !ROLES_VALIDOS.includes(rol)) {
    return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
  }

  // Cliente admin (service_role) — el único paso que realmente necesita bypassear RLS.
  const clienteAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: nuevo, error: crearError } = await clienteAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (crearError) {
    return new Response(JSON.stringify({ error: crearError.message }), { status: 400 });
  }

  // upsert (no insert): un trigger en auth.users ya crea el perfil por defecto
  // (rol "Solo lectura") apenas se crea el usuario — acá lo sobreescribimos
  // con los datos reales que pidió el Administrador.
  const { error: perfilError } = await clienteAdmin.from('profiles').upsert({
    id: nuevo.user.id, nombre, rol, activo: true,
  });
  if (perfilError) {
    await clienteAdmin.auth.admin.deleteUser(nuevo.user.id); // rollback si falla el perfil
    return new Response(JSON.stringify({ error: perfilError.message }), { status: 400 });
  }

  return new Response(JSON.stringify({ id: nuevo.user.id, email, nombre, rol }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
