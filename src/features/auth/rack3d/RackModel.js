import * as THREE from 'three';

/**
 * Geometría/materiales del rack decorativo del Login -- todo primitivas de
 * three.js (Box/Cylinder), sin assets externos (restricción explícita del
 * usuario). 5 niveles porque el sistema tiene 5 capacidades, aunque la foto
 * de referencia mostraba 4.
 */
export const CANTIDAD_NIVELES = 5;

const ANCHO = 2.2;
const PROFUNDIDAD = 0.9;
const ALTO = 3.4;
const GROSOR_PERFIL = 0.07;
const ALTURA_PATA = 0.08;
const ESPESOR_ESTANTE = 0.035;
const MARGEN_INFERIOR = 0.35;
const MARGEN_SUPERIOR = 0.15;

export const DIMENSIONES = { ANCHO, PROFUNDIDAD, ALTO };

// Gris perla casi blanco (pedido explícito: "NO gris oscuro industrial").
const COLOR_ESTRUCTURA = 0xe9e8e3;
const COLOR_AGUJERO = 0x2b2b28;
// Tonos kraft para las cajas de cartón (pedido explícito, referencia visual:
// caja real con cinta + etiqueta, no bloques de color liso).
const TONOS_KRAFT = ['#c8974f', '#d3a562', '#b98f52'];

/** Altura (Y, relativa al grupo) del estante `nivel` (0 a CANTIDAD_NIVELES-1). */
export function obtenerAlturaNivel(nivel) {
  const paso = (ALTO - MARGEN_INFERIOR - MARGEN_SUPERIOR) / (CANTIDAD_NIVELES - 1);
  return MARGEN_INFERIOR + paso * nivel;
}

function crearMaterialEstructura() {
  // roughness/metalness del rango pedido: "acero pintado, leve
  // especularidad, sin ser espejo".
  // fog:false -- la niebla de la escena (ver Rack3DEscena.jsx) es para que
  // el piso se desvanezca en el horizonte, no para apagar el rack en sí.
  return new THREE.MeshStandardMaterial({ color: COLOR_ESTRUCTURA, roughness: 0.6, metalness: 0.15, fog: false });
}

function crearPerfiles(grupo, material) {
  const geometria = new THREE.BoxGeometry(GROSOR_PERFIL, ALTO, GROSOR_PERFIL);
  const posiciones = [
    [-ANCHO / 2, ALTO / 2, -PROFUNDIDAD / 2],
    [ANCHO / 2, ALTO / 2, -PROFUNDIDAD / 2],
    [-ANCHO / 2, ALTO / 2, PROFUNDIDAD / 2],
    [ANCHO / 2, ALTO / 2, PROFUNDIDAD / 2],
  ];
  for (const [x, y, z] of posiciones) {
    const perfil = new THREE.Mesh(geometria, material);
    perfil.position.set(x, y, z);
    perfil.castShadow = true;
    grupo.add(perfil);
  }
  return posiciones;
}

// Agujeros reales (no normal map): aunque ya no rota solo, el usuario puede
// arrastrarlo a cualquier ángulo y una textura pierde credibilidad en
// ángulos rasantes. InstancedMesh mantiene esto en una sola llamada de
// dibujo sin importar cuántos agujeros haya.
function crearAgujeros(grupo, posicionesPerfiles) {
  const espaciado = 0.16;
  const margen = 0.12;
  const cantidadPorPerfil = Math.floor((ALTO - margen * 2) / espaciado);
  const total = cantidadPorPerfil * posicionesPerfiles.length;

  const geometria = new THREE.CylinderGeometry(0.018, 0.018, GROSOR_PERFIL * 1.4, 8);
  geometria.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: COLOR_AGUJERO, roughness: 0.8, metalness: 0, fog: false });

  const instancia = new THREE.InstancedMesh(geometria, material, total);
  const matriz = new THREE.Matrix4();
  let indice = 0;
  for (const [x, , z] of posicionesPerfiles) {
    for (let i = 0; i < cantidadPorPerfil; i++) {
      matriz.makeTranslation(x, margen + i * espaciado, z);
      instancia.setMatrixAt(indice, matriz);
      indice++;
    }
  }
  instancia.instanceMatrix.needsUpdate = true;
  grupo.add(instancia);
}

function crearCruzLateral(grupo, material, xLado) {
  const dy = ALTO - 0.2;
  const dz = PROFUNDIDAD;
  const largo = Math.sqrt(dy * dy + dz * dz);
  const angulo = Math.atan2(dz, dy);
  const geometria = new THREE.BoxGeometry(0.035, largo, 0.035);

  const diagonal1 = new THREE.Mesh(geometria, material);
  diagonal1.position.set(xLado, ALTO / 2, 0);
  diagonal1.rotation.x = angulo;
  grupo.add(diagonal1);

  const diagonal2 = new THREE.Mesh(geometria, material);
  diagonal2.position.set(xLado, ALTO / 2, 0);
  diagonal2.rotation.x = -angulo;
  grupo.add(diagonal2);
}

