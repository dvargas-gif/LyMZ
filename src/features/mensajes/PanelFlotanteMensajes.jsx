import { useEffect, useRef, useState } from 'react';
import { mensajesService } from '../../shared/services/mensajes.service.js';
import { iniciales } from '../../shared/utils/iniciales.js';

function formatearHora(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ANCHO_BURBUJA = 52, ANCHO_PANEL = 320, ALTO_PANEL_ESTIMADO = 440, MARGEN = 12;

/**
 * Dónde abrir el panel respecto de la burbuja -- pedido explícito: "que se
 * mueva a un lado donde sí se vea" (bug real reportado con captura: la
 * burbuja arrastrada cerca del borde derecho dejaba el panel cortado fuera
 * de la pantalla, porque siempre anclaba por la izquierda). Elige el lado
 * con más espacio real disponible en cada eje, en vez de asumir siempre
 * "a la izquierda y arriba de la burbuja".
 */
function calcularAnclaje(posicion) {
  const estilo = {};
  const espacioDerecha = window.innerWidth - (posicion.x + ANCHO_BURBUJA);
  const espacioIzquierda = posicion.x;
  if (espacioDerecha >= ANCHO_PANEL + MARGEN || espacioDerecha >= espacioIzquierda) {
    estilo.left = Math.max(MARGEN, Math.min(posicion.x, window.innerWidth - ANCHO_PANEL - MARGEN));
  } else {
    // Ancla por la derecha, pegado al borde derecho de la burbuja -- nunca
    // más cerca del borde de pantalla que MARGEN.
    estilo.right = Math.max(MARGEN, window.innerWidth - (posicion.x + ANCHO_BURBUJA));
  }

  const espacioArriba = posicion.y;
  const espacioAbajo = window.innerHeight - (posicion.y + ANCHO_BURBUJA);
  if (espacioArriba >= ALTO_PANEL_ESTIMADO + MARGEN || espacioArriba >= espacioAbajo) {
    estilo.bottom = window.innerHeight - posicion.y + MARGEN;
  } else {
    estilo.top = posicion.y + ANCHO_BURBUJA + MARGEN;
  }
  return estilo;
}

function Avatar({ nombre, enLinea }) {
  return (
    <span style={{ position: 'relative', flexShrink: 0 }}>
      <span style={{
        width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 800,
      }}>
        {iniciales(nombre)}
      </span>
      {enLinea && (
        <span style={{
          position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%',
          background: '#3FBF7F', border: '2px solid var(--card)',
        }} />
      )}
    </span>
  );
}

function Adjunto({ mensaje }) {
  const [descargando, setDescargando] = useState(false);
  async function descargar() {
    setDescargando(true);
    try {
      const url = await mensajesService.obtenerUrlDescarga(mensaje.archivoRuta);
      window.open(url, '_blank', 'noopener');
    } finally {
      setDescargando(false);
    }
  }
  return (
    <button
      onClick={descargar} disabled={descargando}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: mensaje.contenido ? 6 : 0,
        background: 'var(--fondo-sutil)', border: '1px solid var(--borde-claro)', borderRadius: 8,
        padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', maxWidth: '100%',
      }}
    >
      <i className="ti ti-paperclip" style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mensaje.archivoNombre}</span>
      <i className={`ti ${descargando ? 'ti-loader-2' : 'ti-download'}`} style={{ flexShrink: 0, marginLeft: 'auto' }} />
    </button>
  );
}

/**
 * Panel que despliega la burbuja flotante (ver BurbujaMensajes.jsx) --
 * NO es un ModalBase de overlay bloqueante: pedido explícito del usuario
 * de poder "mover la burbuja a conveniencia" implica que el resto de la
 * app sigue siendo interactuable mientras esto está abierto.
 *
 * Dos vistas con un estado local simple: 'contactos' (lista, conectados
 * primero) y 'conversacion' (hilo con la persona elegida).
 */
