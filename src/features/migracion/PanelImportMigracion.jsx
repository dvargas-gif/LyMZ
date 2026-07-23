import { useState } from 'react';
import PanelImportIdentidadLegacy from './PanelImportIdentidadLegacy.jsx';
import PanelImportInventarioRcl from './PanelImportInventarioRcl.jsx';
import PanelImportArticuloDimensiones from './PanelImportArticuloDimensiones.jsx';
import PanelCargaMasiva from '../cargaMasiva/PanelCargaMasiva.jsx';

/**
 * "Cargas e importaciones" (2026-07-23, antes "Importar datos de
 * migración") -- unifica los 3 imports de la migración RCL->MZ MÁS la
 * carga/edición masiva de posiciones en una sola página con pestañas
 * (pedido explícito: "englobar la carga masiva de posición... en el
 * módulo de cargas"). Dejó de ser un modal (2026-07-22 lo unificó como
 * modal con pestañas; 2026-07-23 le sacó el modal, pedido explícito: "que
 * deje de ser modal y sea hoja completa") -- ahora es una página de
 * navegación más (ver App.jsx, tab==='cargas'), igual que Usuarios.
 *
 * Cada pestaña sigue siendo su propio componente, con su propio
 * estado/parser/servicio -- acá solo se comparte el shell (página +
 * selector de pestaña), nada de la lógica de carga se tocó ni se fusionó.
 */
const PESTANAS = [
  { id: 'identidad', icon: 'ti-replace', label: 'Identidad RCL↔MZ', Componente: PanelImportIdentidadLegacy },
  { id: 'inventario', icon: 'ti-package', label: 'Inventario RCL', Componente: PanelImportInventarioRcl },
  { id: 'dimensiones', icon: 'ti-ruler-2', label: 'Dimensiones', Componente: PanelImportArticuloDimensiones },
  { id: 'carga-masiva', icon: 'ti-upload', label: 'Carga masiva de posiciones', Componente: PanelCargaMasiva },
];

export default function PanelImportMigracion({ sesion }) {
  const [pestana, setPestana] = useState(PESTANAS[0].id);
  const activa = PESTANAS.find(p => p.id === pestana);

  return (
    <div className="panel">
      <h2>Cargas e importaciones</h2>
      <p className="muted">Subir/editar datos en lote -- migración RCL→MZ y posiciones del mapa real.</p>

      <div style={{ display: 'flex', gap: 6, margin: '16px 0', borderBottom: '1px solid var(--borde-claro)', flexWrap: 'wrap' }}>
        {PESTANAS.map(p => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 12.5, fontWeight: 600,
              border: 'none', borderBottom: `2px solid ${pestana === p.id ? 'var(--accent)' : 'transparent'}`,
              background: 'transparent', color: pestana === p.id ? 'var(--accent)' : 'var(--texto-tenue)', cursor: 'pointer',
            }}
          >
            <i className={`ti ${p.icon}`} />
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ minWidth: 0 }}>
        <activa.Componente sesion={sesion} />
      </div>
    </div>
  );
}