function crearEstantes(grupo, material) {
  const anchoEstante = ANCHO + GROSOR_PERFIL * 0.6;
  const profundidadEstante = PROFUNDIDAD + GROSOR_PERFIL * 0.6;
  const geometria = new THREE.BoxGeometry(anchoEstante, ESPESOR_ESTANTE, profundidadEstante);

  for (let nivel = 0; nivel < CANTIDAD_NIVELES; nivel++) {
    const estante = new THREE.Mesh(geometria, material);
    estante.position.set(0, obtenerAlturaNivel(nivel), 0);
    estante.castShadow = true;
    estante.receiveShadow = true;
    // Tag para el raycasting de Rack3DEscena.jsx -- click en este mesh ==
    // click en este nivel.
    estante.userData.nivel = nivel;
    grupo.add(estante);
  }
}

function crearPatas(grupo, material, posicionesPerfiles) {
  const geometria = new THREE.CylinderGeometry(0.09, 0.09, ALTURA_PATA, 12);
  for (const [x, , z] of posicionesPerfiles) {
    const pata = new THREE.Mesh(geometria, material);
    pata.position.set(x, ALTURA_PATA / 2, z);
    grupo.add(pata);
  }
}

// Fibra sutil de cartón -- ruido fino tramado en líneas horizontales, para
// que no se lea "plástico liso" (pedido explícito: cajas "más pulidas",
// como las fotos de referencia). Se dibuja primero, todo lo demás va encima.
function pintarFibraCarton(ctx, tam) {
  for (let y = 0; y < tam; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(0, y, tam, 1);
  }
}

function pintarCinta(ctx, tam, y0, alto) {
  ctx.fillStyle = 'rgba(80, 56, 24, .55)';
  ctx.fillRect(0, y0, tam, alto);
  // Brillo angosto centrado en la cinta -- el detalle que más "vende"
  // plástico/cinta real en vez de una franja plana.
  ctx.fillStyle = 'rgba(255, 255, 255, .16)';
  ctx.fillRect(0, y0 + alto * 0.28, tam, alto * 0.16);
  ctx.fillStyle = 'rgba(0, 0, 0, .12)';
  ctx.fillRect(0, y0 + alto - 2, tam, 2);
}

// Textura de "cinta + etiqueta + código de barras" para la cara frontal de
// una caja de cartón (pedido explícito, referencia visual real) -- canvas 2D
// generado en runtime, no es un asset externo (misma técnica que la textura
// del piso). Resolución 512 (antes 256) para que la etiqueta/código de
// barras no se vean borrosos de cerca (zoom de cámara).
function crearTexturaCajaFrente(colorBase) {
  const tam = 512;
  const canvas = document.createElement('canvas');
  canvas.width = tam;
  canvas.height = tam;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colorBase;
  ctx.fillRect(0, 0, tam, tam);
  pintarFibraCarton(ctx, tam);

  // Costura vertical central (donde se solapa el cartón al armar la caja).
  ctx.fillStyle = 'rgba(0, 0, 0, .1)';
  ctx.fillRect(tam * 0.5 - 1, 0, 2, tam);

  pintarCinta(ctx, tam, 0, tam * 0.07);

  // Etiqueta blanca con borde, dos líneas de "texto" y código de barras.
  const etiquetaX = tam * 0.16, etiquetaY = tam * 0.54, etiquetaAncho = tam * 0.52, etiquetaAlto = tam * 0.3;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(etiquetaX + 3, etiquetaY + 4, etiquetaAncho, etiquetaAlto);
  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(etiquetaX, etiquetaY, etiquetaAncho, etiquetaAlto);
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(etiquetaX, etiquetaY, etiquetaAncho, etiquetaAlto);

  ctx.fillStyle = 'rgba(40,40,36,.55)';
  ctx.fillRect(etiquetaX + etiquetaAncho * 0.08, etiquetaY + etiquetaAlto * 0.14, etiquetaAncho * 0.7, etiquetaAlto * 0.09);
  ctx.fillRect(etiquetaX + etiquetaAncho * 0.08, etiquetaY + etiquetaAlto * 0.3, etiquetaAncho * 0.45, etiquetaAlto * 0.09);

  ctx.fillStyle = '#201f1c';
  let x = etiquetaX + etiquetaAncho * 0.08;
  const limite = etiquetaX + etiquetaAncho * 0.92;
  const yBarra = etiquetaY + etiquetaAlto * 0.52;
  const altoBarra = etiquetaAlto * 0.4;
  while (x < limite) {
    const anchoBarra = (2 + Math.random() * 4) * (tam / 256);
    ctx.fillRect(x, yBarra, anchoBarra, altoBarra);
    x += anchoBarra + (1 + Math.random() * 2.5) * (tam / 256);
  }

  return new THREE.CanvasTexture(canvas);
}

