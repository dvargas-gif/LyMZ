// Secuencia de arranque, en el mismo orden exacto que tenia el script
// original: primer dibujado sincronico (para que el mapa nunca se vea en
// blanco), y recien despues la carga async del ultimo estado guardado via
// postMessage a React. Debe cargarse SIEMPRE al final -- es el unico
// archivo que llama funciones en vez de solo declararlas.

render();
ajustarEscalaGrid();

// --- AGREGADO PARA PERSISTENCIA: carga del último estado guardado ---
// El mapa siempre arranca y se ve igual aunque esto falle o tarde (ya se
// llamó a render() arriba con los datos base) — esto solo aplica ENCIMA los
// movimientos guardados en Supabase, y vuelve a pintar. No reemplaza el
// primer render(), lo complementa.
try{
  if(window.parent && window.parent!==window){
    window.addEventListener('message', function(ev){
      if(!ev.data || ev.data.type!=='slotting:estadoInicial')return;
      const estado=ev.data.payload||{};
      Object.assign(MAXCOL_POR_PASILLO,estado.maxColumnas||{});
      (estado.posiciones||[]).forEach(p=>aplicarPosicionGuardada(p.articulo,p.pasillo,p.columna,p.nivel,p.clase,p.grupo,p.tipo));
      (estado.eliminados||[]).forEach(e=>eliminarArticuloGuardado(e.articulo));
      (estado.bloqueos||[]).forEach(b=>bloqueadas.add(b.rack_key));
      (estado.descripciones||[]).forEach(d=>{DESCRIPCIONES[d.articulo]=d.descripcion;});
      aplicarConfiguracion(estado.configuracion);
      render();
      ajustarEscalaGrid();
      // Si el usuario ya tenía un rack abierto (clic muy rápido, antes de que
      // llegara esta respuesta), refresca ese modal para que muestre las
      // descripciones recién cargadas. abrir() ya existía; solo se reinvoca.
      if(modalKey && document.getElementById("overlay").classList.contains("show"))abrir(modalKey);
    });
    window.parent.postMessage({type:'slotting:solicitarEstado', payload:{escenarioId:ESCENARIO_ID}}, '*');
  }
}catch(e){}

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
