import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { nArts, consumoTotal, llenura, colorLlenura, colorArticulo } from '../../../domain/formulasOcupacion.js';
import { VERDE_ESTRUCTURA, BLANCO_CALIDO, BLANCO_HUESO_TARJETA, GRIS_TEXTO, GRIS_TEXTO_TENUE, BORDE_CLARO, ESTADOS } from './paleta.js';
import { interaccionBoton } from '../../../ui/motion/variants.js';
import { DURACION, EASING } from '../../../ui/motion/tokens.js';
import { useReducedMotion } from '../../../ui/motion/prefersReducedMotion.js';
import { puedeIniciarTraslado, puedeConfirmar } from '../../migracion/flujoMigracionSlot.js';
import FlujoMigracionSlot from './FlujoMigracionSlot.jsx';

const ORDEN_NIVELES = ['N05', 'N04', 'N03', 'N02', 'N01', 'CUERPO']; // mismo criterio que NIVORDER del mapa legacy
const NIVELES_FISICOS = ['N05', 'N04', 'N03', 'N02', 'N01']; // los 5 niveles reales del rack, sin CUERPO -- para dibujarlos SIEMPRE, ocupados o no (ver EstanteVacio)

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
  clave, rack, vistaContenido = 'mz', configuracionOcupacion, descripcionDe, oculto,
  onMoverCuerpo, onMoverArticulo, moviendoAlgo,
  bloqueada, onToggleBloqueo,
  soloLectura = false,
  enSala = false, onLimpiarSlot,
  // F2 -- migración RCL->MZ, ver DECISIONES.md ADR-015. Todo esto es
  // undefined/no-op fuera del mapa real (enSala=true nunca lo usa).
  migracionEstado, puedeMigrar = false, puedeElegirLibremente = true, puedeConfirmarMigracion = false,
  onIniciarTraslado, onConfirmarFinalizado, onDepositarBuffer, onMarcarListoMigracion, onCancelarTraslado, onDevolverBuffer,
  movimientosPendientesSlot = [], bufferDelSlot = [], etiquetaRcl = null, onMarcarRecolectado,
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
            <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {etiquetaRcl ?? `${pasillo} · C${String(columna).padStart(3, '0')}`}
            </div>
            {bloqueada && <i className="ti ti-lock" title="Posición bloqueada" style={{ fontSize: 14, color: '#C99A4A' }} />}
          </div>
          {/* Mientras se lee en nomenclatura RCL, la posición MZ real (para ubicarla en el mapa) queda como referencia chica -- nunca se pierde del todo. */}
          {etiquetaRcl && (
            <div style={{ fontSize: 10.5, color: GRIS_TEXTO_TENUE, marginLeft: 26, marginTop: -2 }}>
              {pasillo} · C{String(columna).padStart(3, '0')}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: GRIS_TEXTO_TENUE, marginLeft: 26, fontVariantNumeric: 'tabular-nums' }}>{nArts(rack)} artículo(s) en {nivelesOcupados} nivel(es)</div>
        </div>
        {!soloLectura && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <BotonAccion icono="ti-arrows-move" etiqueta="Mover cuerpo" onClick={onMoverCuerpo} deshabilitado={moviendoAlgo || nArts(rack) === 0} />
            <BotonAccion icono={bloqueada ? 'ti-lock-open' : 'ti-lock'} etiqueta={bloqueada ? 'Desbloquear' : 'Bloquear'} onClick={onToggleBloqueo} activo={bloqueada} />
            {/* "Limpiar slot" -- SOLO sala, mismo criterio que el botón "🧹 Limpiar slot" del mapa legacy (07-render.js): vacía ESTE rack puntual, distinto de "Limpiar área" (multi-selección, ver barra de acciones de la sala). No existe para el mapa real. */}
            {enSala && (
              <BotonAccion icono="ti-trash" etiqueta="Vaciar rack" onClick={onLimpiarSlot} deshabilitado={moviendoAlgo || nArts(rack) === 0} destructivo />
            )}
            {/* F2 -- visibilidad CONTEXTUAL, sin un "modo migración" global (decisión explícita del usuario): el botón aparece solo cuando hay trabajo real que hacer en ESTE slot. `puedeElegirLibremente` (Supervisor/Administrador) -- Operador ya no elige el rack a mano, solo tiene "Generar movimiento" en la barra (ver MapaToolbar.jsx/MapaCanvas.jsx). */}
            {!enSala && puedeMigrar && puedeElegirLibremente && puedeIniciarTraslado(migracionEstado) && (
              <BotonAccion icono="ti-truck-delivery" etiqueta="Iniciar traslado" onClick={onIniciarTraslado} deshabilitado={moviendoAlgo} />
            )}
            {!enSala && puedeConfirmarMigracion && puedeConfirmar(migracionEstado) && (
              <BotonAccion icono="ti-shield-check" etiqueta="Confirmar finalizado" onClick={onConfirmarFinalizado} deshabilitado={moviendoAlgo} />
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '0 16px 16px' }}>
        <TarjetaKpi icono="ti-percentage" etiqueta="Capacidad" valor={`${Math.round(llenuraTotal * 100)}%`} />
        <TarjetaKpi icono="ti-package" etiqueta="Artículos" valor={nArts(rack)} />
        <TarjetaKpi icono="ti-layers-intersect" etiqueta="Niveles" valor={nivelesOcupados} />
        <TarjetaKpi icono="ti-chart-bar" etiqueta="Consumo" valor={consumoTotal(rack).toFixed(2)} />
      </div>

      {!enSala && (
        <FlujoMigracionSlot
          estado={migracionEstado}
          puedeMigrar={puedeMigrar}
          onMarcarListo={onMarcarListoMigracion}
          onCancelarTraslado={onCancelarTraslado}
          onDevolver={onDevolverBuffer}
          movimientosPendientes={movimientosPendientesSlot}
          onMarcarRecolectado={onMarcarRecolectado}
          bufferDelSlot={bufferDelSlot}
          ocupado={moviendoAlgo}
        />
      )}

      {/*
        Niveles físicos SIEMPRE los 5 (N05 arriba .. N01 abajo, orden real
        del rack -- 2026-08-26, pedido explícito: "que la ventana se vea
        como un rack"), ocupados o no -- antes solo se mostraban los
        ocupados, perdiendo la forma del mueble completo. CUERPO (vista
        agrupada, no es un nivel físico real) sigue apareciendo solo cuando
        hay contenido, sin slot vacío -- no tiene un "hueco" físico propio.
        Los rieles laterales (.mapa-panel-rack, canvas.css) son el marco del
        mueble.
      */}
      <div className="mapa-panel-rack" style={{ padding: '0 22px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {NIVELES_FISICOS.map(nivel => (
          rack.niveles[nivel]?.length ? (
            <TarjetaNivel
              key={nivel}
              pasillo={pasillo}
              columna={columna}
              nivel={nivel}
              vistaContenido={vistaContenido}
              articulos={rack.niveles[nivel]}
              rackCompleto={rack}
              configuracionOcupacion={configuracionOcupacion}
              llenuraRack={llenuraTotal}
              descripcionDe={descripcionDe}
              onMoverArticulo={soloLectura ? null : onMoverArticulo}
              moviendoAlgo={moviendoAlgo}
              onDepositarBuffer={migracionEstado === 'vaciando' ? onDepositarBuffer : null}
            />
          ) : (
            <EstanteVacio key={nivel} nivel={nivel} />
          )
        ))}
        {rack.niveles.CUERPO?.length > 0 && (
          <TarjetaNivel
            key="CUERPO"
            pasillo={pasillo}
            columna={columna}
            nivel="CUERPO"
            vistaContenido={vistaContenido}
            articulos={rack.niveles.CUERPO}
            rackCompleto={rack}
            configuracionOcupacion={configuracionOcupacion}
            llenuraRack={llenuraTotal}
            descripcionDe={descripcionDe}
            onMoverArticulo={soloLectura ? null : onMoverArticulo}
            moviendoAlgo={moviendoAlgo}
            onDepositarBuffer={migracionEstado === 'vaciando' ? onDepositarBuffer : null}
          />
        )}
      </div>
    </div>
  );
}

