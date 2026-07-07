// Flujo de "mover un articulo/cuerpo por click + modal" (no el arrastre por
// pulsacion, ese esta en 09-arrastre.js): iniciar, soltar, confirmar,
// deshacer; mas los modos de bloqueo y seleccion de area.

function toggleModoBloqueo(){
  modoBloqueo=!modoBloqueo;
  document.getElementById("btnLock").classList.toggle("activo",modoBloqueo);
  document.getElementById("btnLock").textContent=modoBloqueo?"🔓 Modo bloqueo ACTIVO (tocá posiciones)":"🔒 Bloquear posiciones";
}
function toggleModoEdicion(){
  modoEdicion=!modoEdicion;
  document.getElementById("btnEdit").classList.toggle("activo",modoEdicion);
  document.getElementById("btnEdit").textContent=modoEdicion?"✏️ Modo edición ACTIVO (arrastrá para mover)":"✏️ Modo edición";
  document.body.classList.toggle("modo-edicion",modoEdicion);
  if(!modoEdicion)cancelarPulsacion(); // si lo apagan a mitad de un arrastre, se cancela limpio
}
function toggleBloqueo(key){
  if(bloqueadas.has(key))bloqueadas.delete(key);
  else bloqueadas.add(key);
  notificarBloqueo(key, bloqueadas.has(key));
  render();
}
function toggleModoSeleccionArea(){
  if(!ESCENARIO_ID)return;
  modoSeleccionArea=!modoSeleccionArea;
  if(!modoSeleccionArea)seleccionArea.clear();
  render();
  notificarSeleccionArea();
}
function alternarSeleccionCelda(key){
  if(seleccionArea.has(key))seleccionArea.delete(key);
  else seleccionArea.add(key);
  render();
  notificarSeleccionArea();
}
// Avisa a React cuántas posiciones hay seleccionadas — así el botón
// "Limpiar área (N)" de la barra de acciones muestra el conteo real.
function notificarSeleccionArea(){
  try{
    if(window.parent && window.parent!==window){
      window.parent.postMessage({type:'slotting:seleccionArea',payload:{cantidad:seleccionArea.size,escenarioId:ESCENARIO_ID}}, '*');
    }
  }catch(e){}
}
function limpiarAreaSeleccionada(){
  if(!ESCENARIO_ID)return;
  if(seleccionArea.size===0){alert('Primero tocá "📦 Seleccionar área" y elegí al menos una posición.');return;}
  if(!confirm(`¿Vaciar ${seleccionArea.size} posición(es) seleccionada(s) en esta sala? Esta acción no se puede deshacer.`))return;
  const keys=[...seleccionArea];
  keys.forEach(key=>{
    const cu=CUERPOS[key];
    if(!cu)return;
    const articulos=[];
    for(const niv in cu.niveles)cu.niveles[niv].forEach(a=>articulos.push(a.art));
    delete CUERPOS[key];
    articulos.forEach(art=>notificarEliminado(art));
  });
  seleccionArea.clear();
  modoSeleccionArea=false;
  render();
  notificarSeleccionArea();
}
// --- FIN AGREGADO SELECCIÓN DE ÁREA ---
function logMov(art,desde,hacia,tipo){
  const log=document.getElementById("termlog");
  if(log.querySelector("div") && log.children.length===1 && log.children[0].style.fontStyle==="italic"){log.innerHTML="";}
  // El input "Usuario" del panel se quitó del rediseño visual — el nombre
  // real de quién movió cada artículo YA queda guardado en Auditoría
  // (Supabase, vía sesión real) sin depender de este texto cosmético.
  const usr="Usuario";
  const linea=document.createElement("div");
  linea.style.marginBottom="8px";linea.style.paddingBottom="8px";linea.style.borderBottom="1px solid #2A2A2A";
  const tipoTxt=tipo==="cuerpo"?' <span style="color:#EF9F27">[cuerpo]</span>':'';
  linea.innerHTML=`<span style="color:#E0E0E0;font-weight:700">▸ ${art}</span>${tipoTxt}<br>`+
    `<span style="color:#B47A6A">${desde}</span> <span style="color:#5F5E5A">→</span> <span style="color:#9FBF9F">${hacia}</span><br>`+
    `<span style="color:#5F5E5A">${usr} · ${ahoraStr()}</span>`;
  log.insertBefore(linea,log.firstChild);
  // --- ÚNICO AGREGADO PARA AUDITORÍA (no cambia la lógica de mover/deshacer) ---
  try{
    if(window.parent && window.parent!==window){
      window.parent.postMessage({type:'slotting:audit',payload:{
        articulo:art, desde, hacia, tipoMovimiento:tipo, usuario:usr, fechaHora:ahoraStr(), escenarioId:ESCENARIO_ID
      }}, '*');
    }
  }catch(e){}
  // --- FIN AGREGADO ---
}
// Vacía un slot COMPLETO — solo existe dentro de una sala de simulación
// (el botón que la llama ni siquiera se muestra en el mapa real).
function limpiarSlot(key){
  if(!ESCENARIO_ID)return;
  const cu=CUERPOS[key];
  if(!cu)return;
  const articulos=[];
  for(const niv in cu.niveles)cu.niveles[niv].forEach(a=>articulos.push(a.art));
  delete CUERPOS[key];
  articulos.forEach(art=>notificarEliminado(art));
  cerrar();
  render();
}
function iniciarMover(art,desdeKey,desdeNiv){
  moviendo={art,desdeKey,desdeNiv};
  cerrar();
  const mb=document.getElementById("movebar");
  mb.className="movebar show";
  mb.innerHTML=`Moviendo artículo <b>${art}</b> (desde ${desdeKey.replace('|','-C')}, ${desdeNiv}). `+
               `Tocá el rack destino en el mapa. <button class="cancel" onclick="cancelarMover()">cancelar</button>`;
  render();
}
function cancelarMover(){moviendo=null;document.getElementById("movebar").className="movebar";render();}
function soltarEn(destKey){
  if(!moviendo)return;
  const dpas=destKey.split("|")[0], dcol=destKey.split("|")[1];
  // crear cuerpo destino si no existe
  if(!CUERPOS[destKey]){
    CUERPOS[destKey]={pas:dpas,col:parseInt(dcol),clase:"-",grupo:"-",niveles:{},tipo:"NORMAL"};
  }
  const cuD=CUERPOS[destKey];
  // elegir nivel destino
  const mb=document.getElementById("movebar");
  let opts=["N02","N03","N04","N01","N05"].map(n=>`<span class="nivelpick" onclick="confirmar('${destKey}','${n}')">${n}</span>`).join("");
  if(cuD.tipo==="CUERPO")opts=`<span class="nivelpick" onclick="confirmar('${destKey}','CUERPO')">CUERPO ENTERO</span>`;
  mb.innerHTML=`Mover <b>${moviendo.art}</b> a <b>${dpas}-C${String(parseInt(dcol)).padStart(3,'0')}</b>. Elegí nivel: ${opts} `+
               `<button class="cancel" onclick="cancelarMover()">cancelar</button>`;
}
function confirmar(destKey,niv){
  const {art,desdeKey,desdeNiv}=moviendo;
  const cuO=CUERPOS[desdeKey];
  const idx=cuO.niveles[desdeNiv].findIndex(a=>a.art===art);
  if(idx<0){cancelarMover();return;}
  const articulo=cuO.niveles[desdeNiv].splice(idx,1)[0];
  if(cuO.niveles[desdeNiv].length===0)delete cuO.niveles[desdeNiv];
  // BUGFIX: si el rack de origen quedó sin ningún artículo, se borra del
  // todo -- mismo criterio que ya usaba deshacer() al reconstruir estado.
  // Antes esto NO pasaba acá, así que el slot vaciado por completo se
  // quedaba pintado como "0" en vez de aparecer vacío.
  if(nArts(cuO)===0)delete CUERPOS[desdeKey];
  const cuD=CUERPOS[destKey];
  cuD.niveles[niv]=cuD.niveles[niv]||[];
  cuD.niveles[niv].push(articulo);
  const dcol=String(cuD.col).padStart(3,'0');
  cambios.push({art, tipo:'suelto', lote:++loteContador,
    hpas:cuD.pas, hcol:cuD.col, hniv:niv,
    dpas:cuO.pas, dcol:cuO.col, dniv:desdeNiv,
    dclase:cuO.clase, dgrupo:cuO.grupo, dtipo:cuO.tipo,
    desde:`${cuO.pas}-C${String(cuO.col).padStart(3,'0')}-${desdeNiv}`,
    hacia:`${cuD.pas}-C${dcol}-${niv}`});
  logMov(art, `${cuO.pas}-C${String(cuO.col).padStart(3,'0')}-${desdeNiv}`, `${cuD.pas}-C${dcol}-${niv}`, 'suelto');
  notificarPosicion(art, cuD.pas, cuD.col, niv);
  moviendo=null;
  document.getElementById("movebar").className="movebar";
  actualizarBadgeCambios();
  render();
}
function deshacer(){
  if(cambios.length===0)return;
  // BUGFIX: antes se sacaba UNA sola entrada de `cambios` por click -- si el
  // último movimiento fue un cuerpo completo (N entradas, mismo `lote`),
  // "Deshacer" solo devolvía un artículo por vez en vez del cuerpo entero.
  // Ahora se saca y revierte TODO el lote (todas las entradas contiguas con
  // el mismo id) de una sola vez.
  const loteId=cambios[cambios.length-1].lote;
  const lote=[];
  while(cambios.length>0 && cambios[cambios.length-1].lote===loteId){
    lote.push(cambios.pop());
  }
  lote.forEach(c=>{
    // reconstruir keys/niveles desde los campos guardados (robusto)
    const hkey=c.hpas+"|"+c.hcol, hniv=c.hniv;
    const dkey=c.dpas+"|"+c.dcol, dniv=c.dniv;
    const cuH=CUERPOS[hkey];
    if(cuH && cuH.niveles[hniv]){
      const i=cuH.niveles[hniv].findIndex(a=>a.art===c.art);
      if(i>=0){
        const a=cuH.niveles[hniv].splice(i,1)[0];
        if(cuH.niveles[hniv].length===0)delete cuH.niveles[hniv];
        // si el cuerpo destino quedó vacío, borrarlo del mapa
        if(nArts(cuH)===0)delete CUERPOS[hkey];
        // recrear el cuerpo de origen si fue borrado (caso mover cuerpo completo)
        if(!CUERPOS[dkey]){
          CUERPOS[dkey]={pas:c.dpas,col:parseInt(c.dcol),clase:c.dclase||"-",grupo:c.dgrupo||"-",tipo:c.dtipo||"NORMAL",niveles:{}};
        }
        CUERPOS[dkey].niveles[dniv]=CUERPOS[dkey].niveles[dniv]||[];
        CUERPOS[dkey].niveles[dniv].push(a);
        notificarPosicion(c.art, c.dpas, c.dcol, dniv);
        notificarDeshecho(c.art, `${c.hpas}-C${String(c.hcol).padStart(3,'0')}-${hniv}`, `${c.dpas}-C${String(c.dcol).padStart(3,'0')}-${dniv}`);
      }
    }
  });
  actualizarBadgeCambios();render();
}
function iniciarMoverCuerpo(desdeKey){
  const cu=CUERPOS[desdeKey];
  if(!cu||nArts(cu)===0)return;
  moviendo={cuerpoCompleto:true, desdeKey};
  cerrar();
  const mb=document.getElementById("movebar");
  mb.className="movebar show";
  mb.innerHTML=`Moviendo CUERPO COMPLETO <b>${desdeKey.replace('|','-C')}</b> (${nArts(cu)} artículos, todos sus niveles). `+
               `Tocá un rack destino VACÍO (en blanco). <button class="cancel" onclick="cancelarMover()">cancelar</button>`;
  render();
}
function soltarCuerpoEn(destKey){
  const cuO=CUERPOS[moviendo.desdeKey];
  if(!cuO){cancelarMover();return;}
  const dpas=destKey.split("|")[0], dcol=parseInt(destKey.split("|")[1]);
  // no permitir soltar sobre el mismo cuerpo de origen
  if(destKey===moviendo.desdeKey){
    document.getElementById("movebar").innerHTML=`⚠ Es el mismo rack de origen. Elegí otro espacio. <button class="cancel" onclick="cancelarMover()">cancelar</button>`;
    return;
  }
  // validar que el destino esté vacío
  if(CUERPOS[destKey] && nArts(CUERPOS[destKey])>0){
    document.getElementById("movebar").innerHTML=`⚠ Ese rack <b>${dpas}-C${String(dcol).padStart(3,'0')}</b> NO está vacío. Elegí un espacio en blanco. <button class="cancel" onclick="cancelarMover()">cancelar</button>`;
    return;
  }
  const colO=String(cuO.col).padStart(3,'0'), colD=String(dcol).padStart(3,'0');
  // COPIA PROFUNDA de los niveles del origen (para no perder la referencia al borrar)
  const nivelesCopia={};
  // BUGFIX "Deshacer": las N entradas que este movimiento genera (una por
  // artículo) comparten el mismo `lote` -- así deshacer() las revierte todas
  // juntas, en vez de una por click.
  const loteActual=++loteContador;
  for(const niv in cuO.niveles){
    nivelesCopia[niv]=cuO.niveles[niv].map(a=>({art:a.art,picks:a.picks,consumo:a.consumo,actual:a.actual}));
    nivelesCopia[niv].forEach(a=>{
      cambios.push({art:a.art, tipo:'cuerpo', lote:loteActual,
        hpas:dpas, hcol:dcol, hniv:niv,
        dpas:cuO.pas, dcol:cuO.col, dniv:niv,
        dclase:cuO.clase, dgrupo:cuO.grupo, dtipo:cuO.tipo,
        desde:`${cuO.pas}-C${colO}-${niv}`, hacia:`${dpas}-C${colD}-${niv}`});
    });
  }
  // crear destino con la copia, conservando clase/tipo del origen
  CUERPOS[destKey]={pas:dpas,col:dcol,clase:cuO.clase,grupo:cuO.grupo,tipo:cuO.tipo,niveles:nivelesCopia};
  logMov(`cuerpo completo (${Object.values(nivelesCopia).reduce((s,l)=>s+l.length,0)} art)`, `${cuO.pas}-C${colO}`, `${dpas}-C${colD}`, 'cuerpo');
  for(const niv in nivelesCopia){nivelesCopia[niv].forEach(a=>notificarPosicion(a.art, dpas, dcol, niv, cuO.clase, cuO.grupo, cuO.tipo));}
  // borrar el origen -> queda en blanco
  delete CUERPOS[moviendo.desdeKey];
  moviendo=null;
  document.getElementById("movebar").className="movebar";
  actualizarBadgeCambios();
  render();
}
