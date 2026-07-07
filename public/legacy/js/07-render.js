// Dibujado del croquis (grilla de racks) y del modal de detalle de un
// rack. Es el modulo mas grande porque render() es el unico lugar que
// reconstruye toda la grilla -- no se toca su logica interna en este
// refactor, solo se lo mueve tal cual a su propio archivo.

// --- AGREGADO: escalar el croquis para que nunca haga scroll horizontal ---
// #grid tiene un ancho natural fijo (según cantidad de columnas y tamaño de
// celda). Si ese ancho no entra en .wrap, en vez de mostrar una barra de
// scroll (como antes), se reduce PROPORCIONALMENTE con transform:scale.
// No cambia render() ni ninguna celda: es una transformación visual sobre
// el contenedor #grid ya construido.
function ajustarEscalaGrid(){
  const wrap=document.querySelector('.wrap');
  const grid=document.getElementById('grid');
  if(!wrap||!grid)return;
  grid.style.transform='none'; // medir el tamaño real, sin una escala previa aplicada
  const anchoDisponible=wrap.clientWidth;
  const anchoNatural=grid.scrollWidth;
  const altoNatural=grid.scrollHeight;
  if(!anchoDisponible||anchoNatural<=anchoDisponible){
    wrap.style.height='';
    return; // entra tal cual, sin necesidad de escalar
  }
  const factor=anchoDisponible/anchoNatural;
  grid.style.transformOrigin='top left';
  grid.style.transform='scale('+factor+')';
  wrap.style.height=Math.ceil(altoNatural*factor)+'px'; // compensa el alto para no dejar espacio vacío
}
window.addEventListener('resize', ajustarEscalaGrid);
// --- FIN AGREGADO DE ESCALADO ---
// Actualiza el badge de "cambios" de la toolbar (cambios.length).
function actualizarBadgeCambios(){
  document.getElementById("badge").textContent=cambios.length+" cambios";
}
// "Añadir rack" SÍ es una función real: le avisa a React (que es quien
// habla con Supabase) que el Administrador quiere extender un pasillo.
// El mapa nunca escribe en Supabase directamente — mismo patrón que ya usa
// todo lo demás (posiciones, bloqueos, picks, etc.).
function solicitarAddRack(){
  try{
    if(window.parent && window.parent!==window){
      window.parent.postMessage({type:'slotting:solicitarAddRack',payload:{maxColumnas:MAXCOL_POR_PASILLO}}, '*');
    }
  }catch(e){}
}
// BUGFIX: el botón separado "‹ Registro" (#termToggle) se sacó -- ahora el
// badge "N cambios" de la toolbar es el único control que abre la terminal
// (ver mapa_editable_slotting.html). Cerrarla sigue siendo "Ocultar ›",
// dentro de la terminal misma, que ya llamaba a esta misma función.
function toggleTerminal(){
  const t=document.getElementById("terminal");
  const w=document.querySelector(".wrap");
  if(t.style.display==="none"){t.style.display="flex";w.style.maxWidth="calc(100% - 530px)";}
  else{t.style.display="none";w.style.maxWidth="";}
}
function render(){
  grid.innerHTML="";
  grid.style.display="flex";
  grid.style.flexDirection="row";
  grid.style.gap="0";
  grid.style.alignItems="flex-start";
  // columna de numeración con encabezado y cortes propios
  function colNumeracion(titulo, gaps, maxCol, alinear){
    const box=document.createElement("div");
    box.style.display="flex";box.style.flexDirection="column";
    box.style[alinear==="left"?"marginRight":"marginLeft"]="4px";
    const head=document.createElement("div");
    head.style.height="20px";head.style.display="flex";head.style.alignItems="center";
    head.style.justifyContent="center";head.style.fontSize="9px";head.style.fontWeight="800";
    head.style.color="#2E7D83";head.textContent=titulo;box.appendChild(head);
    COLS.forEach(c=>{
      if(c>maxCol){return;}
      const d=document.createElement("div");
      d.style.height="30px";d.style.display="flex";d.style.alignItems="center";
      d.style.justifyContent=alinear==="left"?"flex-start":"flex-end";
      d.style.fontSize="8px";d.style.color="#6E7A72";d.style.fontWeight="700";
      d.style[alinear==="left"?"paddingLeft":"paddingRight"]="5px";
      d.textContent="C"+String(c).padStart(3,"0");
      box.appendChild(d);
      if(gaps.includes(c)){const g=document.createElement("div");g.style.height="26px";g.style.marginTop="2px";box.appendChild(g);}
    });
    return box;
  }
  // una COLUMNA por pasillo (MZ01 ... MZ08)
  PAS_LR.forEach(pas=>{
    const colDiv=document.createElement("div");
    colDiv.style.display="flex";colDiv.style.flexDirection="column";colDiv.style.gap="2px";
    // etiqueta del pasillo arriba
    const lbl=document.createElement("div");
    lbl.style.height="20px";lbl.style.display="flex";lbl.style.alignItems="center";lbl.style.justifyContent="center";
    lbl.style.fontSize="11px";lbl.style.fontWeight="600";lbl.style.letterSpacing="-.2px";lbl.style.color="#2E7D83";
    lbl.textContent=pas;colDiv.appendChild(lbl);
    // cuerpos de rack apilados hacia abajo (todas las columnas son slots)
    const gapsPas=gapsDe(pas);
    const maxCol=maxColDe(pas);
    COLS.forEach(c=>{
      if(c>maxCol)return; // hasta dónde dibuja este pasillo (ver MAXCOL_POR_PASILLO)
      const key=pas+"|"+c;const cu=CUERPOS[key];
      const estaBloqueada=bloqueadas.has(key);
      let cell=document.createElement("div");
      if(cu){const na=nArts(cu);const esC=cu.tipo==="CUERPO";
        cell.className="cell";cell.style.background=esC?ZCOL.CUERPO:intensidad(cu.clase,na);
        if(esC)cell.style.border="2px solid #1C3A3E";
        cell.style.color=(esC||na/20>0.5)?"#fff":"#1C3A3E";
        cell.innerHTML=esC?`<span class="cestamp">CE</span>`:`<span class="n">${na}</span>`;
        const nivA=nivelesArmar(cu);
        if(nivA>0){cell.innerHTML+=`<span style="position:absolute;top:2px;right:3px;font-size:7px;font-weight:600;letter-spacing:-.2px;color:${(esC||na/20>0.5)?'#FFD9A8':'#C0392B'};opacity:.85">${nivA}N</span>`;}
        if(!esC){const llp=consumoTotal(cu)/4.5;const lcol=colorLlenura(llp);
          cell.innerHTML+=`<span style="position:absolute;bottom:2px;left:3px;right:3px;height:2.5px;border-radius:2px;background:rgba(0,0,0,.08)"><span style="display:block;height:100%;border-radius:2px;width:${Math.min(llp*100,100)}%;background:${lcol}"></span></span>`;}
        cell.onclick=()=>{
          if(modoSeleccionArea){alternarSeleccionCelda(key);return;}
          if(modoBloqueo){toggleBloqueo(key);return;}
          if(estaBloqueada)return; // bloqueada: no se abre ni recibe
          if(moviendo&&moviendo.cuerpoCompleto) soltarCuerpoEn(key); else if(moviendo) soltarEn(key); else abrir(key);
        };
        if(seleccionArea.has(key))cell.classList.add("seleccionada");
      }else{cell.className="cell empty";cell.onclick=()=>{
          if(modoSeleccionArea){alternarSeleccionCelda(key);return;}
          if(modoBloqueo){toggleBloqueo(key);return;}
          if(estaBloqueada)return;
          if(moviendo&&moviendo.cuerpoCompleto) soltarCuerpoEn(key); else if(moviendo) soltarEn(key);
        };
        if(seleccionArea.has(key))cell.classList.add("seleccionada");}
      // etiqueta del número de columna al lado (arriba-izquierda) de cada cuadro
      const colTxt=cu?((cu.tipo==="CUERPO"||nArts(cu)/20>0.5)?"#FFFFFF":"#5F5E5A"):"#9A9684";
      cell.innerHTML+=`<span style="position:absolute;top:2px;left:3px;font-size:5.5px;font-weight:600;letter-spacing:-.2px;color:${colTxt};opacity:.65">${String(c).padStart(3,"0")}</span>`;
      // posición bloqueada: tachada + candado
      if(estaBloqueada){cell.classList.add("bloqueada");cell.innerHTML+=`<span class="candado">🔒</span>`;}
      // Durante un arrastre activo NO se ilumina toda la grilla de posibles
      // destinos (era carga visual innecesaria en grillas grandes) — solo se
      // resalta la celda puntual bajo el cursor, vía marcarDestino().
      if(moviendo&&!estaBloqueada&&!(arrastreActivo&&arrastreActivo.armado))cell.classList.add("target");
      // Pulsación larga (long-press) para arrastrar: data-key habilita ubicar
      // la celda bajo el puntero con elementFromPoint() durante el arrastre;
      // el pointerdown solo ARMA un temporizador, nunca reemplaza el onclick
      // de arriba (ver iniciarPulsacion()).
      cell.dataset.key=key;
      cell.addEventListener('pointerdown',e=>iniciarPulsacion(e,key,cell));
      colDiv.appendChild(cell);cellRefs[key]=cell;
      // insertar PASILLO neutro (espacio extra, no slot) según los cortes de ESTE pasillo
      if(gapsPas.includes(c)){const g=document.createElement("div");g.className="gaph";g.innerHTML=`<span>PASILLO</span>`;colDiv.appendChild(g);}
    });
    grid.appendChild(colDiv);
    // corredor VERTICAL entre grupos de pares (tras MZ02 y MZ06)
    if(GRUPO_GAP_DESPUES.includes(pas)){
      const gv=document.createElement("div");gv.className="gapv";
      gv.innerHTML=`<span>PASILLO</span>`;
      grid.appendChild(gv);
    }
  });
}
function abrir(key){
  modalKey=key;const cu=CUERPOS[key];if(!cu)return;
  document.getElementById("mhead").style.background=(cu.tipo==="CUERPO")?ZCOL.CUERPO:(ZCOL[cu.clase]||"#15454A");
  document.getElementById("mtit").textContent=`${cu.pas} · C${String(cu.col).padStart(3,"0")}`;
  document.getElementById("mmeta").textContent=`Clase ${cu.clase} (${ZNOM[cu.clase]}) · ${nArts(cu)} artículos`;
  let body="";
  const nivArmar=nivelesArmar(cu);
  const esCuerpoEntero=!!cu.niveles["CUERPO"];
  if(nivArmar>0){
    if(esCuerpoEntero){
      body+=`<div style="background:#FFF4EC;border:2px solid #E07B39;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:16px">`+
            `<div style="font-size:42px;font-weight:800;color:#C0392B;line-height:1">1</div>`+
            `<div><div style="font-size:15px;font-weight:800;color:#1C3A3E">NIVEL (cuerpo entero)</div>`+
            `<div style="font-size:13px;color:#6E7A72">Espacio único: poné <b>1 piso y 1 techo</b> (1 par de largueros). Liberás 4 pares para otro lado.</div></div></div>`;
    }else{
      body+=`<div style="background:#FFF4EC;border:2px solid #E07B39;border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:16px">`+
            `<div style="font-size:42px;font-weight:800;color:#C0392B;line-height:1">${nivArmar}</div>`+
            `<div><div style="font-size:15px;font-weight:800;color:#1C3A3E">NIVELES a armar</div>`+
            `<div style="font-size:13px;color:#6E7A72">Poné <b>${nivArmar} pares de largueros</b> en este cuerpo de rack</div></div></div>`;
    }
  }
  if(nArts(cu)>0){
    const ll=llenura(cu); const llp=Math.round(consumoTotal(cu)/4.5*100); const col=colorLlenura(ll);
    body+=`<div style="margin-bottom:16px">`+
      `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:5px">`+
      `<span style="color:#1C3A3E">Capacidad del rack (llenura)</span><span style="color:${col}">${llp}%${llp>100?' ⚠ SOBRECARGADO':''}</span></div>`+
      `<div style="height:18px;background:#EDEAE0;border-radius:9px;overflow:hidden;position:relative">`+
      `<div style="height:100%;width:${Math.min(llp,100)}%;background:${col};border-radius:9px;transition:width .2s"></div>`+
      `<div style="position:absolute;top:0;left:88.9%;height:100%;width:2px;background:#1C3A3E;opacity:.4"></div>`+
      `</div>`+
      `<div style="font-size:10px;color:#9A9684;margin-top:3px">Consumo ${consumoTotal(cu).toFixed(2)} de 4.5 disponible · la línea marca el tope recomendado</div></div>`;
  }
  if(nArts(cu)>0){
    body+=`<div style="margin-bottom:14px"><button class="mover" style="background:#C0392B;padding:6px 14px;font-size:12px" onclick="iniciarMoverCuerpo('${key}')">⬚ Mover CUERPO COMPLETO (todos los artículos)</button></div>`;
  }
  body+=`<div style="margin-bottom:14px"><button class="mover" style="background:${bloqueadas.has(key)?'#5F5E5A':'#888780'};padding:6px 14px;font-size:12px" onclick="toggleBloqueo('${key}');cerrar()">${bloqueadas.has(key)?'🔓 Desbloquear posición':'🔒 Bloquear posición (quitar físicamente)'}</button></div>`;
  // Solo dentro de una sala de simulación: vaciar el slot por completo (no existe en el mapa real).
  if(ESCENARIO_ID && nArts(cu)>0){
    body+=`<div style="margin-bottom:14px"><button class="mover" style="background:#7A2E2E;padding:6px 14px;font-size:12px" onclick="limpiarSlot('${key}')">🧹 Limpiar slot (vaciar esta posición)</button></div>`;
  }
  NIVORDER.forEach(niv=>{
    if(!cu.niveles[niv]||cu.niveles[niv].length===0)return;
    const arts=cu.niveles[niv].slice().sort((a,b)=>b.picks-a.picks);
    const consNivel=arts.reduce((s,a)=>s+a.consumo,0);
    let cbadge="";
    if(niv!=="CUERPO"){
      const col=consNivel>0.90?"#C0392B":(consNivel>0.75?"#D08A1E":"#2E7D83");
      const alerta=consNivel>0.90?" ⚠ excede 0.90":"";
      cbadge=`<span class="badge" style="background:${col}22;color:${col}">consumo ${consNivel.toFixed(2)}${alerta}</span>`;
    }
    body+=`<div class="nivel"><div class="nivel-tit"><span>${niv==="CUERPO"?"CUERPO ENTERO":niv}</span><span style="display:flex;gap:6px">${cbadge}<span class="badge">${arts.length} art</span></span></div>`;
    body+=`<table><tr><th>Artículo</th><th>Consumo nivel</th><th>Rack actual</th><th>Picks</th><th></th></tr>`;
    arts.forEach(a=>{const desde=a.actual==="SIN UBICACIÓN ACTUAL"?`<span class="sinubic">sin ubic.</span>`:a.actual;
      let cc="#2E7D83";if(a.consumo>0.90)cc="#C0392B";else if(a.consumo>0.60)cc="#D08A1E";
      const cbar=Math.min(a.consumo,1)*100;
      const consHtml=`<div style="display:flex;align-items:center;gap:5px"><span style="font-weight:700;color:${cc};min-width:34px">${a.consumo.toFixed(2)}</span>`+
        `<span style="flex:1;height:6px;background:#EEE;border-radius:3px;overflow:hidden;min-width:40px"><span style="display:block;height:100%;width:${cbar}%;background:${cc}"></span></span></div>`;
      body+=`<tr><td class="art"><span class="tt-art" data-tt="${escapeAttr(descripcionDe(a.art))}">${a.art}</span></td><td>${consHtml}</td><td class="desde">${desde}</td><td>${a.picks}</td>`+
            `<td><button class="mover" onclick="iniciarMover('${a.art}','${key}','${niv}')">Mover</button></td></tr>`;});
    body+=`</table></div>`;
  });
  document.getElementById("mbody").innerHTML=body;
  document.getElementById("overlay").classList.add("show");
}
function cerrar(){document.getElementById("overlay").classList.remove("show");}
