// Configuracion "de fabrica" del croquis: cuantas columnas tiene cada
// pasillo, donde van los cortes de PASILLO, la paleta de colores por clase
// y sus variantes de tema. maxColDe()/gapsDe() son la UNICA puerta de
// entrada que usa render() para saber hasta donde dibujar cada pasillo.

const PAS=["MZ08","MZ07","MZ06","MZ05","MZ04","MZ03","MZ02","MZ01"];
const PAS_LR=["MZ01","MZ02","MZ03","MZ04","MZ05","MZ06","MZ07","MZ08"];
const COLS=Array.from({length:36},(_,i)=>i+1); // 36 es el techo absoluto del sistema (numeración, gaps, etc.)
const GAP_AFTER_DEFAULT=[9,19,26]; // MZ02-MZ08: tras C009, C019, C026
const GAP_AFTER_MZ01=[7,22]; // MZ01 (mientras no llegue a 36): tras C007 y C022
const MAXCOL_MZ01=27; // MZ01 llega hasta C027 — valor de base/fábrica
// --- AGREGADO: "Añadir rack" — límite de columnas POR PASILLO, configurable.
// Arranca igual que siempre (MZ01=27, el resto=36) y estadoInicial lo
// sobreescribe con lo que haya guardado en Supabase (pasillos_config), si
// un Administrador extendió algún pasillo. maxColDe()/gapsDe() son la ÚNICA
// puerta de entrada que usa render() — no se duplica este criterio en
// ningún otro lado.
const MAXCOL_POR_PASILLO={};
function maxColDe(pas){ return MAXCOL_POR_PASILLO[pas] ?? (pas==="MZ01"?MAXCOL_MZ01:36); }
function gapsDe(pas){ return maxColDe(pas)>=36 ? GAP_AFTER_DEFAULT : GAP_AFTER_MZ01; }
// Paleta ESTÁNDAR de clasificación de artículos (única fuente de verdad de
// estos 5 colores; el mismo set vive espejado en
// src/constants/coloresArticulo.js para que React lo use igual en tablas y
// reportes). Elegida para contraste WCAG AA con texto blanco (todas ≥4.9:1)
// y distinguibilidad bajo daltonismo (familia de matices inspirada en la
// paleta Okabe-Ito, evitando el par rojo/verde puro que más se confunde).
// Aplica SOLO a la clasificación de artículos — pasillos, slots vacíos,
// bloqueados, fondo y modo simulación no se tocan.
const ZCOL={A:"#0B5394",B:"#0F766E",C:"#B45309",D:"#6D4C7D",CUERPO:"#374151"};
const ZNOM={A:"Alta",B:"Media",C:"Baja",D:"Muy baja"};
// --- AGREGADO PARA CONFIGURACIÓN (tema/orientación) ---
// PALETAS solo se usa para MUTAR los valores de ZCOL (nunca se reemplaza el
// objeto), así que intensidad()/render() siguen funcionando exactamente igual,
// solo con otros colores de entrada.
const PALETAS={
  claro:{A:"#0B5394",B:"#0F766E",C:"#B45309",D:"#6D4C7D",CUERPO:"#374151"},
  oscuro:{A:"#3FA7AC",B:"#E8935F",C:"#B583C4",D:"#E0B24A",CUERPO:"#6B7280"},
  // alto_contraste: se cambió el B de rojo puro (#CC0000) a un teal oscuro,
  // porque junto al C (naranja) era exactamente el par que más se confunde
  // en daltonismo rojo-verde — el resto de la paleta de este tema no se tocó.
  alto_contraste:{A:"#0B5394",B:"#00695C",C:"#B45F06",D:"#674EA7",CUERPO:"#000000"},
};
function aplicarConfiguracion(cfg){
  if(!cfg)return;
  if(cfg.orientacion){
    document.body.classList.toggle('horizontal-mode', cfg.orientacion==='horizontal');
  }
  if(cfg.tema && PALETAS[cfg.tema]){
    Object.assign(ZCOL, PALETAS[cfg.tema]);
    document.body.classList.remove('tema-oscuro','tema-alto-contraste');
    if(cfg.tema==='oscuro')document.body.classList.add('tema-oscuro');
    if(cfg.tema==='alto_contraste')document.body.classList.add('tema-alto-contraste');
    const sw=document.getElementById.bind(document);
    if(sw('swA')){sw('swA').style.background=ZCOL.A;sw('swB').style.background=ZCOL.B;sw('swC').style.background=ZCOL.C;sw('swD').style.background=ZCOL.D;}
    if(sw('swCuerpo'))sw('swCuerpo').style.background=ZCOL.CUERPO;
  }
  render();
  ajustarEscalaGrid();
}
// --- FIN AGREGADO PARA CONFIGURACIÓN ---
const GAPNAME={9:"PASILLO",19:"PASILLO",26:"PASILLO"};
const NIVORDER=["N05","N04","N03","N02","N01","CUERPO"];
const GRUPO_GAP_DESPUES=["MZ01","MZ03","MZ05","MZ07"]; // corredor tras estos pasillos (MZ01 solo, MZ02-03, MZ04-05, MZ06-07, MZ08 solo)