// Textura de la tapa (cinta cruzando el centro) -- misma técnica, misma
// resolución que la cara frontal.
function crearTexturaCajaSuperior(colorBase) {
  const tam = 512;
  const canvas = document.createElement('canvas');
  canvas.width = tam;
  canvas.height = tam;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colorBase;
  ctx.fillRect(0, 0, tam, tam);
  pintarFibraCarton(ctx, tam);
  pintarCinta(ctx, tam, tam * 0.42, tam * 0.16);
  return new THREE.CanvasTexture(canvas);
}

// Una caja de cartón con tapa articulada (pedido explícito: "que las cajas
// se abran cuando las toquen"). Estructura: grupo -> cuerpo (fijo) + pivote
// (en el borde trasero-superior) -> tapa (gira alrededor del pivote). El
// pivote es lo que anima Rack3DEscena.jsx al clickear la caja.
function crearCajaCarton(ancho, alto, profundidad, colorBase) {
  const grupo = new THREE.Group();
  const espesorTapa = Math.min(0.045, alto * 0.18);

  const materialLateral = new THREE.MeshStandardMaterial({ color: colorBase, roughness: 0.9, metalness: 0, fog: false });
  const materialFrente = new THREE.MeshStandardMaterial({ map: crearTexturaCajaFrente(colorBase), roughness: 0.85, metalness: 0, fog: false });
  const materialSuperior = new THREE.MeshStandardMaterial({ map: crearTexturaCajaSuperior(colorBase), roughness: 0.85, metalness: 0, fog: false });

  const altoCuerpo = alto - espesorTapa;
  const cuerpo = new THREE.Mesh(
    new THREE.BoxGeometry(ancho, altoCuerpo, profundidad),
    // Orden de caras de BoxGeometry: +x,-x,+y,-y,+z,-z (derecha,izq,arriba,abajo,frente,atrás).
    [materialLateral, materialLateral, materialLateral, materialLateral, materialFrente, materialLateral],
  );
  cuerpo.position.set(0, altoCuerpo / 2, 0);
  cuerpo.castShadow = true;
  cuerpo.receiveShadow = true;
  grupo.add(cuerpo);

  const pivote = new THREE.Group();
  pivote.position.set(0, altoCuerpo, -profundidad / 2);
  const tapa = new THREE.Mesh(new THREE.BoxGeometry(ancho, espesorTapa, profundidad), materialSuperior);
  tapa.position.set(0, espesorTapa / 2, profundidad / 2);
  tapa.castShadow = true;
  pivote.add(tapa);
  grupo.add(pivote);

  return { grupo, pivote, cuerpo, tapa };
}

function crearBin(ancho, alto, profundidad, color) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, fog: false });
  const bin = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, profundidad), material);
  bin.castShadow = true;
  bin.receiveShadow = true;
  return bin;
}

function crearPallet(ancho, profundidad, color) {
  const alto = 0.1;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, fog: false });
  const pallet = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, profundidad), material);
  pallet.castShadow = true;
  pallet.receiveShadow = true;
  return { mesh: pallet, alto };
}

// Indicador LED (pedido explícito: "que los niveles se sientan vivos") --
// esfera emissive chica, sin luz real asociada (emissive ya la hace leer
// como encendida, sin gastar otro PointLight).
function crearIndicadorLed(color) {
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0, fog: false });
  return new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), material);
}