export default function PanelFlotanteMensajes({ sesion, conectados, posicion, onCerrar, onCambioNoLeidos }) {
  const [vista, setVista] = useState('contactos');
  const [contactos, setContactos] = useState(null);
  const [resumen, setResumen] = useState(new Map());
  const [contactoActivo, setContactoActivo] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const finRef = useRef(null);

  async function cargarResumen() {
    const r = await mensajesService.listarResumenConversaciones(sesion.usuarioId);
    setResumen(r);
    onCambioNoLeidos([...r.values()].reduce((acc, c) => acc + c.noLeidos, 0));
  }

  useEffect(() => {
    (async () => {
      try {
        const [listaContactos] = await Promise.all([mensajesService.listarContactos(), cargarResumen()]);
        setContactos(listaContactos.filter(c => c.id !== sesion.usuarioId));
      } catch (err) {
        setError(`No se pudo cargar Mensajes: ${err.message || err} -- ¿ya se aplicó el SQL de mensajería y se creó el bucket "mensajes-adjuntos"?`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return mensajesService.suscribirMensajesEntrantes(sesion.usuarioId, async nuevo => {
      if (vista === 'conversacion' && contactoActivo && nuevo.remitenteId === contactoActivo.id) {
        setMensajes(actuales => [...actuales, nuevo]);
        await mensajesService.marcarConversacionLeida(contactoActivo.id);
      }
      cargarResumen();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, contactoActivo]);

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [mensajes]);

  async function abrirConversacion(contacto) {
    setContactoActivo(contacto);
    setVista('conversacion');
    setError('');
    const hilo = await mensajesService.listarConversacion(contacto.id);
    setMensajes(hilo);
    if (resumen.get(contacto.id)?.noLeidos > 0) {
      await mensajesService.marcarConversacionLeida(contacto.id);
      await cargarResumen();
    }
  }

  async function enviarMensaje() {
    if (!texto.trim() && !archivo) return;
    setEnviando(true);
    setError('');
    try {
      const nuevo = await mensajesService.enviar({
        remitenteId: sesion.usuarioId, destinatarioId: contactoActivo.id, contenido: texto, archivo,
      });
      setMensajes(actuales => [...actuales, nuevo]);
      setTexto('');
      setArchivo(null);
      cargarResumen();
    } catch (err) {
      setError(`No se pudo enviar: ${err.message || err}`);
    } finally {
      setEnviando(false);
    }
  }

  const contactosOrdenados = contactos
    ? [...contactos].sort((a, b) => {
        const aOnline = conectados.has(a.id), bOnline = conectados.has(b.id);
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        const fa = resumen.get(a.id)?.ultimoMensaje?.creadoEn ?? '';
        const fb = resumen.get(b.id)?.ultimoMensaje?.creadoEn ?? '';
        return fb.localeCompare(fa);
      })
    : [];

  return (
    <div className="panel-flotante-mensajes" style={calcularAnclaje(posicion)}>
      <div className="panel-flotante-mensajes__header">
        {vista === 'conversacion' ? (
          <button className="panel-flotante-mensajes__volver" onClick={() => setVista('contactos')}>
            <i className="ti ti-chevron-left" /> {contactoActivo?.apodo || contactoActivo?.nombre}
          </button>
        ) : (
          <span><i className="ti ti-message-circle" /> Mensajes</span>
        )}
        <button className="panel-flotante-mensajes__cerrar" onClick={onCerrar} title="Cerrar"><i className="ti ti-x" /></button>
      </div>

      {vista === 'contactos' && (
        <div className="panel-flotante-mensajes__lista">
          {contactos === null && !error && <p className="muted" style={{ textAlign: 'center', padding: 20, fontSize: 12.5 }}>Cargando…</p>}
          {contactos === null && error && <p style={{ color: 'var(--red)', fontSize: 12, padding: '16px 14px', margin: 0 }}>{error}</p>}
          {contactos?.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 20, fontSize: 12.5 }}>No hay otros usuarios todavía.</p>}
          {contactosOrdenados.map(c => {
            const info = resumen.get(c.id);
            return (
              <button key={c.id} className="panel-flotante-mensajes__contacto" onClick={() => abrirConversacion(c)}>
                <Avatar nombre={c.apodo || c.nombre} enLinea={conectados.has(c.id)} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: 13 }}>{c.apodo || c.nombre}</strong>
                    <span style={{ fontSize: 10.5, color: 'var(--texto-tenue)' }}>{c.rol}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--texto-tenue)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {info?.ultimoMensaje ? (info.ultimoMensaje.contenido || `📎 ${info.ultimoMensaje.archivoNombre}`) : (conectados.has(c.id) ? 'En línea' : '—')}
                  </span>
                </span>
                {info?.noLeidos > 0 && <span className="panel-flotante-mensajes__badge">{info.noLeidos}</span>}
              </button>
            );
          })}
        </div>
      )}

      {vista === 'conversacion' && (
        <>
          <div className="panel-flotante-mensajes__hilo">
            {mensajes.map(m => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.remitenteId === sesion.usuarioId ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div style={{
                  maxWidth: '80%', padding: '7px 11px', borderRadius: 12, fontSize: 13,
                  background: m.remitenteId === sesion.usuarioId ? 'var(--accent)' : 'var(--fondo-sutil)',
                  color: m.remitenteId === sesion.usuarioId ? '#fff' : 'inherit',
                }}>
                  {m.contenido && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.contenido}</div>}
                  {m.archivoRuta && <Adjunto mensaje={m} />}
                </div>
                <span style={{ fontSize: 10, color: 'var(--texto-placeholder)', marginTop: 2 }}>{formatearHora(m.creadoEn)}</span>
              </div>
            ))}
            <div ref={finRef} />
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: 11.5, margin: '0 10px' }}>{error}</p>}

          <div className="panel-flotante-mensajes__compositor">
            {archivo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--texto-tenue)', marginBottom: 6 }}>
                <i className="ti ti-paperclip" /> {archivo.name}
                <button onClick={() => setArchivo(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--red)' }}><i className="ti ti-x" /></button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <label style={{ cursor: 'pointer', color: 'var(--texto-tenue)', padding: '6px 0' }}>
                <i className="ti ti-paperclip" style={{ fontSize: 18 }} />
                <input type="file" style={{ display: 'none' }} onChange={e => setArchivo(e.target.files[0] ?? null)} />
              </label>
              <textarea
                value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribí un mensaje…" rows={1}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); } }}
                style={{ flex: 1, resize: 'none', border: '1px solid var(--borde-input)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13, maxHeight: 80 }}
              />
              <button className="btn-primary" disabled={enviando || (!texto.trim() && !archivo)} onClick={enviarMensaje} style={{ padding: '0 12px', height: 34 }}>
                <i className="ti ti-send" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
