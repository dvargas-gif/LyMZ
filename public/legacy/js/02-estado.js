// Estado compartido y mutable de todo el mapa (que se esta moviendo, que
// esta bloqueado, si el modo edicion/seleccion/bloqueo esta activo, el
// arrastre en curso, etc.). Un solo lugar para todo esto -- el resto de
// los modulos lo LEEN y lo MODIFICAN directamente (scripts clasicos, no
// ES modules: todos comparten el mismo scope global a proposito, para no
// tener que inventar getters/setters sobre variables que hoy se leen y
// reasignan desde decenas de funciones distintas).

let dashDibujado=false;
let cambios=[];           // log de movimientos
let moviendo=null;        // {art,desdeKey,desdeNiv}
let modalKey=null;
let modoBloqueo=false;
const bloqueadas=new Set();
// --- AGREGADO: modo edición — encierra TODO el arrastre (ver más abajo,
// iniciarPulsacion/etc.) detrás de un toggle explícito. Fuera de este modo,
// un pointerdown no hace absolutamente nada especial: el click de siempre
// (abrir rack / continuar "Mover" por modal) queda intacto, sin ningún
// umbral ni chance de dispararse por accidente. Esto es lo que permite que,
// DENTRO del modo, el arrastre pueda ser bien sensible/fluido sin miedo a
// romper un click normal en el resto de la app.
let modoEdicion=false;
// --- AGREGADO: selección múltiple para "Limpiar área" — SOLO existe dentro
// de una sala (los botones que la disparan ni se muestran en el mapa real).
// No toca modoBloqueo/bloqueadas ni la lógica de mover: es un modo aparte,
// chequeado ANTES en el onclick de cada celda (mismo patrón que ya usa
// modoBloqueo), así que nunca interfiere con mover/deshacer/drag&drop.
let modoSeleccionArea=false;
const seleccionArea=new Set();
const grid=document.getElementById("grid");const cellRefs={};
// --- AGREGADO: arrastre inmediato (drag & drop) de un cuerpo completo ---
// Capa NUEVA y aparte de iniciarMover/soltarEn/confirmar/iniciarMoverCuerpo/
// soltarCuerpoEn: no cambia ni una línea de esas funciones, solo las DISPARA
// cuando corresponde. Un tap/click normal (soltar sin moverse más de
// ARRASTRE_UMBRAL_PX) nunca activa el arrastre: el navegador sigue
// disparando el onclick de siempre (abrir el rack / continuar "Mover" por
// modal). En cuanto el puntero se mueve más que el umbral, se activa el
// arrastre AL INSTANTE (sin espera). Funciona igual en el mapa real y en
// una sala porque reutiliza iniciarMoverCuerpo()/soltarCuerpoEn() tal cual
// — esas funciones ya llaman a notificarPosicion(), que ya manda escenarioId.
const ARRASTRE_UMBRAL_PX=3;
let arrastreActivo=null; // {key,cell,pointerId,armado,ultimoDestino,rafId,ultimoX,ultimoY}
