import { createPortal } from 'react-dom';
import ModalBase from '../../shared/components/ModalBase.jsx';

/**
 * Hoja(s) de trabajo imprimible(s) -- pedido explícito: "que sea el trabajo
 * que seguiría un niño de 7 años". Texto grande, una instrucción por línea,
 * nada de jerga del sistema (ni "movimiento_id" ni "MZ01|3").
 *
 * Acepta UN trabajador (`trabajador`) o VARIOS (`trabajadores`, para
 * imprimir la oleada completa de una sola pasada -- pedido explícito
 * 2026-07-22, antes había que abrir/imprimir de a uno). Cada trabajador es
 * su propia página al imprimir (`.hoja-trabajo { page-break-after }`, ver
 * index.css) -- nadie tiene que cortar papeles a mano.
 *
 * `window.print()` + CSS `@media print` (ver .hoja-trabajo en index.css):
 * técnica de "visibility hack" -- todo el resto de la página se oculta con
 * `visibility:hidden` y solo `.hoja-trabajo` vuelve a `visibility:visible`,
 * sin tener que marcar cada otro componente de la app con una clase
 * "no imprimir". No se agrega ninguna librería nueva (no hay jsPDF/pdfmake acá).
 */
function rackTexto(mzPasillo, mzColumna) {
  return `${mzPasillo}-C${String(mzColumna).padStart(3, '0')}`;
}

// Ídem ChecklistTrabajador.jsx: en 'vaciar' el RCL es la referencia que el
// piso reconoce hoy físicamente -- el MZ queda como dato secundario entre
// paréntesis, no como la ubicación principal a buscar.
function origenRcl(tarea) {
  if (tarea.rclCodigo == null) return '(sin origen)';
  return `${tarea.rclCodigo}-N${String(tarea.rclNivel).padStart(2, '0')}`;
}

function instruccion(tarea, indice) {
  if (tarea.tipo === 'vaciar') {
    return `${indice}. Sacar "${tarea.articulo}" de ${origenRcl(tarea)} (rack ${rackTexto(tarea.mzPasillo, tarea.mzColumna)}) y dejarlo en el carro.`;
  }
  return `${indice}. Buscar "${tarea.articulo}" en ${tarea.rclCodigo ?? '(sin origen)'} y llevarlo a ${rackTexto(tarea.mzPasillo, tarea.mzColumna)}.`;
}

// `esPrimero` decide el separador visual EN PANTALLA (línea punteada entre
// hojas) -- pedido explícito 2026-07-22: nada de envolver cada hoja en un
// <div> propio para lograrlo. Un wrapper por hoja hacía que
// `.hoja-trabajo:last-of-type` (el que corta el salto de página del
// último) matcheara TODAS -- cada una quedaba sola dentro de su propio
// div, así que cada una "era la última" para ese selector, y ninguna
// forzaba el salto de página real (bug real reportado con captura: las
// hojas salían superpuestas). Con todas las `.hoja-trabajo` como hermanas
// directas del mismo contenedor, `:last-of-type` vuelve a referirse a la
// última de verdad.
function HojaDeUnTrabajador({ trabajador, esPrimero }) {
  return (
    <div className="hoja-trabajo" style={esPrimero ? undefined : { borderTop: '2px dashed var(--borde-medio)', marginTop: 22, paddingTop: 22 }}>
      <p className="hoja-trabajo__encabezado">Trabajador {String(trabajador.numero).padStart(3, '0')}</p>
      <ol className="hoja-trabajo__lista">
        {trabajador.tareas.map((tarea, i) => (
          <li key={tarea.id ?? i}>{instruccion(tarea, i + 1)}</li>
        ))}
      </ol>
      <p className="hoja-trabajo__pie">Al terminar cada paso, avisá al cabecilla de equipo.</p>
    </div>
  );
}

export default function HojaTrabajo({ trabajador, trabajadores, onCerrar }) {
  const lista = trabajadores ?? (trabajador ? [trabajador] : []);
  const titulo = lista.length === 1
    ? `Hoja de trabajo -- Trabajador ${String(lista[0].numero).padStart(3, '0')}`
    : `Hojas de trabajo -- ${lista.length} trabajador(es)`;

  // Portal directo a <body> -- pedido explícito tras un bug real de
  // impresión (captura: hojas de distintos trabajadores superpuestas). La
  // causa de fondo era que este modal vive anidado dentro de .panel/.app-main
  // (todo el resto de la app), y el truco de impresión necesitaba
  // "escaparse" de esa jerarquía con position:absolute -- pero Chrome no
  // pagina bien contenido absoluto que ocupa más de una hoja física.
  // Renderizando directo como hijo de <body>, imprimir un documento de
  // varias páginas ya no necesita ningún truco de posición: alcanza con
  // ocultar el resto de la app entera (`#root`, ver index.css) y dejar
  // esto en el flujo normal del documento, que es lo único que el motor
  // de impresión pagina de forma confiable.
  return createPortal(
    <ModalBase titulo={titulo} onCerrar={onCerrar} maxWidth={560} maxHeight="88vh" scrollContenido>
      <div className="hoja-trabajo-contenedor" style={{ overflowY: 'auto', flex: 1 }}>
        {lista.map((t, i) => <HojaDeUnTrabajador key={t.numero} trabajador={t} esPrimero={i === 0} />)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn-primary" onClick={() => window.print()}>
          {lista.length === 1 ? 'Imprimir' : `Imprimir las ${lista.length} hojas`}
        </button>
        <button className="btn-secondary" onClick={onCerrar}>Cerrar</button>
      </div>
    </ModalBase>,
    document.body
  );
}
