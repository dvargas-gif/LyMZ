import { supabase } from './supabaseClient.js';

const BUCKET_ADJUNTOS = 'mensajes-adjuntos';
const SEGUNDOS_URL_FIRMADA = 60; // solo alcanza para disparar la descarga -- no queda un link reusable dando vueltas

function filaAMensaje(f) {
  return {
    id: f.id, remitenteId: f.remitente_id, destinatarioId: f.destinatario_id,
    contenido: f.contenido, archivoRuta: f.archivo_url, archivoNombre: f.archivo_nombre, archivoTipo: f.archivo_tipo,
    creadoEn: f.creado_en, leidoEn: f.leido_en,
  };
}

/**
 * Mensajería directa 1 a 1 con adjuntos (sesión 2026-07-22) -- primer uso
 * de Supabase Storage en este proyecto. Sigue el estilo directo de
 * despacho.service.js (supabase.from/.rpc), no el adapter genérico de
 * storage.supabase.js (ese hoy solo lo usa auditoría).
 *
 * El bucket "mensajes-adjuntos" es PRIVADO -- `archivo_url` en la base
 * guarda la RUTA del archivo, no una URL pública. Para descargarlo hay que
 * pedir una URL firmada de corta duración (ver `obtenerUrlDescarga`).
 */
export const mensajesService = {
  /** Perfiles activos para la lista de contactos -- ver perfiles_para_mensajeria() (SQL), no expone lo que sí protege usuariosService.listar(). */
  async listarContactos() {
    const { data, error } = await supabase.rpc('perfiles_para_mensajeria');
    if (error) throw error;
    return data.map(p => ({ id: p.id, nombre: p.nombre, apodo: p.apodo, rol: p.rol }));
  },

  /**
   * Todo el hilo entre los dos, en orden cronológico. RLS ya garantiza que
   * cada fila devuelta tiene a MI usuario en remitente o destinatario --
   * pedir además que `otroUsuarioId` esté en el otro extremo alcanza para
   * acotar exactamente a esta conversación (cada fila solo tiene 2 lugares).
   */
  async listarConversacion(otroUsuarioId) {
    const { data, error } = await supabase
      .from('mensajes')
      .select('*')
      .or(`remitente_id.eq.${otroUsuarioId},destinatario_id.eq.${otroUsuarioId}`)
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return data.map(filaAMensaje);
  },

  /**
   * Último mensaje + no leídos por cada contacto -- para la vista de
   * contactos de PanelFlotanteMensajes.jsx. Trae TODA la mensajería propia
   * (típicamente chica para uso interno) y agrega en el cliente -- evita
   * una función de agregación en la base para un volumen que no lo justifica.
   */
  async listarResumenConversaciones(miUsuarioId) {
    const { data, error } = await supabase
      .from('mensajes')
      .select('*')
      .or(`remitente_id.eq.${miUsuarioId},destinatario_id.eq.${miUsuarioId}`)
      .order('creado_en', { ascending: false });
    if (error) throw error;

    const porContacto = new Map(); // otroUsuarioId -> {ultimoMensaje, noLeidos}
    for (const f of data) {
      const m = filaAMensaje(f);
      const otro = m.remitenteId === miUsuarioId ? m.destinatarioId : m.remitenteId;
      if (!porContacto.has(otro)) porContacto.set(otro, { ultimoMensaje: m, noLeidos: 0 });
      if (m.destinatarioId === miUsuarioId && !m.leidoEn) porContacto.get(otro).noLeidos += 1;
    }
    return porContacto;
  },

  /**
   * Sube el adjunto (si hay) y crea la fila. `archivo` es un File del
   * input -- el path incluye remitente Y destinatario (mismo criterio que
   * la policy de storage.objects, ver el SQL) para no depender de que la
   * fila de `mensajes` ya exista al momento de subir.
   */
  async enviar({ remitenteId, destinatarioId, contenido, archivo }) {
    let archivoRuta = null, archivoNombre = null, archivoTipo = null;
    if (archivo) {
      archivoRuta = `${remitenteId}/${destinatarioId}/${Date.now()}-${archivo.name}`;
      const { error: errorSubida } = await supabase.storage.from(BUCKET_ADJUNTOS).upload(archivoRuta, archivo);
      if (errorSubida) throw errorSubida;
      archivoNombre = archivo.name;
      archivoTipo = archivo.type || null;
    }

    const { data, error } = await supabase
      .from('mensajes')
      .insert({
        remitente_id: remitenteId, destinatario_id: destinatarioId,
        contenido: contenido?.trim() || null,
        archivo_url: archivoRuta, archivo_nombre: archivoNombre, archivo_tipo: archivoTipo,
      })
      .select('*')
      .single();
    if (error) throw error;
    return filaAMensaje(data);
  },

  /** URL firmada de corta duración para descargar un adjunto -- el bucket es privado, nunca hay una URL pública guardada. */
  async obtenerUrlDescarga(archivoRuta) {
    const { data, error } = await supabase.storage.from(BUCKET_ADJUNTOS).createSignedUrl(archivoRuta, SEGUNDOS_URL_FIRMADA);
    if (error) throw error;
    return data.signedUrl;
  },

  async marcarConversacionLeida(otroUsuarioId) {
    const { error } = await supabase.rpc('marcar_conversacion_leida', { p_otro_usuario_id: otroUsuarioId });
    if (error) throw error;
  },

  /** Nuevos mensajes dirigidos a mí, en vivo -- mismo patrón postgres_changes que ya usa crearWarehouseModel.js. */
  suscribirMensajesEntrantes(miUsuarioId, onNuevo) {
    const canal = supabase
      .channel(`mensajes-entrantes-${miUsuarioId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `destinatario_id=eq.${miUsuarioId}` },
        payload => onNuevo(filaAMensaje(payload.new)))
      .subscribe();
    return () => supabase.removeChannel(canal);
  },

  /**
   * Confirmación de lectura en vivo -- pedido explícito 2026-07-22: "y
   * cuando el otro lo vea, que me confirme cuándo es leído". La única
   * actualización que existe sobre una fila de `mensajes` es justo
   * `leido_en` (marcar_mensaje_leido/marcar_conversacion_leida, ver SQL),
   * así que cualquier UPDATE sobre un mensaje que YO mandé es, por
   * construcción, el otro lado marcándolo leído.
   */
  suscribirConfirmacionesLectura(miUsuarioId, onLeido) {
    const canal = supabase
      .channel(`mensajes-confirmaciones-${miUsuarioId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes', filter: `remitente_id=eq.${miUsuarioId}` },
        payload => onLeido(filaAMensaje(payload.new)))
      .subscribe();
    return () => supabase.removeChannel(canal);
  },
};
