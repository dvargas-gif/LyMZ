// Secuencia de arranque. Debe cargarse SIEMPRE al final -- es el unico
// archivo que llama funciones en vez de solo declararlas.
//
// BUGFIX (salto visible al abrir): antes se dibujaba la base sincrónica
// primero (para no verse en blanco) y, un instante después, se
// sobreescribía con las posiciones guardadas -- eso es justo el "salto" que
// se veía. Ahora, si el mapa está embebido en React, NO se pinta nada hasta
// tener el estado real: se muestra un mensaje de carga breve en su lugar.
// Si el mapa se abre standalone (fuera del iframe, sin window.parent), no
// hay estado que esperar -- se sigue pintando la base al toque, como antes.
try{
  if(window.parent && window.parent!==window){
    const contenedorGrid=grid.parentNode;
    const cargando=document.createElement('div');
    cargando.id='cargandoMapa';
    cargando.textContent='Cargando mapa…';
    cargando.style.cssText='padding:60px 20px;width:100%;text-align:center;color:#9A9684;font-size:13px';
    contenedorGrid.insertBefore(cargando,grid);

    let yaLlego=false;
    function quitarCargando(){
      if(yaLlego)return;
      yaLlego=true;
      const el=document.getElementById('cargandoMapa');
      if(el)el.remove();
    }
    // Red lenta o el mensaje nunca llega: no se queda "Cargando…" para
    // siempre -- a los 4s pinta la base, igual que el comportamiento viejo.
    const timeoutSinRespuesta=setTimeout(function(){
      quitarCargando();
      render();
      ajustarEscalaGrid();
    },4000);

    window.addEventListener('message', function(ev){
      if(!ev.data || ev.data.type!=='slotting:estadoInicial')return;
      clearTimeout(timeoutSinRespuesta);
      const estado=ev.data.payload||{};
      Object.assign(MAXCOL_POR_PASILLO,estado.maxColumnas||{});
      (estado.posiciones||[]).forEach(p=>aplicarPosicionGuardada(p.articulo,p.pasillo,p.columna,p.nivel,p.clase,p.grupo,p.tipo));
      (estado.eliminados||[]).forEach(e=>eliminarArticuloGuardado(e.articulo));
      (estado.bloqueos||[]).forEach(b=>bloqueadas.add(b.rack_key));
      (estado.descripciones||[]).forEach(d=>{DESCRIPCIONES[d.articulo]=d.descripcion;});
      quitarCargando();
      aplicarConfiguracion(estado.configuracion);
      render();
      ajustarEscalaGrid();
      // Si el usuario ya tenía un rack abierto (clic muy rápido, antes de que
      // llegara esta respuesta), refresca ese modal para que muestre las
      // descripciones recién cargadas. abrir() ya existía; solo se reinvoca.
      if(modalKey && document.getElementById("overlay").classList.contains("show"))abrir(modalKey);
    });
    window.parent.postMessage({type:'slotting:solicitarEstado', payload:{escenarioId:ESCENARIO_ID}}, '*');
  }else{
    render();
    ajustarEscalaGrid();
  }
}catch(e){
  render();
  ajustarEscalaGrid();
}

// --- AGREGADO: comandos remotos desde la barra de acciones de React (SOLO
// dentro de una sala). No reemplaza el listener de estadoInicial de arriba,
// es uno nuevo aparte; cada acción llama a una función que YA existe.
window.addEventListener('message', function(ev){
  if(!ev.data || ev.data.type!=='slotting:comando' || !ESCENARIO_ID)return;
  const accion=ev.data.payload?.accion;
  if(accion==='activarModoBloqueo')toggleModoBloqueo();
  else if(accion==='activarModoSeleccion')toggleModoSeleccionArea();
  else if(accion==='limpiarSeleccion')limpiarAreaSeleccionada();
});

// Avisa si un movimiento (click, modal o arrastre por pulsación larga) no
// se pudo guardar en Supabase — el dibujo ya se movió (optimista, como
// siempre), esto solo informa que hay que reintentar.
window.addEventListener('message', function(ev){
  if(!ev.data || ev.data.type!=='slotting:errorGuardado')return;
  alert(`⚠ No se pudo guardar el movimiento de "${ev.data.payload?.articulo||''}". Revisá tu conexión e intentá moverlo de nuevo.`);
});
