// Lectura de la URL (?escenario=, ?rol=) que define si este mapa es el
// real o una sala de simulacion, y si el usuario es Administrador. Corre
// una sola vez, apenas carga la pagina.

// --- AGREGADO PARA SALAS DE SIMULACIÓN ---
// Si la URL trae ?escenario=<id>, este mapa es una "sala": todo lo que se
// guarda va a una copia aislada (escenario_posiciones), nunca al mapa real
// (posiciones_actuales). Nada de esto cambia cómo funciona el mapa cuando
// NO hay escenario en la URL (mapa real, comportamiento de siempre).
const _qs=new URLSearchParams(location.search);
const ESCENARIO_ID=_qs.get('escenario')?parseInt(_qs.get('escenario')):null;
const ESCENARIO_NOMBRE=_qs.get('nombre')||'';
if(ESCENARIO_ID){
  const b=document.getElementById('bannerSala');
  b.style.display='block';
  b.textContent='🧪 SALA DE SIMULACIÓN — "'+ESCENARIO_NOMBRE+'" — Los cambios acá NO afectan el mapa real.';
  document.body.classList.add('modo-simulacion');
}
// --- FIN AGREGADO PARA SALAS ---

// --- AGREGADO: "Añadir rack" — el botón solo se ve si es Administrador Y
// NO estamos dentro de una sala (extender la geometría del mapa es un
// cambio de la estructura FÍSICA real, no algo que tenga sentido simular).
// El nombre real de la sesión llega por ?rol=... (ver SlottingFrame.jsx);
// esto es solo la visibilidad del botón — la seguridad real la hace RLS en
// Supabase (la tabla pasillos_config solo acepta escritura de Administrador).
const ROL_USUARIO=_qs.get('rol')||'';
if(ROL_USUARIO==='Administrador' && !ESCENARIO_ID){
  const btnAddRack=document.getElementById('btnAddRack');
  if(btnAddRack)btnAddRack.style.display='inline-flex';
}
