// Funciones puras de calculo (color segun intensidad, niveles a armar,
// consumo, llenura, fecha/hora, descripcion de un articulo). No tocan el
// DOM ni el estado global -- reciben datos y devuelven un valor.

function intensidad(cl,arts){const base=ZCOL[cl]||"#888";const max=20;const t=Math.sqrt(Math.min(arts,max)/max);
  const a=[0xEC,0xF0,0xEE];const b=[parseInt(base.slice(1,3),16),parseInt(base.slice(3,5),16),parseInt(base.slice(5,7),16)];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;}
function nArts(cu){return Object.values(cu.niveles).reduce((s,a)=>s+a.length,0);}
function nivelesArmar(cu){
  if(cu.niveles["CUERPO"])return 1;
  return Object.keys(cu.niveles).filter(n=>cu.niveles[n].length>0).length;
}
function consumoTotal(cu){return Object.values(cu.niveles).reduce((s,lst)=>s+lst.reduce((x,a)=>x+a.consumo,0),0);}
function llenura(cu){
  // capacidad útil = 5 niveles × 0.90 = 4.5. Cuerpo entero = espacio único (su consumo sobre 4.5 igual sirve de referencia)
  return Math.min(consumoTotal(cu)/4.5,1.2);
}
function colorLlenura(p){ // p en 0..1
  if(p>1.0)return"#C0392B"; if(p>0.85)return"#D08A1E"; if(p>0.4)return"#2E7D83"; return"#7FB069";
}
function ahoraStr(){
  const d=new Date();
  const p=n=>String(n).padStart(2,"0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function descripcionDe(art){ return DESCRIPCIONES[art] || "Sin descripción disponible"; }
function escapeAttr(s){ return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;"); }
