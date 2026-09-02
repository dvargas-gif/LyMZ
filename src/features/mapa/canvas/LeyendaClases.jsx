import { useMemo, useState } from 'react';
import { COLORES_ARTICULO } from '../../../shared/constants/coloresArticulo.js';
import ModalBase from '../../../shared/components/ModalBase.jsx';
import BadgeClase from '../../../shared/components/BadgeClase.jsx';

/**
 * Qué significa cada color del mapa (2026-07-24, pedido explícito: "sé que
 * el artículo X está de morado, pero no sé qué significa el morado, o
 * naranja, o azul" -- riesgo real de retrabajo si alguien interpreta mal
 * un color). Lee la MISMA constante que pinta el mapa (nunca un color
 * hardcodeado aparte), así que nunca puede desincronizarse de lo que
 * realmente se ve.
 *
 * Ajuste 2026-07-24 (segunda vuelta, pedido explícito): cada clase muestra
 * su cantidad de artículos y es un botón -- clickearla abre un modal con
 * la lista completa (buscador incluido), sin tocar `articulosPorClase`
 * (viene ya armado en memoria desde MapaCanvas.jsx, sin ninguna consulta
 * nueva a Supabase). El modal usa `ModalBase` (overlay z-index:2000) --
 * convive sin pisarse con PanelDetalle/BarraMovimiento (paneles propios del
 * mapa, z-index 20-25): uno es un panel flotante del canvas, el otro un
 * modal de la app, capas completamente distintas.
 *
 * CUERPO se muestra separado de A/B/C/D a propósito -- no es una rotación,
 * es una categoría aparte (ver el comentario de coloresArticulo.js).
 */
const DESCRIPCIONES = {
  A: 'Alta rotación',
  B: 'Media rotación',
  C: 'Baja rotación',
  D: 'Muy baja rotación',
};

/**
 * 2026-08-28, pedido explícito de David: "que los botones de colores cuando
 * los presione me resalte la categoria que toque" -- tocar la fila ahora
 * resalta esa clase en el mapa real (atenúa todo lo demás, ver
 * `resaltadoClase`/`atenuada` en MapaCanvas.jsx) en vez de abrir la lista
 * directamente. La lista completa (buscador incluido) sigue disponible --
 * el ícono de flecha es un botón aparte (`stopPropagation`) que la abre sin
 * tocar el resaltado del mapa.
 */
function FilaClase({ etiqueta, descripcion, color, cantidad, activa, onResaltar, onVerLista }) {
  return (
    <button
      className={`mapa-leyenda__fila ${activa ? 'mapa-leyenda__fila--activa' : ''}`}
      onClick={onResaltar}
      disabled={cantidad === 0}
      title={activa ? `Ocultar resaltado de ${etiqueta}` : `Resaltar ${etiqueta} en el mapa`}
    >
      <span className="mapa-leyenda__color" style={{ background: color }} aria-hidden="true" />
      <span className="mapa-leyenda__texto">
        <strong>{etiqueta}</strong>
        <span>{descripcion}</span>
      </span>
      <span className="mapa-leyenda__cantidad">{cantidad}</span>
      <span
        role="button" tabIndex={0} className="mapa-leyenda__ver-lista"
        title="Ver lista completa"
        onClick={e => { e.stopPropagation(); onVerLista(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onVerLista(); } }}
      >
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </span>
    </button>
  );
}

export default function LeyendaClases({ articulosPorClase, onCerrar, resaltado = null, onToggleResaltado }) {
  const [claseAbierta, setClaseAbierta] = useState(null); // null | 'A' | 'B' | 'C' | 'D' | 'CUERPO'
  const [busqueda, setBusqueda] = useState('');

  function cantidadDe(clave) {
    return articulosPorClase?.get(clave)?.length ?? 0;
  }

  const articulosFiltrados = useMemo(() => {
    const lista = (claseAbierta && articulosPorClase?.get(claseAbierta)) || [];
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return lista;
    return lista.filter(a =>
      a.articulo?.toLowerCase().includes(termino) ||
      a.descripcion?.toLowerCase().includes(termino) ||
      a.pasillo?.toLowerCase().includes(termino)
    );
  }, [articulosPorClase, claseAbierta, busqueda]);

  function abrirClase(clase) {
    setBusqueda('');
    setClaseAbierta(clase);
  }

  const tituloModal = claseAbierta === 'CUERPO' ? 'Cuerpo entero' : `Clase ${claseAbierta}`;

  return (
    <>
      <div className="mapa-terminal mapa-leyenda">
        <div className="mapa-terminal__header">
          <span><i className="ti ti-palette" /> Qué significa cada color</span>
          <button className="mapa-terminal__cerrar" onClick={onCerrar} title="Ocultar">Ocultar ›</button>
        </div>
        <div className="mapa-terminal__log">
          <p style={{ color: '#B9B3A8', fontSize: 11, margin: '2px 0 8px' }}>
            El color de fondo de cada rack es la clase de rotación de su primer artículo. Tocá una clase para ver la lista completa.
          </p>
          {['A', 'B', 'C', 'D'].map(clase => (
            <FilaClase
              key={clase}
              clase={clase}
              etiqueta={`Clase ${clase}`}
              descripcion={DESCRIPCIONES[clase]}
              color={COLORES_ARTICULO[clase]}
              cantidad={cantidadDe(clase)}
              activa={resaltado === clase}
              onResaltar={() => onToggleResaltado?.(clase)}
              onVerLista={() => abrirClase(clase)}
            />
          ))}
          <FilaClase
            clase="CUERPO"
            etiqueta="Cuerpo entero"
            descripcion="No es una rotación -- es otra categoría aparte"
            color={COLORES_ARTICULO.CUERPO}
            cantidad={cantidadDe('CUERPO')}
            activa={resaltado === 'CUERPO'}
            onResaltar={() => onToggleResaltado?.('CUERPO')}
            onVerLista={() => abrirClase('CUERPO')}
          />
        </div>
      </div>

      {claseAbierta && (
        <ModalBase titulo={`${tituloModal} -- ${cantidadDe(claseAbierta)} artículo(s)`} onCerrar={() => setClaseAbierta(null)} maxWidth={560} maxHeight="78vh" scrollContenido>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexShrink: 0 }}>
            <i className="ti ti-search" style={{ color: 'var(--texto-tenue)' }} />
            <input
              type="text" autoFocus placeholder="Buscar por artículo, descripción o pasillo…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--borde-input)', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {articulosFiltrados.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: 20 }}>
                {busqueda ? `Nadie coincide con "${busqueda}".` : 'No hay artículos en esta clase.'}
              </p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr><th>Artículo</th><th>Descripción</th><th>Ubicación</th><th>Clase</th></tr>
                </thead>
                <tbody>
                  {articulosFiltrados.map((a, i) => (
                    <tr key={`${a.articulo}-${a.pasillo}-${a.columna}-${a.nivel}-${i}`}>
                      <td style={{ fontFamily: 'monospace' }}>{a.articulo}</td>
                      <td>{a.descripcion}</td>
                      <td style={{ fontFamily: 'monospace' }}>{a.pasillo}-C{String(a.columna).padStart(3, '0')}-{a.nivel}</td>
                      <td><BadgeClase clase={claseAbierta === 'CUERPO' ? null : claseAbierta} tipo={claseAbierta === 'CUERPO' ? 'CUERPO' : undefined} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </ModalBase>
      )}
    </>
  );
}
