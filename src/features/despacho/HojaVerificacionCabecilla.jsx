import { createPortal } from 'react-dom';
import ModalBase from '../../shared/components/ModalBase.jsx';

function rackTexto(mzPasillo, mzColumna) {
  return `${mzPasillo}-C${String(mzColumna).padStart(3, '0')}`;
}

function rclTexto(tarea) {
  if (tarea.rclCodigo == null) return null;
  return `${tarea.rclCodigo}-N${String(tarea.rclNivel).padStart(2, '0')}`;
}

/**
 * Agrupa TODAS las tareas de la orden (sin importar a qué trabajador le
 * tocaron) por rack -- una "zona" del mapa por cuerpo, en el mismo orden
 * pasillo/columna que ya usa generarLoteDespacho.js para el reparto. El
 * cabecilla recorre estas zonas físicamente para corroborar que lo que la
 * app dice resuelto de verdad está así en el piso.
 */
function agruparPorZona(trabajadores) {
  const porZona = new Map();
  for (const t of trabajadores) {
    for (const tarea of t.tareas) {
      const clave = `${tarea.mzPasillo}|${tarea.mzColumna}`;
      if (!porZona.has(clave)) porZona.set(clave, { mzPasillo: tarea.mzPasillo, mzColumna: tarea.mzColumna, vaciar: [], recolectar: [] });
      const zona = porZona.get(clave);
      if (tarea.tipo === 'vaciar') zona.vaciar.push(tarea);
      else zona.recolectar.push(tarea);
    }
  }
  return [...porZona.values()].sort((a, b) => {
    if (a.mzPasillo !== b.mzPasillo) return String(a.mzPasillo).localeCompare(String(b.mzPasillo));
    return Number(a.mzColumna) - Number(b.mzColumna);
  });
}

function contarPorEstado(tareas, estado) {
  return tareas.filter(t => t.estado === estado).length;
}

function Zona({ zona, indice }) {
  const totalVaciar = zona.vaciar.length, totalRecolectar = zona.recolectar.length;
  const vaciarHecho = contarPorEstado(zona.vaciar, 'confirmada');
  const recolectarHecho = contarPorEstado(zona.recolectar, 'confirmada');
  const rclDeVaciar = [...new Set(zona.vaciar.map(rclTexto).filter(Boolean))];

  return (
    <li className="hoja-verificacion__zona">
      <div className="hoja-verificacion__zona-cabecera">
        <span className="hoja-verificacion__casillero" />
        <strong>{indice}. Rack {rackTexto(zona.mzPasillo, zona.mzColumna)}</strong>
      </div>
      <ul className="hoja-verificacion__detalle">
        {totalVaciar > 0 && (
          <li>Debería estar VACÍO de lo viejo ({vaciarHecho}/{totalVaciar} marcado hecho){rclDeVaciar.length > 0 && ` -- origen ${rclDeVaciar.join(', ')}`}.</li>
        )}
        {totalRecolectar > 0 && (
          <li>Debería tener AHORA {totalRecolectar} artículo(s) nuevo(s) acomodado(s) ({recolectarHecho}/{totalRecolectar} marcado hecho).</li>
        )}
      </ul>
    </li>
  );
}

/**
 * Hoja de verificación del cabecilla (2026-07-22, pedido explícito) --
 * distinta de HojaTrabajo.jsx: esa es la instrucción para quien HACE el
 * trabajo, esta es la ronda de control para quien lo verificó de VERDAD en
 * el piso, rack por rack, después de confirmar en la app. Una sola hoja
 * por orden completa (no una por trabajador) -- las zonas ya salen
 * ordenadas en la misma secuencia pasillo/columna del reparto.
 */
export default function HojaVerificacionCabecilla({ lote, onCerrar }) {
  const zonas = agruparPorZona(lote.trabajadores);

  // Portal directo a <body> -- mismo motivo que HojaTrabajo.jsx: escapar
  // de .panel/.app-main sin depender de position:absolute, que Chrome no
  // pagina bien en documentos de más de una hoja física.
  return createPortal(
    <ModalBase titulo={`Hoja de verificación -- Orden #${lote.id}`} onCerrar={onCerrar} maxWidth={640} maxHeight="88vh" scrollContenido>
      <div className="hoja-trabajo-contenedor" style={{ overflowY: 'auto', flex: 1 }}>
        <div className="hoja-trabajo hoja-verificacion">
          <p className="hoja-trabajo__encabezado">Verificación -- Orden #{lote.id} ({zonas.length} zona(s))</p>
          <ol className="hoja-verificacion__lista">
            {zonas.map((zona, i) => <Zona key={`${zona.mzPasillo}|${zona.mzColumna}`} zona={zona} indice={i + 1} />)}
          </ol>
          <p className="hoja-trabajo__pie">Marcá cada casillero recién después de comprobarlo físicamente en el rack.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn-primary" onClick={() => window.print()}>Imprimir</button>
        <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
      </div>
    </ModalBase>,
    document.body
  );
}
