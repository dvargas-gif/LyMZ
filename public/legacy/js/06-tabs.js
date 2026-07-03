// Manejo de las dos pestanas de la vista mapa (Mapa editable / Dashboard
// analitico): mostrar/ocultar, marcar la pestana activa y dibujar los
// graficos del dashboard la primera vez que se abre.

function verVista(v){
  const vm=document.getElementById("vistaMapa"),vd=document.getElementById("vistaDash");
  const tm=document.getElementById("tabMapa"),td=document.getElementById("tabDash");
  if(v==="dash"){
    vm.style.display="none";vd.style.display="block";
    td.style.background="#558B6E";td.style.color="#fff";td.style.fontWeight="600";
    tm.style.background="#EAE6DF";tm.style.color="#4B4A45";tm.style.fontWeight="500";
    if(!dashDibujado){dibujarDash();dashDibujado=true;}
  }else{
    vd.style.display="none";vm.style.display="block";
    tm.style.background="#558B6E";tm.style.color="#fff";tm.style.fontWeight="600";
    td.style.background="#EAE6DF";td.style.color="#4B4A45";td.style.fontWeight="500";
  }
}
function dibujarDash(){
  const M=DASHM;const C={accent:"#3B6E7A",green:"#1D9E75",amber:"#D08A1E",red:"#C0392B",purple:"#7A5282",gray:"#B4B2A9"};
  Chart.defaults.font.family="-apple-system,Inter,sans-serif";Chart.defaults.font.size=11;Chart.defaults.color="#6B7280";
  new Chart(document.getElementById("chPas"),{type:"bar",data:{labels:Object.keys(M.por_pasillo),datasets:[{data:Object.values(M.por_pasillo),backgroundColor:C.accent,borderRadius:6}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:"#F0F0F0"}},x:{grid:{display:false}}},maintainAspectRatio:false}});
  const zc={A:C.accent,B:C.red,C:C.purple,D:C.amber};
  new Chart(document.getElementById("chZon"),{type:"doughnut",data:{labels:Object.keys(M.por_clase),datasets:[{data:Object.values(M.por_clase),backgroundColor:Object.keys(M.por_clase).map(k=>zc[k]||C.gray),borderWidth:0}]},options:{cutout:"62%",plugins:{legend:{position:"right"}},maintainAspectRatio:false}});
  const tb=document.getElementById("tbErr");
  M.sobrecarga_detalle.forEach(e=>{const cuerpo=e.cuerpo.replace("|","-C");tb.innerHTML+=`<tr><td><span class="dsev medio"></span></td><td>Sobrecarga nivel</td><td>${cuerpo} · ${e.nivel}</td><td>consumo ${e.consumo} (${e.arts} art)</td></tr>`;});
  if(M.sobrecarga_detalle.length===0)tb.innerHTML=`<tr><td colspan="4" style="text-align:center;color:#9A9684;padding:18px">Sin sobrecargas</td></tr>`;
  tb.innerHTML+=`<tr><td><span class="dsev alto"></span></td><td>Sin ubicación actual</td><td>—</td><td>${M.errores.sin_ubicacion_actual} artículos a localizar</td></tr>`;
  const heat=document.getElementById("dheat");const vals=Object.values(M.por_pasillo);const mx=Math.max(...vals);
  Object.entries(M.por_pasillo).forEach(([p,v])=>{const t=v/mx;const col=t>0.66?C.red:t>0.33?C.amber:C.green;heat.innerHTML+=`<div class="dhc" style="background:${col}"><div><div style="font-size:11px;font-weight:600">${p}</div><div style="opacity:.85;font-size:10px">${v}</div></div></div>`;});
  const al=document.getElementById("dalertas");const A=[];
  if(M.errores.sin_ubicacion_actual>100)A.push(["alto","ti-map-pin-off",`${M.errores.sin_ubicacion_actual} artículos sin ubicación actual — requieren localización`]);
  if(M.errores.sobrecarga_nivel>0)A.push(["medio","ti-stack-2",`${M.errores.sobrecarga_nivel} niveles con sobrecarga (consumo > 0.90)`]);
  if(M.por_pasillo.MZ07<100)A.push(["bajo","ti-building-warehouse",`Pasillo MZ07 con baja ocupación (${M.por_pasillo.MZ07} art) — posible zona sin actividad`]);
  A.push(["bajo","ti-database","Alertas de usuarios/tiempo se activan al conectar el historial"]);
  A.forEach(([s,ic,t])=>al.innerHTML+=`<div class="dalerta ${s}"><i class="ti ${ic}"></i><span>${t}</span></div>`);
}
