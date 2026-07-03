// Buscador de articulo dentro del croquis y exportacion a Excel del
// estado actual + la hoja de cambios.

function buscar(){
  const q=document.getElementById("buscar").value.trim().toLowerCase();
  Object.values(cellRefs).forEach(c=>c&&c.classList.remove("hl"));
  const res=document.getElementById("resbuscar");
  if(!q){res.textContent="";return;}
  for(const key in CUERPOS)for(const niv in CUERPOS[key].niveles)for(const a of CUERPOS[key].niveles[niv])
    if(a.art.toLowerCase().includes(q)){cellRefs[key].classList.add("hl");
      cellRefs[key].scrollIntoView({behavior:"smooth",block:"center",inline:"center"});
      const cu=CUERPOS[key];res.innerHTML=`✓ <b>${a.art}</b> → ${cu.pas}-C${String(cu.col).padStart(3,'0')}`;return;}
  res.textContent="No encontrado.";
}
function exportar(){
  const rows=[["Articulo","Ubicacion_nueva","Pasillo","Columna","Nivel","Clase","Tipo","Picks","Consumo","Rack_actual","Niveles_a_armar"]];
  for(const key in CUERPOS){const cu=CUERPOS[key];
    const nivA=nivelesArmar(cu);
    for(const niv in cu.niveles){for(const a of cu.niveles[niv]){
      const col=String(cu.col).padStart(3,'0');
      const ubic=niv==="CUERPO"?`${cu.pas}-C${col}-CUERPO ENTERO (N01-N05)`:`${cu.pas}-C${col}-${niv}-1`;
      rows.push([a.art,ubic,cu.pas,"C"+col,niv,cu.clase,cu.tipo,a.picks,a.consumo,a.actual,nivA]);
    }}}
  const ws=XLSX.utils.aoa_to_sheet(rows);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Slotting");
  // hoja de cambios
  if(cambios.length>0){
    const cr=[["Articulo","DESDE (slot original)","HACIA (editado)"]];
    cambios.forEach(c=>cr.push([c.art,c.desde,c.hacia]));
    const ws2=XLSX.utils.aoa_to_sheet(cr);XLSX.utils.book_append_sheet(wb,ws2,"Cambios");
  }
  XLSX.writeFile(wb,"Slotting_editado.xlsx");
}
