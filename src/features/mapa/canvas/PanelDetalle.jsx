import { nArts, consumoTotal, llenura, colorLlenura } from '../../../domain/formulasOcupacion.js';
import { VERDE_ESTRUCTURA, BLANCO_CALIDO, BLANCO_HUESO_TARJETA, GRIS_TEXTO, GRIS_TEXTO_TENUE, BORDE_CLARO } from './paleta.js';

const ORDEN_NIVELES = ['N05', 'N04', 'N03', 'N02', 'N01', 'CUERPO']; // mismo criterio que NIVORDER del mapa legacy

/**
 * Panel de detalle de un rack -- misma información que el modal del mapa
 * legacy (niveles, artículos, consumo, picks, rack actual), presentada con
 * tarjetas, iconos y barras de llenado en vez de texto plano. Los botones
 * Mover/Mover cuerpo/Bloquear delegan TODA la lógica (validación,
 * persistencia, deshacer) en MapaCanvas.jsx -- este panel solo dispara los
 * callbacks, igual que el modal legacy solo llamaba a iniciarMover()/etc.
 *
 * El cierre lo maneja la pestaña (BarraPestanas.jsx), no un botón acá --
 * un rack abierto siempre es una pestaña, nunca una ventana suelta.
 *
 * `oculto` (minimizado): el panel queda SIEMPRE montado -- lo que cambia es
 * la clase .mapa-panel--oculto (canvas.css), para que ocultarse/mostrarse
 * anime suave (fade + escala, estilo iOS) en vez de aparecer/desaparecer
 * de golpe como pasaba con el mount/unmount de React.
 */
export default function PanelDetalle({
  clave, rack, configuracionOcupacion, descripcionDe, oculto,
  onMoverCuerpo, onMoverArticulo, moviendoAlgo,
  bloqueada, onToggleBloqueo,
  soloLectura = false,
}) {
  const [pasillo, columna] = clave.split('|');
  const niveles = ORDEN_NIVELES.filter(n => rack.niveles[n]?.length);
  const llenuraTotal = configuracionOcupacion ? llenura(rack, configuracionOcupacion) : 0;
  const nivelesOcupados = niveles.length;

  return (
    <div
      className={`mapa-panel${oculto ? ' mapa-panel--oculto' : ''}`}
      style={{
        background: 'rgba(247, 243, 234, .96)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        color: GRIS_TEXTO, borderRadius: '0 0 12px 12px', border: `1px solid ${BORDE_CLARO}`, borderTop: 'none',
        boxShadow: '0 20px 60px rgba(0,0,0,.22)', overflowY: 'auto', flex: 1,
      }}
    >
      <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <i className="ti ti-box" style={{ fontSize: 18, color: VERDE_ESTRUCTURA }} />
            <div style={{ fontSize: 17, fontWeight: 700 }}>{pasillo} · C{String(columna).padStart(3, '0')}</div>
            {bloqueada && <i className="ti ti-lock" title="Posición bloqueada" style={{ fontSize: 14, color: '#C99A4A' }} />}
          </div>
          <div style={{ fontSize: 11.5, color: GRIS_TEXTO_TENUE, marginLeft: 26 }}>{nArts(rack)} artículo(s) en {nivelesOcupados} nivel(es)</div>
        </div>
        {!soloLectura && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <BotonAccion icono="ti-arrows-move" etiqueta="Mover cuerpo" onClick={onMoverCuerpo} deshabilitado={moviendoAlgo || nArts(rack) === 0} />
            <BotonAccion icono={bloqueada ? 'ti-lock-open' : 'ti-lock'} etiqueta={bloqueada ? 'Desbloquear' : 'Bloquear'} onClick={onToggleBloqueo} activo={bloqueada} />
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '0 16px 16px' }}>
        <TarjetaKpi icono="ti-percentage" etiqueta="Capacidad" valor={`${Math.round(llenuraTotal * 100)}%`} />
        <TarjetaKpi icono="ti-package" etiqueta="Artículos" valor={nArts(rack)} />
        <TarjetaKpi icono="ti-layers-intersect" etiqueta="Niveles" valor={nivelesOcupados} />
        <TarjetaKpi icono="ti-chart-bar" etiqueta="Consumo" valor={consumoTotal(rack).toFixed(2)} />
      </div>

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {niveles.map(nivel => (
          <TarjetaNivel
            key={nivel}
            pasillo={pasillo}
            columna={columna}
            nivel={nivel}
            articulos={rack.niveles[nivel]}
            configuracionOcupacion={configuracionOcupacion}
            descripcionDe={descripcionDe}
            onMoverArticulo={soloLectura ? null : onMoverArticulo}
            moviendoAlgo={moviendoAlgo}
          />
        ))}
      </div>
    </div>
  );
}

