import { useState } from 'react';
import ModalBase from '../../shared/components/ModalBase.jsx';
import PanelEliminarArticulosReales from './PanelEliminarArticulosReales.jsx';
import PanelLimpiarAgotadosRcl from '../migracion/PanelLimpiarAgotadosRcl.jsx';

/**
 * Unifica los 2 flujos de "sacar un artículo del mapa real" en un solo
 * modal con pestañas (2026-07-22, mismo criterio que PanelImportMigracion.jsx)
 * -- misma acción de fondo (posicionesEliminadasService.marcarEliminados,
 * mismo permiso `eliminar_articulos`), distinta forma de detectar
 * candidatos: por lista manual (Excel) o por cruce automático contra el
 * inventario RCL importado. Cada pestaña conserva su propio estado/lógica
 * intacta -- acá solo se comparte el modal y el selector.
 */
const PESTANAS = [
  { id: 'lista', icon: 'ti-file-spreadsheet', label: 'Por lista (Excel)', Componente: PanelEliminarArticulosReales },
  { id: 'rcl', icon: 'ti-recycle', label: 'Detección automática (RCL)', Componente: PanelLimpiarAgotadosRcl },
];

export default function PanelEliminarArticulos({ sesion, onCerrar }) {
  const [pestana, setPestana] = useState(PESTANAS[0].id);
  const activa = PESTANAS.find(p => p.id === pestana);

  return (
    <ModalBase titulo="🗑️ Eliminar artículos del mapa real" onCerrar={onCerrar} maxWidth={900} maxHeight="88vh" scrollContenido>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--borde-claro)', flexWrap: 'wrap' }}>
        {PESTANAS.map(p => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 12.5, fontWeight: 600,
              border: 'none', borderBottom: `2px solid ${pestana === p.id ? 'var(--red)' : 'transparent'}`,
              background: 'transparent', color: pestana === p.id ? 'var(--red)' : 'var(--texto-tenue)', cursor: 'pointer',
            }}
          >
            <i className={`ti ${p.icon}`} />
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ overflowY: 'auto', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <activa.Componente sesion={sesion} />
      </div>
    </ModalBase>
  );
}
