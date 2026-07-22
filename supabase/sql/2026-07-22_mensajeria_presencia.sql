-- =====================================================================
-- Mensajería directa 1 a 1 + presencia en tiempo real (sesión 2026-07-22)
-- -- pedido explícito del usuario: poder ver quién está conectado y
-- mandar mensajes/documentos puntuales "para evitar los atrasos por
-- comunicación". Aplica a los 4 roles (Administrador/Supervisor/Operador/
-- Solo lectura).
--
-- PASO MANUAL PREVIO (no se puede hacer 100% por SQL de forma segura):
-- crear el bucket PRIVADO "mensajes-adjuntos" desde Supabase Dashboard ->
-- Storage -> New bucket, antes de correr este archivo. Las políticas de
-- storage.objects de acá abajo asumen que ese bucket ya existe.
--
-- Primera vez que este proyecto usa Realtime Presence y Storage -- mismo
-- cuidado que ya se usó para Despacho: RLS explícito, RPCs
-- `security definer` para lo sensible, nada de confiar en el cliente.
-- =====================================================================

create table if not exists mensajes (
  id bigserial primary key,
  remitente_id uuid not null references profiles(id),
  destinatario_id uuid not null references profiles(id),
  contenido text,
  archivo_url text,
  archivo_nombre text,
  archivo_tipo text,
  creado_en timestamptz not null default now(),
  leido_en timestamptz,
  constraint mensajes_no_vacio check (contenido is not null or archivo_url is not null)
);

create index if not exists idx_mensajes_conversacion on mensajes (least(remitente_id, destinatario_id), greatest(remitente_id, destinatario_id), creado_en);
create index if not exists idx_mensajes_destinatario_pendiente on mensajes (destinatario_id) where leido_en is null;

alter table mensajes enable row level security;

-- Cualquiera de los dos participantes puede leer la fila -- nunca un tercero.
create policy mensajes_select on mensajes for select to authenticated
  using (auth.uid() = remitente_id or auth.uid() = destinatario_id);

-- El INSERT fija remitente_id = quien está autenticado -- si solo pidiera
-- "auth.uid() en el par", cualquiera podría insertar haciéndose pasar por
-- remitente de otra persona. destinatario_id <> auth.uid() (no mandarse
-- mensajes a uno mismo) y tiene que ser un perfil activo real.
create policy mensajes_insert on mensajes for insert to authenticated
  with check (
    remitente_id = auth.uid()
    and destinatario_id <> auth.uid()
    and exists (select 1 from profiles p where p.id = destinatario_id and p.activo)
  );

-- Sin política de UPDATE a nivel tabla -- RLS no puede restringir a una
-- sola columna (alguien con permiso de UPDATE podría reescribir
-- `contenido` de un mensaje ajeno-a-medias). Marcar leído va SOLO por este
-- RPC, mismo patrón que ya usa confirmar_tarea_despacho.
create or replace function marcar_mensaje_leido(p_mensaje_id bigint)
returns void as $$
begin
  update mensajes
    set leido_en = now()
    where id = p_mensaje_id and destinatario_id = auth.uid() and leido_en is null;
end;
$$ language plpgsql security definer;

-- Marca TODA una conversación como leída de una sola vez (al abrir el
-- hilo) -- evita N llamados al RPC anterior por cada mensaje pendiente.
create or replace function marcar_conversacion_leida(p_otro_usuario_id uuid)
returns void as $$
begin
  update mensajes
    set leido_en = now()
    where destinatario_id = auth.uid() and remitente_id = p_otro_usuario_id and leido_en is null;
end;
$$ language plpgsql security definer;

-- `usuariosService.listar()` (profiles) sigue restringido a Administrador
-- -- no se afloja esa RLS (es la de gestión de cuentas). Este RPC angosto,
-- de solo lectura, es lo único que la mensajería necesita: id/nombre/apodo/
-- rol de cada perfil activo, para armar la lista de contactos.
create or replace function perfiles_para_mensajeria()
returns table(id uuid, nombre text, apodo text, rol text) as $$
  select id, nombre, apodo, rol from profiles where activo;
$$ language sql security definer stable;

-- ---------------------------------------------------------------------
-- Storage: bucket "mensajes-adjuntos" (privado, creado a mano en el
-- Dashboard, ver nota de arriba). Path convencional de cada archivo:
-- {remitente_id}/{destinatario_id}/{timestamp}-{nombre_original} --
-- incluir AMBOS ids en el path deja que la política filtre sin tocar la
-- tabla `mensajes` en absoluto (sin subquery, sin depender de que la fila
-- ya exista antes de subir el archivo).
-- ---------------------------------------------------------------------
create policy mensajes_adjuntos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'mensajes-adjuntos'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or auth.uid()::text = (storage.foldername(name))[2]
    )
  );

create policy mensajes_adjuntos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mensajes-adjuntos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
