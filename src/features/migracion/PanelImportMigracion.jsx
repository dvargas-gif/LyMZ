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

      {/* Pestañas como píldoras del sistema de botones (2026-07-28, pedido
          explícito: "todo esto es para realizar una acción, en formato de
          botones") -- antes era un subrayado con estilos inline sueltos,
          afuera del sistema .btn-*. Reusa .btn-secondary/.activo tal cual
          (mismo patrón que ya usa el filtro "activo" en otras pantallas). */}
      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {PESTANAS.map(p => (
          <button
            key={p.id}
            className={`btn-secondary ${pestana === p.id ? 'activo' : ''}`}
            onClick={() => setPestana(p.id)}
            style={{ fontSize: 12.5 }}
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