/** Estante vacío -- barra delgada, sin llenado ni artículos, solo para que se vea la forma completa del rack (5 niveles) aunque este puntual no tenga nada. */
function EstanteVacio({ nivel }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 8,
      border: `1px dashed ${BORDE_CLARO}`, opacity: .55,
    }}>
      <i className="ti ti-layers-intersect" style={{ fontSize: 12, color: GRIS_TEXTO_TENUE }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE }}>{nivel}</span>
      <span style={{ fontSize: 10.5, color: GRIS_TEXTO_TENUE }}>Vacío</span>
    </div>
  );
}

function BotonAccion({ icono, etiqueta, onClick, activo, deshabilitado, destructivo }) {
  const reducido = useReducedMotion();
  const colorDestructivo = ESTADOS.sobrecargado; // mismo rojo que "sobrecargado" en el resto de la app -- no se inventa un rojo nuevo
  return (
    <motion.button
      onClick={onClick}
      disabled={deshabilitado}
      title={etiqueta}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
        border: `1px solid ${destructivo ? colorDestructivo : BORDE_CLARO}`, cursor: deshabilitado ? 'default' : 'pointer',
        background: activo ? VERDE_ESTRUCTURA : 'transparent', color: activo ? BLANCO_CALIDO : (destructivo ? colorDestructivo : GRIS_TEXTO_TENUE),
        opacity: deshabilitado ? 0.4 : 1, transition: 'background .15s var(--ease-ios), opacity .15s var(--ease-ios), color .15s var(--ease-ios)',
      }}
      {...(deshabilitado ? {} : interaccionBoton(reducido))}
    >
      <i className={`ti ${icono}`} style={{ fontSize: 12 }} />
      {etiqueta}
    </motion.button>
  );
}