function BotonAccion({ icono, etiqueta, onClick, activo, deshabilitado }) {
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      title={etiqueta}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
        border: `1px solid ${BORDE_CLARO}`, cursor: deshabilitado ? 'default' : 'pointer',
        background: activo ? VERDE_ESTRUCTURA : 'transparent', color: activo ? BLANCO_CALIDO : GRIS_TEXTO_TENUE,
        opacity: deshabilitado ? 0.4 : 1, transition: 'background .15s var(--ease-ios), opacity .15s var(--ease-ios)',
      }}
    >
      <i className={`ti ${icono}`} style={{ fontSize: 12 }} />
      {etiqueta}
    </button>
  );
}

function TarjetaKpi({ icono, etiqueta, valor }) {
  return (
    <div style={{ background: BLANCO_HUESO_TARJETA, border: `1px solid ${BORDE_CLARO}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: GRIS_TEXTO_TENUE, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>
        <i className={`ti ${icono}`} style={{ fontSize: 13 }} />
        {etiqueta}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{valor}</div>
    </div>
  );
}

/** Un nivel del rack como tarjeta propia -- barra de llenado en vez de solo el número, mismo cálculo de llenura()/colorLlenura() del dominio, aplicado a este nivel solo (no al rack entero). */
function TarjetaNivel({ pasillo, columna, nivel, articulos, configuracionOcupacion, descripcionDe, onMoverArticulo, moviendoAlgo }) {
  const rackDeEsteNivel = { niveles: { [nivel]: articulos } };
  const proporcion = configuracionOcupacion ? llenura(rackDeEsteNivel, configuracionOcupacion) : 0;
  const color = configuracionOcupacion ? colorLlenura(proporcion, configuracionOcupacion) : VERDE_ESTRUCTURA;
  // Nombre completo de esta ubicación -- pasillo+columna+nivel, el mismo criterio
  // que ya usan las pestañas (BarraPestanas.jsx), pero acá varía según el nivel
  // (cada nivel es una ubicación física distinta dentro del mismo rack).
  const nombreCompleto = `${pasillo}-C${String(columna).padStart(3, '0')}-${nivel}`;

  return (
    <div className="mapa-panel-nivel" style={{ background: BLANCO_HUESO_TARJETA, border: `1px solid ${BORDE_CLARO}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE }}>
            <i className="ti ti-layers-intersect" style={{ fontSize: 13 }} />
            {nivel === 'CUERPO' ? 'Cuerpo entero' : nivel}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: GRIS_TEXTO_TENUE, opacity: 0.85, marginTop: 2, marginLeft: 19 }}>{nombreCompleto}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color }}>{Math.round(proporcion * 100)}%</div>
      </div>

      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,.08)', overflow: 'hidden', marginBottom: 10 }}>
        <div className="mapa-panel-barra__relleno" style={{ height: '100%', width: `${Math.min(proporcion, 1) * 100}%`, background: color, borderRadius: 2 }} />
      </div>

      {articulos.map(a => (
        <div key={a.articulo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0', borderTop: '1px solid rgba(0,0,0,.08)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.articulo}</div>
            <div style={{ color: GRIS_TEXTO_TENUE, fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{descripcionDe(a.articulo)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ textAlign: 'right', color: GRIS_TEXTO_TENUE, fontSize: 10.5 }}>
              <div>consumo {(a.consumo ?? 0).toFixed(2)}</div>
              <div>{a.picks ?? 0} picks</div>
              <div>{a.rackActual || 'sin ubic.'}</div>
            </div>
            {onMoverArticulo && (
              <button
                onClick={() => onMoverArticulo(a.articulo, nivel, a.clase, a.tipo)}
                disabled={moviendoAlgo}
                title={`Mover ${a.articulo}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6,
                  border: `1px solid ${BORDE_CLARO}`, background: 'transparent', color: GRIS_TEXTO_TENUE, fontSize: 11,
                  cursor: moviendoAlgo ? 'default' : 'pointer', opacity: moviendoAlgo ? 0.4 : 1,
                }}
              >
                <i className="ti ti-arrows-move" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
