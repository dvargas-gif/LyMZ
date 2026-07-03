// Arrastre inmediato (drag & drop) de un cuerpo completo via Pointer
// Events nativos. Capa aparte de interacciones.js: solo DISPARA
// iniciarMoverCuerpo()/soltarCuerpoEn() cuando corresponde, no cambia su
// logica. Solo existe dentro del "Modo edicion" (ver estado.js).

function elFantasmaDrag(){
  let el=document.getElementById('fantasmaDrag');
  if(!el){el=document.createElement('div');el.id='fantasmaDrag';document.body.appendChild(el);}
  return el;
}
function mostrarFantasma(texto){const el=elFantasmaDrag();el.textContent=texto;el.style.display='flex';requestAnimationFrame(()=>el.classList.add('visible'));}
function posicionarFantasma(x,y){const el=document.getElementById('fantasmaDrag');if(el){el.style.left=x+'px';el.style.top=y+'px';}}
function ocultarFantasma(){const el=document.getElementById('fantasmaDrag');if(el){el.classList.remove('visible');el.style.display='none';}}
function celdaBajoPuntero(x,y){
  const el=document.elementFromPoint(x,y);
  return (el&&el.closest)?el.closest('[data-key]'):null;
}
// Actualiza la celda destino resaltada SOLO cuando cambia (nada de barrer
// el DOM entero en cada pointermove) — esto es lo que evita el "salteo" al
// arrastrar rápido sobre muchas celdas seguidas.
function marcarDestino(x,y){
  const destCell=celdaBajoPuntero(x,y);
  const destino=(destCell&&destCell.dataset.key!==arrastreActivo.key)?destCell:null;
  if(destino===arrastreActivo.ultimoDestino)return;
  if(arrastreActivo.ultimoDestino)arrastreActivo.ultimoDestino.classList.remove('destino-arrastre');
  if(destino)destino.classList.add('destino-arrastre');
  arrastreActivo.ultimoDestino=destino;
}
// Todas las actualizaciones visuales del arrastre (fantasma + resaltado de
// destino) se aplican una sola vez por frame con requestAnimationFrame, en
// vez de una vez por cada evento pointermove crudo (que en mouse/trackpad
// de alta frecuencia puede disparar mucho más rápido que 60fps) — así el
// arrastre se ve fluido en vez de saltar.
function actualizarFrameArrastre(){
  if(!arrastreActivo||!arrastreActivo.armado)return;
  arrastreActivo.rafId=null;
  posicionarFantasma(arrastreActivo.ultimoX,arrastreActivo.ultimoY);
  marcarDestino(arrastreActivo.ultimoX,arrastreActivo.ultimoY);
}