// Mercadería mixta (pedido explícito: "que los niveles se sientan vivos, no
// solo cajas" -- cajas de cartón, bins azules, totes amarillas, un pallet
// verde, un indicador LED, y un nivel deliberadamente vacío). Solo las cajas
// de cartón son interactivas (abren con click); bins/totes/pallet/LED son
// decorativos. Devuelve la lista de cajas {pivote, cuerpo} para que
// Rack3DEscena.jsx detecte el click y anime la tapa de cada una.
function crearMercaderia(grupo) {
  const disposiciones = [
    { nivel: 0, items: [
      { tipo: 'caja', dx: -0.55, dz: 0.02, ancho: 0.5, alto: 0.4, profundidad: 0.5 },
      { tipo: 'caja', dx: 0.1, dz: -0.05, ancho: 0.45, alto: 0.35, profundidad: 0.45 },
    ] },
    { nivel: 1, items: [
      { tipo: 'bin', dx: -0.35, dz: -0.02, ancho: 0.36, alto: 0.28, profundidad: 0.36, color: 0x2f6fb0 },
      { tipo: 'bin', dx: 0.15, dz: 0.03, ancho: 0.34, alto: 0.26, profundidad: 0.34, color: 0x3a7dc2 },
    ] },
    // nivel 2 -- deliberadamente vacío (pedido explícito: "una ubicación
    // vacía"), también es el destino de la animación de transferencia.
    { nivel: 3, items: [
      { tipo: 'caja', dx: -0.35, dz: 0.05, ancho: 0.4, alto: 0.35, profundidad: 0.4 },
      { tipo: 'tote', dx: 0.4, dz: -0.02, ancho: 0.35, alto: 0.3, profundidad: 0.35, color: 0xd0a52e },
    ] },
    { nivel: 4, items: [
      { tipo: 'pallet', dx: 0, dz: 0, ancho: 1.6, profundidad: 0.72, color: 0x4a8f5c },
      { tipo: 'led', dx: 0.85, dz: 0.32, color: 0x3fbf7f },
    ] },
  ];

  const cajas = [];
  let contadorCaja = 0;
  for (const { nivel, items } of disposiciones) {
    const yEstante = obtenerAlturaNivel(nivel) + ESPESOR_ESTANTE / 2;
    for (const item of items) {
      if (item.tipo === 'caja' || item.tipo === 'tote') {
        // Las totes usan la misma construcción articulada que las cajas de
        // cartón (mismo material, tapa incluida) -- el pedido solo distingue
        // el tono, no una geometría distinta.
        const colorBase = item.tipo === 'tote' ? item.color : TONOS_KRAFT[contadorCaja % TONOS_KRAFT.length];
        const { grupo: grupoCaja, pivote, cuerpo, tapa } = crearCajaCarton(item.ancho, item.alto, item.profundidad, colorBase);
        grupoCaja.position.set(item.dx, yEstante, item.dz);
        cuerpo.userData.indiceCaja = contadorCaja;
        tapa.userData.indiceCaja = contadorCaja;
        grupo.add(grupoCaja);
        cajas.push({ pivote, cuerpo });
        contadorCaja++;
      } else if (item.tipo === 'bin') {
        const bin = crearBin(item.ancho, item.alto, item.profundidad, item.color);
        bin.position.set(item.dx, yEstante + item.alto / 2, item.dz);
        grupo.add(bin);
      } else if (item.tipo === 'pallet') {
        const { mesh, alto } = crearPallet(item.ancho, item.profundidad, item.color);
        mesh.position.set(item.dx, yEstante + alto / 2, item.dz);
        grupo.add(mesh);
      } else if (item.tipo === 'led') {
        const led = crearIndicadorLed(item.color);
        led.position.set(item.dx, yEstante + 0.06, item.dz);
        grupo.add(led);
      }
    }
  }
  return cajas;
}

/** Agrega un ancla invisible (sin geometría, no interfiere con el raycasting de niveles) como hijo del grupo -- rota/se mueve junto con el rack para que Rack3DEscena.jsx pueda proyectar su posición en pantalla. */
export function agregarAncla(grupo, x, y, z) {
  const ancla = new THREE.Object3D();
  ancla.position.set(x, y, z);
  grupo.add(ancla);
  return ancla;
}

/**
 * Arma el grupo completo del rack, listo para agregar a una THREE.Scene.
 * Devuelve también `cajas` (una por mercadería: {pivote, cuerpo}) para que
 * Rack3DEscena.jsx detecte el click (`cuerpo.userData.indiceCaja`) y anime
 * la tapa (`pivote.rotation`) al abrir/cerrar cada una.
 */
export function crearRack() {
  const grupo = new THREE.Group();
  const material = crearMaterialEstructura();

  const posicionesPerfiles = crearPerfiles(grupo, material);
  crearAgujeros(grupo, posicionesPerfiles);
  crearCruzLateral(grupo, material, -ANCHO / 2);
  crearCruzLateral(grupo, material, ANCHO / 2);
  crearEstantes(grupo, material);
  crearPatas(grupo, material, posicionesPerfiles);
  const cajas = crearMercaderia(grupo);

  grupo.position.y = ALTURA_PATA;
  return { grupo, cajas };
}

/** Libera toda geometría/material/textura del grupo -- higiene de GPU (ver MASTER-PROMPT.md, Fase 4). */
export function disposeRack(grupo) {
  grupo.traverse(objeto => {
    if (objeto.geometry) objeto.geometry.dispose();
    if (objeto.material) {
      const materiales = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
      materiales.forEach(m => { m.map?.dispose(); m.dispose(); });
    }
  });
}