function TarjetaKpi({ icono, etiqueta, valor }) {
  return (
    <div style={{ background: BLANCO_HUESO_TARJETA, border: `1px solid ${BORDE_CLARO}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: GRIS_TEXTO_TENUE, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>
        <i className={`ti ${icono}`} style={{ fontSize: 13 }} />
        {etiqueta}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
    </div>
  );
}

/** Un nivel del rack como tarjeta propia -- barra de llenado en vez de solo el número, mismo cálculo de llenura()/colorLlenura() del dominio, aplicado a este nivel solo (no al rack entero). */
function TarjetaNivel({ pasillo, columna, nivel, vistaContenido = 'mz', articulos, rackCompleto, configuracionOcupacion, llenuraRack, descripcionDe, onMoverArticulo, moviendoAlgo, onDepositarBuffer }) {
  const rackDeEsteNivel = { niveles: { [nivel]: articulos } };
  const proporcion = configuracionOcupacion ? llenura(rackDeEsteNivel, configuracionOcupacion) : 0;
  const color = configuracionOcupacion ? colorLlenura(proporcion, configuracionOcupacion) : VERDE_ESTRUCTURA;

  return (
    <div className="mapa-panel-nivel" style={{ background: BLANCO_HUESO_TARJETA, border: `1px solid ${BORDE_CLARO}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE }}>
          <i className="ti ti-layers-intersect" style={{ fontSize: 13 }} />
          {nivel === 'CUERPO' ? 'Cuerpo entero' : nivel}
        </div>
        {/* % de ESTE NIVEL -- ver ChipPorcentaje() para el % del RACK completo, que va por artículo más abajo. Etiqueta explícita en ambos para que nunca parezcan el mismo dato. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE }}>Nivel</span>
          <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{Math.round(proporcion * 100)}%</span>
        </div>
      </div>

      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,.08)', overflow: 'hidden', marginBottom: 10 }}>
        <div className="mapa-panel-barra__relleno" style={{ height: '100%', width: `${Math.min(proporcion, 1) * 100}%`, background: color, borderRadius: 2 }} />
      </div>

      {articulos.map(a => (
        <div key={a.articulo} style={{ padding: '8px 0', borderTop: '1px solid rgba(0,0,0,.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{a.articulo}</div>
              <div style={{ color: GRIS_TEXTO, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{descripcionDe(a.articulo)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <ChipPorcentaje
                etiqueta="Rack" proporcion={llenuraRack} configuracionOcupacion={configuracionOcupacion}
                rack={rackCompleto} descripcionDe={descripcionDe}
              />
              {onMoverArticulo && (
                <BotonMoverArticulo
                  onClick={() => onMoverArticulo(a.articulo, nivel, a.clase, a.tipo)}
                  deshabilitado={moviendoAlgo}
                  etiqueta={`Mover ${a.articulo}`}
                />
              )}
              {/* F2 -- paso 1 (vaciar): solo visible mientras este slot está "vaciando". Distinto del botón "Mover" de arriba (destino elegido a mano) -- este va directo al buffer. */}
              {onDepositarBuffer && (
                <BotonMoverArticulo
                  icono="ti-corner-down-right"
                  onClick={() => onDepositarBuffer(a.articulo, nivel, a.clase, a.tipo)}
                  deshabilitado={moviendoAlgo}
                  etiqueta={`Mover ${a.articulo} al carrito de traslado`}
                />
              )}
            </div>
          </div>

          {/*
            En vista MZ: viaje origen -> destino real (RCL de rack_actual
            hacia el MZ del plan de migración, un movimiento de verdad) --
            flecha correcta, confirmado con el usuario que son dos datos
            reales, con el mismo peso visual.
            En vista RCL (2026-08-26, corrección pedida por David tras la
            confusión real de esta sesión): este RCL y este MZ NO son
            "origen -> destino", son la MISMA posición física con dos
            nombres (identidad_legacy) -- una flecha ahí sugiere viaje donde
            no lo hay. Se usa "=" en vez de flecha; el viaje real (si existe)
            lo dice ComparacionDestinoMigracion, más abajo, con su propia
            flecha/camión -- nunca se mezclan los dos símbolos.
          */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, fontSize: 16, fontWeight: 800, color: GRIS_TEXTO, fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
            <span>{a.rackActual || 'sin origen registrado'}</span>
            {vistaContenido === 'rcl' ? (
              <span style={{ fontSize: 15, fontWeight: 400, color: GRIS_TEXTO_TENUE, flexShrink: 0 }} title="Misma posición física, dos nombres">=</span>
            ) : (
              <i className="ti ti-arrow-narrow-right" style={{ fontSize: 15, fontWeight: 400, color: GRIS_TEXTO_TENUE, flexShrink: 0 }} />
            )}
            {/* Sin nivel acá -- ya está implícito (esta tarjeta ES el nivel, ver el encabezado "N05" arriba, 2026-08-26 pedido explícito: "no es necesario el nivel"). */}
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
              <span>{pasillo}</span>
              <span style={{ color: BORDE_CLARO, fontWeight: 400 }}>·</span>
              <span>C{String(columna).padStart(3, '0')}</span>
            </span>
          </div>
          {vistaContenido === 'rcl' && (
            <ComparacionDestinoMigracion identidadFisica={a.identidadFisica} destinoPlaneado={a.destinoPlaneado} />
          )}
          {/* Estilo inline (no la clase .chip compartida) a propósito -- este
              panel es una "isla" siempre clara, ajena al toggle claro/oscuro
              del resto de la app (mismo criterio que Login/Sidebar, pero
              invertido). .chip usa tokens de tema (--fondo-sutil/--ink) que
              en modo oscuro se irían a un gris oscuro sobre esta tarjeta
              siempre clara -- se ve roto. Acá los colores fijos de paleta.js
              (ya importados arriba) mantienen la misma forma de píldora. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'rgba(0,0,0,.05)', color: GRIS_TEXTO_TENUE, fontVariantNumeric: 'tabular-nums' }}>
              consumo{' '}
              <span style={{ color: configuracionOcupacion ? colorArticulo(a.consumo ?? 0, configuracionOcupacion) : GRIS_TEXTO, fontWeight: 700, marginLeft: 4 }}>
                {(a.consumo ?? 0).toFixed(2)}
              </span>
            </span>
            <span style={{ fontSize: 10.5, color: GRIS_TEXTO_TENUE, padding: '3px 0', fontVariantNumeric: 'tabular-nums' }}>{a.picks ?? 0} picks</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Solo en Vista RCL (2026-08-25, pedido explícito de David: "los movimientos
 * a donde van deberían ser diferentes el lugar donde estoy, si no no movería
 * nada") -- compara la identidad FÍSICA de este RCL (dónde está parado, ver
 * vistaRcl.js/identidadFisica) contra el destino real del plan de migración
 * para este artículo puntual (vistaRcl.js/destinoPlaneado). Son dos
 * preguntas distintas -- acá se responden juntas para que el operador no
 * tenga que adivinar si hace falta cargar algo o no.
 */
function ComparacionDestinoMigracion({ identidadFisica, destinoPlaneado }) {
  if (!destinoPlaneado) {
    return (
      <div style={{ fontSize: 11, color: GRIS_TEXTO_TENUE, marginTop: 3 }}>
        Sin movimiento de migración pendiente para este artículo.
      </div>
    );
  }
  if (destinoPlaneado.ambiguo) {
    return (
      <div style={{ fontSize: 11, color: ESTADOS.alerta, marginTop: 3, fontWeight: 600 }}>
        ⚠ {destinoPlaneado.cantidad} destinos posibles -- no se puede mostrar uno solo.
      </div>
    );
  }
  const mismoLugar = identidadFisica
    && destinoPlaneado.mzPasillo === identidadFisica.mzPasillo
    && destinoPlaneado.mzColumna === identidadFisica.mzColumna;
  if (mismoLugar) {
    return (
      <div style={{ fontSize: 11, color: ESTADOS.ok, marginTop: 3, fontWeight: 600 }}>
        ✓ El plan de migración lo deja en el mismo lugar -- no requiere traslado físico.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginTop: 3, fontWeight: 700, color: ESTADOS.alerta }}>
      <i className="ti ti-truck-delivery" style={{ fontSize: 12 }} />
      Plan de migración: {destinoPlaneado.mzPasillo} · C{String(destinoPlaneado.mzColumna).padStart(3, '0')}
      {destinoPlaneado.mzNivel != null && ` · ${destinoPlaneado.mzNivel}`}
    </div>
  );
}

/** Botón "Mover" por artículo -- componente propio (no inline dentro del .map()) porque useReducedMotion() es un hook: llamarlo directo dentro del callback de un array.map() rompe las reglas de hooks si la cantidad de artículos cambia entre renders. `icono` es configurable (F2 lo reusa con otro ícono para "mover al buffer", mismo componente, ninguna duplicación). */
function BotonMoverArticulo({ onClick, deshabilitado, etiqueta, icono = 'ti-arrows-move' }) {
  const reducido = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      disabled={deshabilitado}
      title={etiqueta}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6,
        border: `1px solid ${BORDE_CLARO}`, background: 'transparent', color: GRIS_TEXTO_TENUE, fontSize: 11,
        cursor: deshabilitado ? 'default' : 'pointer', opacity: deshabilitado ? 0.4 : 1,
        transition: 'opacity .15s var(--ease-ios)',
      }}
      {...(deshabilitado ? {} : interaccionBoton(reducido))}
    >
      <i className={`ti ${icono}`} />
    </motion.button>
  );
}

