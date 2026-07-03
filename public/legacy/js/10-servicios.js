// Puente de comunicacion con React via postMessage: avisar cada
// movimiento/bloqueo/eliminacion al padre (que es quien habla con
// Supabase), y reconstruir en CUERPOS lo que ya estaba guardado.

// --- AGREGADO PARA PERSISTENCIA (Supabase, vía el padre) ---
// No cambia la lógica de mover/deshacer/render: son notificaciones adicionales
// que se disparan DESPUÉS de que confirmar()/soltarCuerpoEn()/deshacer() ya
// aplicaron el cambio sobre CUERPOS, igual que ya hacía logMov() con auditoría.
function notificarPosicion(art,pas,col,niv,clase,grupo,tipo){
  try{
    if(window.parent && window.parent!==window){
      window.parent.postMessage({type:'slotting:posicion',payload:{articulo:art,pasillo:pas,columna:col,nivel:niv,clase,grupo,tipo,escenarioId:ESCENARIO_ID}}, '*');
    }
  }catch(e){}
}
// Igual que notificarPosicion, pero además deja constancia en la auditoría
// (estado "Deshecho") sin tocar el registro visual del terminal — deshacer()
// nunca escribió ahí y esto no cambia eso.
function notificarDeshecho(art,desde,hacia){
  try{
    if(window.parent && window.parent!==window){
      window.parent.postMessage({type:'slotting:deshecho',payload:{articulo:art,desde,hacia,escenarioId:ESCENARIO_ID}}, '*');
    }
  }catch(e){}
}
// Reconstruye en CUERPOS (el estado base ya cargado) la posición guardada de
// un artículo. Usa el mismo patrón de "buscar, sacar, insertar" que ya usa
// confirmar() — pero es una función NUEVA, no reemplaza ni toca confirmar().
function aplicarPosicionGuardada(art,pas,col,niv,clase,grupo,tipo){
  let articuloObj=null;
  for(const key in CUERPOS){
    const cu=CUERPOS[key];
    for(const n in cu.niveles){
      const idx=cu.niveles[n].findIndex(a=>a.art===art);
      if(idx>=0){
        articuloObj=cu.niveles[n].splice(idx,1)[0];
        if(cu.niveles[n].length===0)delete cu.niveles[n];
        // si el rack de origen quedó sin ningún artículo, se borra del todo
        // (mismo criterio que ya usa deshacer() al reconstruir estado)
        if(nArts(cu)===0)delete CUERPOS[key];
        break;
      }
    }
    if(articuloObj)break;
  }
  if(!articuloObj)return;
  const destKey=pas+"|"+col;
  if(!CUERPOS[destKey])CUERPOS[destKey]={pas,col:parseInt(col),clase:clase||"-",grupo:grupo||"-",tipo:tipo||(niv==="CUERPO"?"CUERPO":"NORMAL"),niveles:{}};
  const cuD=CUERPOS[destKey];
  cuD.niveles[niv]=cuD.niveles[niv]||[];
  cuD.niveles[niv].push(articuloObj);
}
// Notifica un bloqueo/desbloqueo de posición — toggleBloqueo() ya existía,
// esto solo se agrega al final, no cambia si bloquea o desbloquea.
function notificarBloqueo(key,bloqueada){
  try{
    if(window.parent && window.parent!==window){
      const [pas,col]=key.split("|");
      window.parent.postMessage({type:'slotting:bloqueo',payload:{key,pasillo:pas,columna:parseInt(col),bloqueada,escenarioId:ESCENARIO_ID}}, '*');
    }
  }catch(e){}
}
// Notifica que un artículo se borró por completo (solo pasa dentro de una
// sala, vía limpiarSlot). El mapa real nunca envía esto.
function notificarEliminado(art){
  try{
    if(window.parent && window.parent!==window){
      window.parent.postMessage({type:'slotting:limpiarArticulo',payload:{articulo:art,escenarioId:ESCENARIO_ID}}, '*');
    }
  }catch(e){}
}
// Reconstruye, al cargar una sala, que un artículo fue borrado ahí:
// lo busca y lo saca de CUERPOS sin volver a ponerlo en ningún lado
// (a diferencia de aplicarPosicionGuardada, que sí lo reubica).
function eliminarArticuloGuardado(art){
  for(const key in CUERPOS){
    const cu=CUERPOS[key];
    for(const n in cu.niveles){
      const idx=cu.niveles[n].findIndex(a=>a.art===art);
      if(idx>=0){
        cu.niveles[n].splice(idx,1);
        if(cu.niveles[n].length===0)delete cu.niveles[n];
        if(nArts(cu)===0)delete CUERPOS[key];
        return;
      }
    }
  }
}