function iniciarPulsacion(e,key,cell){
  if(!modoEdicion)return; // el arrastre solo existe DENTRO del modo edición — fuera de él, el click de siempre queda 100% intacto
  if(e.button!==undefined&&e.button!==0)return; // solo botón primario del mouse (touch no trae "button")
  if(modoBloqueo||modoSeleccionArea||moviendo)return; // no interferir con otros modos ya activos
  const cu=CUERPOS[key];
  if(!cu||nArts(cu)===0)return; // nada que arrastrar en un slot vacío
  if(bloqueadas.has(key))return;
  cancelarPulsacion();
  // Evita que el navegador arranque su propia selección de texto/etiquetas
  // mientras el mouse se mueve rápido durante el arrastre (se veían recuadros
  // celestes de selección nativa sobre "MZ06", los números de nivel, etc.).
  e.preventDefault();
  document.getSelection()?.removeAllRanges();
  try{grid.setPointerCapture(e.pointerId);}catch(err){}
  arrastreActivo={key,cell,startX:e.clientX,startY:e.clientY,pointerId:e.pointerId,armado:false,ultimoDestino:null,rafId:null,ultimoX:e.clientX,ultimoY:e.clientY};
}
function activarArrastre(key,cell){
  if(!arrastreActivo||arrastreActivo.key!==key)return;
  arrastreActivo.armado=true;
  cell.classList.add('arrastrando');
  iniciarMoverCuerpo(key); // reutiliza TAL CUAL: arma moviendo, muestra movebar y hace render()
  // iniciarMoverCuerpo() acaba de llamar a render(), que recreó todas las
  // celdas — la celda original quedó desmontada del DOM. Se reengancha la
  // marca visual de "arrastrando" sobre la celda NUEVA con la misma key.
  const nuevaCell=cellRefs[key];
  if(nuevaCell){arrastreActivo.cell=nuevaCell;nuevaCell.classList.add('arrastrando');}
  const na=nArts(CUERPOS[key]||{niveles:{}});
  mostrarFantasma(`✋ Moviendo ${key.replace('|','-C')} (${na} art)`);
  posicionarFantasma(arrastreActivo.ultimoX,arrastreActivo.ultimoY);
}
function moverPulsacion(e){
  if(!arrastreActivo||e.pointerId!==arrastreActivo.pointerId)return;
  e.preventDefault();
  arrastreActivo.ultimoX=e.clientX;arrastreActivo.ultimoY=e.clientY;
  if(arrastreActivo.armado){
    if(arrastreActivo.rafId==null)arrastreActivo.rafId=requestAnimationFrame(actualizarFrameArrastre);
    return;
  }
  const dx=e.clientX-arrastreActivo.startX, dy=e.clientY-arrastreActivo.startY;
  if(Math.hypot(dx,dy)>ARRASTRE_UMBRAL_PX)activarArrastre(arrastreActivo.key,arrastreActivo.cell);
}
function soltarPulsacion(e){
  if(!arrastreActivo||e.pointerId!==arrastreActivo.pointerId)return;
  const p=arrastreActivo;
  try{grid.releasePointerCapture(e.pointerId);}catch(err){}
  if(p.rafId!=null)cancelAnimationFrame(p.rafId);
  if(!p.armado){
    // no llegó a moverse más que el umbral: fue un click/tap normal, se
    // deja todo como estaba y el onclick de la celda sigue su curso solo
    // (abrir rack / continuar flujo de Mover por modal).
    arrastreActivo=null;
    return;
  }
  if(p.ultimoDestino)p.ultimoDestino.classList.remove('destino-arrastre');
  ocultarFantasma();
  p.cell.classList.remove('arrastrando');
  arrastreActivo=null;

  const destCell=celdaBajoPuntero(e.clientX,e.clientY);
  const destKey=destCell?destCell.dataset.key:null;

  if(!destKey||destKey===p.key){cancelarMover();return;} // soltó afuera del mapa o volvió al mismo rack: se cancela en silencio, nada cambia
  if(bloqueadas.has(destKey)){
    document.getElementById('movebar').innerHTML=`⚠ Esa posición está bloqueada, no se puede soltar ahí. <button class="cancel" onclick="cancelarMover()">cerrar</button>`;
    setTimeout(()=>{ if(moviendo)cancelarMover(); },2500);
    return;
  }
  soltarCuerpoEn(destKey); // reutiliza TAL CUAL: valida vacío/mismo origen, guarda y notifica
}
function cancelarPulsacion(){
  if(!arrastreActivo)return;
  if(arrastreActivo.rafId!=null)cancelAnimationFrame(arrastreActivo.rafId);
  if(arrastreActivo.ultimoDestino)arrastreActivo.ultimoDestino.classList.remove('destino-arrastre');
  arrastreActivo.cell.classList.remove('arrastrando');
  try{grid.releasePointerCapture(arrastreActivo.pointerId);}catch(err){}
  ocultarFantasma();
  arrastreActivo=null;
}
grid.addEventListener('pointermove',moverPulsacion);
grid.addEventListener('pointerup',soltarPulsacion);
grid.addEventListener('pointercancel',()=>cancelarPulsacion());
// --- FIN AGREGADO ARRASTRE INMEDIATO ---