/**
 * Chip de % con etiqueta corta -- distingue visualmente (fondo de color +
 * etiqueta) del % de nivel de arriba (texto plano sin fondo), para que
 * nunca parezcan el mismo dato repetido. Mismo colorLlenura() del dominio,
 * nunca un color inventado.
 *
 * Pedido explícito 2026-08-11: clic en el % abre una burbuja con la fórmula
 * exacta y los datos reales usados para calcularla (consumo de cada
 * artículo del rack + capacidad útil) -- así el número deja de ser una caja
 * negra. Sin `rack`/`descripcionDe` (ej. el chip de nivel, si algún día
 * existiera) el clic no hace nada -- degrada a chip informativo simple.
 */
function ChipPorcentaje({ etiqueta, proporcion, configuracionOcupacion, rack, descripcionDe }) {
  const [abierta, setAbierta] = useState(false);
  const contenedorRef = useRef(null);
  const color = configuracionOcupacion ? colorLlenura(proporcion, configuracionOcupacion) : GRIS_TEXTO_TENUE;
  const puedeExplicar = !!(rack && configuracionOcupacion);

  // Clic afuera cierra la burbuja -- listener en document en vez del truco
  // del fondo invisible `position:fixed` que tenía antes: ese fondo asumía
  // que "fixed" se ancla siempre al viewport, pero .mapa-panel (el
  // contenedor de este chip) tiene `backdrop-filter`, y eso crea un nuevo
  // "containing block" para hijos fixed (spec CSS) -- el fondo quedaba
  // recortado al tamaño del panel, no de la pantalla, así que un clic en el
  // canvas de atrás nunca cerraba la burbuja (bug real, encontrado 2026-08-12
  // verificando este mismo rediseño con Playwright). Este patrón no depende
  // de ningún contexto de posicionamiento -- solo mira si el clic cayó
  // dentro del contenedor del chip+burbuja.
  useEffect(() => {
    if (!abierta) return;
    function alClickearFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierta(false);
    }
    document.addEventListener('mousedown', alClickearFuera);
    return () => document.removeEventListener('mousedown', alClickearFuera);
  }, [abierta]);

  return (
    <div ref={contenedorRef} style={{ position: 'relative' }}>
      <div
        onClick={puedeExplicar ? () => setAbierta(v => !v) : undefined}
        title={puedeExplicar ? 'Ver cómo se calculó este %' : undefined}
        style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '2px 7px', borderRadius: 999,
          background: `${color}22`, border: `1px solid ${color}66`, cursor: puedeExplicar ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color }}>{etiqueta}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{Math.round(proporcion * 100)}%</span>
        {puedeExplicar && <i className="ti ti-info-circle" style={{ fontSize: 10, color, opacity: .7, marginLeft: 1 }} />}
      </div>
      <AnimatePresence>
        {abierta && puedeExplicar && (
          <BurbujaFormula
            proporcion={proporcion} color={color} configuracionOcupacion={configuracionOcupacion} rack={rack} descripcionDe={descripcionDe}
            onCerrar={() => setAbierta(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Anillo de progreso SVG -- mismo dato que el chip (proporcion/color), pero da presencia visual al % en vez de dejarlo como un texto plano dentro de la burbuja. Traza su arco al montar (respeta prefers-reduced-motion). */
function AnilloPorcentaje({ proporcion, color, tamano = 60 }) {
  const reducido = useReducedMotion();
  const grosor = 6;
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const avance = Math.min(proporcion, 1) * circunferencia;

  return (
    <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={tamano / 2} cy={tamano / 2} r={radio} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={grosor} />
      <motion.circle
        cx={tamano / 2} cy={tamano / 2} r={radio} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round"
        strokeDasharray={circunferencia}
        initial={{ strokeDashoffset: reducido ? circunferencia - avance : circunferencia }}
        animate={{ strokeDashoffset: circunferencia - avance }}
        transition={{ duration: reducido ? 0 : DURACION.navegacion, ease: EASING.entrada }}
      />
      <text
        x={tamano / 2} y={tamano / 2} textAnchor="middle" dominantBaseline="central"
        transform={`rotate(90 ${tamano / 2} ${tamano / 2})`}
        style={{ fontSize: 13, fontWeight: 700, fill: color, fontVariantNumeric: 'tabular-nums' }}
      >
        {Math.round(proporcion * 100)}%
      </text>
    </svg>
  );
}

/** El contenido de la burbuja: fórmula + cada artículo que aporta al consumo total, para que el % del rack se pueda auditar a ojo. Pedido explícito 2026-08-12: se sentía "de un sistema más económico" comparado con el resto de la app -- este rediseño reusa el sistema de animación real del proyecto (ui/motion/tokens.js, prohibido inventar duraciones/easings a mano, ver MASTER-PROMPT.md sección 7), nunca valores nuevos. */
function BurbujaFormula({ proporcion, color, configuracionOcupacion, rack, descripcionDe, onCerrar }) {
  const reducido = useReducedMotion();
  const articulos = Object.values(rack.niveles).flat();
  const total = consumoTotal(rack);
  const capacidad = configuracionOcupacion.capacidadUtilRack;
  const articulosOrdenados = [...articulos].sort((a, b) => (b.consumo ?? 0) - (a.consumo ?? 0));
  const mayorConsumo = Math.max(1e-9, ...articulosOrdenados.map(a => a.consumo ?? 0));

  return (
    <motion.div
      initial={reducido ? { opacity: 1 } : { opacity: 0, scale: .94, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducido ? { opacity: 0 } : { opacity: 0, scale: .96, y: -4 }}
      transition={{ duration: reducido ? 0 : DURACION.estado, ease: EASING.entrada }}
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 10, zIndex: 41, width: 300, transformOrigin: 'top right',
        background: BLANCO_CALIDO, border: `1px solid ${BORDE_CLARO}`, borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,.28)', padding: 14, fontSize: 12, color: GRIS_TEXTO,
      }}
    >
      {/* Pico -- conecta visualmente la burbuja con el chip que la abrió, en vez de flotar suelta. */}
      <div style={{
        position: 'absolute', top: -6, right: 16, width: 12, height: 12, background: BLANCO_CALIDO,
        borderLeft: `1px solid ${BORDE_CLARO}`, borderTop: `1px solid ${BORDE_CLARO}`, transform: 'rotate(45deg)',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE }}>Cómo se calculó</span>
        <button
          onClick={onCerrar}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer', color: GRIS_TEXTO_TENUE, fontSize: 12,
            width: 20, height: 20, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: `background .15s var(--ease-ios)`,
          }}
        >
          <i className="ti ti-x" />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <AnilloPorcentaje proporcion={proporcion} color={color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>
            <span style={{ color: GRIS_TEXTO_TENUE, fontSize: 11 }}>Consumo total</span>
            <strong style={{ fontSize: 11.5 }}>{total.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>
            <span style={{ color: GRIS_TEXTO_TENUE, fontSize: 11 }}>Capacidad útil</span>
            <strong style={{ fontSize: 11.5 }}>{capacidad.toFixed(2)}</strong>
          </div>
          <div style={{ height: 1, background: BORDE_CLARO, opacity: .35, margin: '4px 0' }} />
          <div style={{ fontSize: 10.5, fontFamily: 'monospace', color: GRIS_TEXTO_TENUE }}>
            {total.toFixed(2)} ÷ {capacidad.toFixed(2)} = <strong style={{ color }}>{Math.round(proporcion * 100)}%</strong>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', color: GRIS_TEXTO_TENUE, marginBottom: 7 }}>
        Artículos que aportan ({articulosOrdenados.length})
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {articulosOrdenados.map(a => {
          const colorArt = configuracionOcupacion ? colorArticulo(a.consumo ?? 0, configuracionOcupacion) : GRIS_TEXTO;
          const proporcionArt = Math.max(0.03, (a.consumo ?? 0) / mayorConsumo);
          return (
            <div key={a.articulo} style={{ fontSize: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.articulo}</span>
                  {descripcionDe && <span style={{ color: GRIS_TEXTO_TENUE }}> · {descripcionDe(a.articulo)}</span>}
                </span>
                <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{(a.consumo ?? 0).toFixed(2)}</span>
              </div>
              {/* Barra proporcional al mayor consumidor del rack -- mismo lenguaje visual que las barras de llenado de TarjetaNivel, ahora también por artículo dentro de la burbuja. */}
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${proporcionArt * 100}%`, background: colorArt, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
