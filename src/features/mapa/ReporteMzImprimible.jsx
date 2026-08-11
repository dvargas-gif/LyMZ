import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { obtenerWarehouseModel } from '../../domain/crearWarehouseModel.js';
import { prepararReporteImprimibleMz } from '../../domain/prepararReporteImprimibleMz.js';
import { COLUMNAS_POR_PASILLO } from './canvas/posicionesEsquematicas.js';
import PanelCargando from '../../shared/components/PanelCargando.jsx';
import './reporteImprimible.css';

// Mismo alcance que identidad_legacy (MZ01-MZ08) -- el archivo real del
// cliente no cubre MZ09-MZ12 (ascensores/zonas chicas), así que tampoco
// tiene sentido imprimirlos acá.
const PASILLOS_MZ = ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08']
  .map(pasillo => ({ pasillo, columnas: COLUMNAS_POR_PASILLO[pasillo] }));

const CODIGOS_VISIBLES = 4; // tope por celda antes de "+N más" (pedido explícito: "estas cacofonías no me gustan")

/**
 * Croquis imprimible del mapa MZ (2026-08-04, pedido explícito: "un croquis
 * en modo de mapa... que se vería en papel"). HTML+CSS, no Konva -- el
 * pedido es LISTAR códigos de artículo por celda (texto variable, varias
 * líneas), algo para lo que el Canvas rasteriza mal a resolución de
 * impresión; el diálogo de impresión del navegador ya sabe paginar HTML.
 *
 * Una sección por pasillo, con salto de página entre pasillos
 * (ver reporteImprimible.css) -- "una hoja por MZ" pedido explícito. Solo
 * esta sección es visible al imprimir (el resto de la app se oculta con el
 * truco estándar de "imprimir solo este elemento", ver reporteImprimible.css).
 */
export default function ReporteMzImprimible({ onCerrar }) {
  const [reporte, setReporte] = useState(null); // null = cargando
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const modelo = await obtenerWarehouseModel(null).cargar();
        setReporte(prepararReporteImprimibleMz(modelo.racks(), PASILLOS_MZ));
      } catch (err) {
        setError(`No se pudo cargar el mapa: ${err.message || err}`);
      }
    })();
  }, []);

  // Portal directo a document.body (2026-08-05, corrección en vivo -- vista
  // previa de impresión en blanco): este panel se abre DENTRO de ModalBase,
  // que ya es un position:fixed propio -- eso lo convierte en el bloque
  // contenedor de este overlay cuando el CSS de impresión lo pasa a
  // position:absolute, y el motor de impresión del navegador termina
  // recortando todo a un solo "viewport" en blanco. Un portal saca este
  // panel de esa jerarquía por completo, directo a <body>, sin importar
  // desde qué pantalla se abra.
  return createPortal((
    <div className="reporte-imprimible-overlay">
      <div className="reporte-imprimible-barra no-imprimir">
        <button className="btn-secondary" onClick={onCerrar}>
          <i className="ti ti-x" /> Cerrar
        </button>
        <button className="btn-primary" disabled={!reporte} onClick={() => window.print()}>
          <i className="ti ti-printer" /> Imprimir
        </button>
      </div>

      {error && <p className="pend-banner" style={{ margin: 16 }}>{error}</p>}

      {!reporte && !error && (
        <div style={{ padding: 24 }}>
          <PanelCargando lineas={4} />
        </div>
      )}

      {reporte && (
        <div className="reporte-imprimible">
          {reporte.map(({ pasillo, filas }) => (
            <section key={pasillo} className="reporte-imprimible__pasillo">
              <h2>{pasillo}</h2>
              <div className="reporte-imprimible__grid" style={{ gridTemplateColumns: `repeat(${filas.length}, 1fr)` }}>
                {filas.map(({ columna, niveles }) => (
                  <div key={columna} className="reporte-imprimible__columna">
                    {niveles.map(({ nivel, codigos }) => (
                      <div key={nivel} className={`reporte-imprimible__celda ${codigos.length ? 'reporte-imprimible__celda--ocupada' : ''}`}>
                        {codigos.slice(0, CODIGOS_VISIBLES).map(c => <div key={c} className="reporte-imprimible__codigo">{c}</div>)}
                        {codigos.length > CODIGOS_VISIBLES && (
                          <div className="reporte-imprimible__codigo reporte-imprimible__codigo--mas">+{codigos.length - CODIGOS_VISIBLES} más</div>
                        )}
                      </div>
                    ))}
                    <div className="reporte-imprimible__columna-etiqueta">C{String(columna).padStart(3, '0')}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  ), document.body);
}
