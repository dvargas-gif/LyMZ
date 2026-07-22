import { useState } from 'react';
import ModalBase from '../../shared/components/ModalBase.jsx';
import PanelImportIdentidadLegacy from './PanelImportIdentidadLegacy.jsx';
import PanelImportInventarioRcl from './PanelImportInventarioRcl.jsx';
import PanelImportArticuloDimensiones from './PanelImportArticuloDimensiones.jsx';

/**
 * Unifica los 3 imports de la migración RCL->MZ en un solo modal con
 * pestañas (2026-07-22, pedido explícito: "unifiquemos las cargas") --
 * antes eran 3 entradas separadas en el sidebar, cada una abriendo su
 * propio modal casi idéntico (subir archivo -> previsualizar rechazadas ->
 * aplicar en lote). Cada pestaña sigue siendo su propio componente, con su
 * propio estado/parser/servicio -- acá solo se comparte el shell (modal +
 * selector de pestaña), nada de la lógica de import se tocó ni se
 * fusionó. Separarlas de nuevo el día que haga falta es tan simple como
 * volver a poner cada una en su propia entrada del sidebar.
 */
const PESTANAS = [
  { id: 'identidad', icon: 'ti-replace', label: 'Identidad RCL↔MZ', Componente: PanelImportIdentidadLegacy },
  { id: 'inventario', icon: 'ti-package', label: 'Inventario RCL', Componente: PanelImportInventarioRcl },
  { id: 'dimensiones', icon: 'ti-ruler-2', label: 'Dimensiones', Componente: PanelImportArticuloDimensiones },
];

export default function PanelImportMigracion({ sesion, onCerrar }) {
  const [pestana, setPestana] = useState(PESTANAS[0].id);
  const activa = PESTANAS.find(p => p.id === pestana);

  return (
    <ModalBase titulo="⇪ Importar datos de migración" onCerrar={onCerrar} maxWidth={880} maxHeight="88vh" scrollContenido>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--borde-claro)', flexWrap: 'wrap' }}>
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

      <div style={{ overflowY: 'auto', minWidth: 0, flex: 1 }}>
        <activa.Componente sesion={sesion} />
      </div>
    </ModalBase>
  );
}
