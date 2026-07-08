import { VERDE_ESTRUCTURA, BLANCO_CALIDO, BLANCO_HUESO_TARJETA, GRIS_TEXTO_TENUE, BORDE_CLARO } from './paleta.js';

/**
 * Barra de pestañas de racks abiertos -- mismo criterio que un navegador:
 * click en un rack ya abierto reenfoca su pestaña (nunca duplica, ver
 * abrirPestana() en MapaCanvas.jsx), cerrar una quita solo esa. Pura
 * presentación -- todo el estado (cuáles están abiertas, cuál es la activa)
 * vive en MapaCanvas.jsx.
 */
export default function BarraPestanas({ pestanas, activa, onSeleccionar, onCerrar, cerrando, minimizado, onToggleMinimizado }) {
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
        padding: '6px 34px 6px 6px', // el padding-right deja lugar fijo al botón de minimizar, no importa cuántas filas de pestañas haya
        background: BLANCO_HUESO_TARJETA, borderRadius: minimizado ? 10 : '12px 12px 0 0',
        border: `1px solid ${BORDE_CLARO}`, borderBottom: minimizado ? `1px solid ${BORDE_CLARO}` : 'none',
      }}
    >
      {pestanas.map(clave => {
        const [pasillo, columna] = clave.split('|');
        const esActiva = clave === activa;
        const seEstaCerrando = cerrando?.has(clave);
        return (
          <button
            key={clave}
            onClick={() => onSeleccionar(clave)}
            className={seEstaCerrando ? 'mapa-pestana mapa-pestana--cerrando' : 'mapa-pestana'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '7px 8px 7px 12px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: esActiva ? VERDE_ESTRUCTURA : 'transparent',
              color: esActiva ? BLANCO_CALIDO : GRIS_TEXTO_TENUE,
              transition: 'background .15s ease, color .15s ease',
            }}
          >
            {pasillo}-C{String(columna).padStart(3, '0')}
            <span
              role="button"
              tabIndex={-1}
              onClick={e => { e.stopPropagation(); onCerrar(clave); }}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 16, height: 16, borderRadius: 4, fontSize: 13, lineHeight: 1,
                color: 'inherit', opacity: 0.7,
              }}
              className="mapa-pestana__cerrar"
              aria-label={`Cerrar ${pasillo}-C${String(columna).padStart(3, '0')}`}
            >
              ×
            </span>
          </button>
        );
      })}
      <button
        onClick={onToggleMinimizado}
        title={minimizado ? 'Expandir panel' : 'Minimizar panel'}
        style={{
          position: 'absolute', top: 6, right: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: 'transparent', color: GRIS_TEXTO_TENUE, fontSize: 13,
        }}
        className="mapa-pestana__cerrar"
      >
        <i className={`ti ${minimizado ? 'ti-chevron-down' : 'ti-chevron-up'}`} />
      </button>
    </div>
  );
}
