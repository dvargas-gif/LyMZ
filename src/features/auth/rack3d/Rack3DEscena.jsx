import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { crearRack, disposeRack, agregarAncla, DIMENSIONES, obtenerAlturaNivel, CANTIDAD_NIVELES } from './RackModel.js';
import { CAPACIDADES_NIVEL } from './capacidadesNivel.js';
import { INFO_MERCADERIA } from './infoMercaderia.js';

// Puntos de anclaje de las 3 "islas de información" -- posiciones fijas
// sobre el rack (rotan/se mueven con él), en coordenadas locales del grupo.
// El contenido (ícono/etiqueta/descripción) lo pasa Login.jsx vía
// `puntosInfo`; acá solo vive la geometría (a qué parte del rack apunta
// cada id).
const ANCLAS_POR_ID = {
  slotting: { x: -DIMENSIONES.ANCHO * 0.32, y: obtenerAlturaNivel(1) + 0.16, z: DIMENSIONES.PROFUNDIDAD * 0.5 },
  trazabilidad: { x: DIMENSIONES.ANCHO / 2, y: DIMENSIONES.ALTO * 0.62, z: DIMENSIONES.PROFUNDIDAD / 2 },
  inventario: { x: DIMENSIONES.ANCHO * 0.28, y: obtenerAlturaNivel(3) + 0.16, z: DIMENSIONES.PROFUNDIDAD * 0.5 },
};

// Badges por nivel (pedido explícito, referencia visual) -- uno un poco a
// la izquierda del rack (donde flota el número) y su ancla en el borde real
// del estante (donde nace la línea conectora). Etiqueta = el nombre corto de
// la capacidad de ese nivel (Auditoría/Buffer/Migración/Trazabilidad/
// Slotting) -- se probó un formato tipo coordenada ("A-01-0X") antes, pero
// reportado en vivo que la funcionalidad comunica más que un código
// arbitrario para el tema de la presentación.
const NIVELES_BADGE = Array.from({ length: CANTIDAD_NIVELES }, (_, nivel) => ({
  nivel,
  etiqueta: CAPACIDADES_NIVEL[nivel]?.corto ?? `Nivel ${nivel + 1}`,
  badge: { x: -DIMENSIONES.ANCHO / 2 - 0.6, y: obtenerAlturaNivel(nivel), z: DIMENSIONES.PROFUNDIDAD / 2 },
  borde: { x: -DIMENSIONES.ANCHO / 2, y: obtenerAlturaNivel(nivel), z: DIMENSIONES.PROFUNDIDAD / 2 },
}));

// Ángulo 3/4 fijo de arranque (antes había 3 botones para cambiar de vista;
// pedido explícito: "quitá el apartado de abajo que hacía que el rack se
// moviera para un lado u otro" -- se retiró el selector, el rack solo se
// reorienta con el drag).
const ROTACION_INICIAL = -0.45;

// Corrimiento en Y (arriba) -- ver nota histórica: el choque real era
// vertical (badge de niveles altos vs. título/subtítulo), no horizontal.
// Corrimiento en X (pedido explícito, esta vez acompañado de la columna de
// texto angosta en Login.jsx -- .login-visual__bloque-superior/-inferior
// ahora tienen max-width, así que hay una zona de texto real a la
// izquierda y el rack puede vivir del todo a la derecha sin competir).
const CAMARA_POS_DEFECTO = new THREE.Vector3(-1.5, 2.15, 9.5);
const CAMARA_MIRA_DEFECTO = new THREE.Vector3(-1.5, 2.05, 0);
const DESPLAZAMIENTO_ZOOM = new THREE.Vector3(0, 0.15, 1.8); // "cámara" cerca del punto al hacer zoom
const DURACION_ZOOM_MS = 700;

// Transferencia RCL -> MZ (pedido explícito: "inventame algo genial ahí") --
// una caja viaja periódicamente desde afuera del rack (RCL) hasta un
// estante vacío (MZ), se queda un momento y se desvanece. Fases en ms sobre
// el mismo timeline, medidas desde que arranca cada ciclo.
const NIVEL_TRANSFERENCIA = 2; // estante sin mercadería estática (ver RackModel.js)
const TRANSFERENCIA_VIAJE_MS = 1200;
const TRANSFERENCIA_PAUSA_MS = 900;
const TRANSFERENCIA_DESVANECE_MS = 500;
const TRANSFERENCIA_TOTAL_MS = TRANSFERENCIA_VIAJE_MS + TRANSFERENCIA_PAUSA_MS + TRANSFERENCIA_DESVANECE_MS;
const INTERVALO_TRANSFERENCIA_MS = 9000;
const DURACION_DESTELLO_MS = 700;

// Fricción de la inercia al soltar el drag -- cuánto conserva la velocidad
// angular por segundo (0.02 = frena casi del todo en ~0.5s, "que desacelere
// solo" en vez de parar en seco).
const FRICCION_INERCIA = 0.02;
const VELOCIDAD_INERCIA_MAX = 6; // rad/s, tope para que un flick brusco no dispare un giro descontrolado

// Tapa de caja al abrir (pedido explícito: "que las cajas se abran cuando
// las toquen") -- gira hacia atrás sobre su bisagra, como una tapa real.
const ANGULO_APERTURA_CAJA = Math.PI * 0.62;
const DURACION_CAJA_MS = 480;

// Zoom con scroll (pedido explícito: "que me pueda acercar y alejar con el
// cursor") -- distancia de la cámara al punto que está mirando, acotada
// para no atravesar el rack ni alejarse tanto que se pierda.
const DISTANCIA_ZOOM_MIN = 3.2;
const DISTANCIA_ZOOM_MAX = 14;

// Piso mucho más grande que el rack (pedido explícito: "que toda la
// pantalla sea responsiva [al grid]", sin borde visible ni acercando ni
// alejando dentro del rango de zoom de arriba).
const TAMANO_PISO = 60;

// Balanceo idle (pedido explícito: "un movimiento de unos 3-4° hacia un lado
// y volver, da sensación de objeto físico") -- vuelve un loop permanente
// (con la excepción ya documentada para el Login, ver MASTER-PROMPT.md), a
// diferencia del auto-rotate anterior (giro completo) esto es una
// oscilación chica alrededor del ángulo donde quedó el rack, no un giro.
const AMPLITUD_BASCULACION = THREE.MathUtils.degToRad(3.5);
const FRECUENCIA_BASCULACION = 0.35; // rad/s de la fase del seno

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}


// Piso de concreto con grid (pedido explícito: "como un centro de
// distribución real" -- en vez del piso "solo sombra" de antes). Textura
// procedural (canvas 2D, no es un asset externo): color+grid en `map`
// (repetible, para que el grid se vea nítido) y un degradé radial aparte en
// `alphaMap` (sin repetir) para que el piso igual se desvanezca en los
// bordes en vez de cortar en seco contra el fondo.
function crearTexturaPisoConcretoColor() {
  const tam = 512;
  const canvas = document.createElement('canvas');
  canvas.width = tam;
  canvas.height = tam;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#152826';
  ctx.fillRect(0, 0, tam, tam);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    ctx.fillRect(Math.random() * tam, Math.random() * tam, 1, 1);
  }
  ctx.strokeStyle = 'rgba(79, 224, 209, .16)';
  ctx.lineWidth = 1.5;
  const paso = tam / 6;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath(); ctx.moveTo(i * paso, 0); ctx.lineTo(i * paso, tam); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * paso); ctx.lineTo(tam, i * paso); ctx.stroke();
  }
  const textura = new THREE.CanvasTexture(canvas);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  // El plano de piso es mucho más grande que el rack a propósito (ver
  // TAMANO_PISO más abajo) para que el borde del degradé de alphaMap nunca
  // quede dentro del encuadre visible -- el repeat se escala igual, para
  // que el tamaño de cada cuadro del grid en pantalla no cambie.
  textura.repeat.set(TAMANO_PISO / 3, TAMANO_PISO / 3);
  return textura;
}


/**
 * Wrapper de React para el rack 3D -- monta/dispone un único WebGLRenderer
 * (higiene de GPU, ver MASTER-PROMPT.md Fase 4), y solo se importa a través
 * de un React.lazy() en Login.jsx: el bundle principal nunca ve `three`.
 *
 * Sin loop de rotación automática -- pedido explícito: "que solo sea
 * interactivo". El render es event-driven (mount/resize/drag); solo se abre
 * un rAF temporal mientras dura una animación acotada (inercia, zoom a un
 * punto, cambio de vista, o el ciclo de transferencia) y se cierra solo al
 * terminar -- nunca queda un loop permanente corriendo de fondo. El ciclo de
 * transferencia se dispara con un setInterval (sin costo mientras espera),
 * no con el rAF.
 */
export default function Rack3DEscena({ puntosInfo = [], onEnfoqueCambio }) {
  const contenedorRef = useRef(null);
  const marcadoresRef = useRef([]);
  const badgesRef = useRef([]);
  const lineasRef = useRef([]);
  const transferenciaRef = useRef(null);
  const cajaCardsRef = useRef([]);
  const [hoverId, setHoverId] = useState(null);
  const [puntoEnfocado, setPuntoEnfocado] = useState(null);
  const [nivelEnfocado, setNivelEnfocado] = useState(null);
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [transferenciaVisible, setTransferenciaVisible] = useState(false);
  // 'viajando' mientras la caja se mueve; 'llegada' desde que aterriza (el
  // texto pasa a la confirmación tipo "✓ Ubicación óptima").
  const [faseTransferencia, setFaseTransferencia] = useState('viajando');
  const enfocarPuntoRef = useRef(() => {});
  const enfocarNivelRef = useRef(() => {});
  // Avisa a Login.jsx cuando hay algún zoom activo (punto o nivel) -- pedido
  // explícito: "el rack está muy céntrico, cuando voy a los niveles se
  // estorban [con los toasts ambientales]". Login.jsx oculta los toasts
  // mientras hayEnfoque, para que el zoom no compita con ellos.
  const onEnfoqueCambioRef = useRef(onEnfoqueCambio);
  onEnfoqueCambioRef.current = onEnfoqueCambio;

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    const escena = new THREE.Scene();
    // Niebla exponencial -- el piso (un plano gigante, ver TAMANO_PISO) se
    // ve perfecto de cerca, pero un plano horizontal visto desde una cámara
    // elevada SIEMPRE tiene un horizonte real en perspectiva (no es un bug
    // de borde/alpha, ya se descartó esa hipótesis) -- reportado en vivo
    // como "se nota un recuadro". La niebla, con un color cercano al fondo
    // real de la página, funde ese horizonte en vez de cortarlo en seco.
    escena.fog = new THREE.FogExp2(0x082420, 0.07);
    // Cámara retirada + FOV angosto a propósito: da bastante aire arriba y
    // abajo del rack (~25% de margen) para que nunca se corte contra el
    // borde de la caja, sea cual sea el tamaño de pantalla.
    const camara = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camara.position.copy(CAMARA_POS_DEFECTO);
    const miraActual = CAMARA_MIRA_DEFECTO.clone();
    camara.lookAt(miraActual);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    contenedor.appendChild(renderer.domElement);

    // Nota: se probó un environment map acá (RoomEnvironment + PMREM, con
    // tone mapping) para sumar reflejo metálico -- segunda vez que se
    // prueba esto en la sesión, segunda vez que lava el gris perla y se ve
    // "demasiado blanco" (reportado en vivo). Descartado definitivamente --
    // el rig de luces directas de abajo ya da el volumen/realismo que hace
    // falta sin ese riesgo.
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2, 4.5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 0.5, far: 15 });
    escena.add(key);
    const fill = new THREE.DirectionalLight(0xbcdfff, 0.35);
    fill.position.set(-3, 1.5, -2);
    escena.add(fill);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 0.22);
    rim.position.set(-1.5, 2.2, -4);
    escena.add(rim);
    escena.add(new THREE.AmbientLight(0xffffff, 0.28));

    // Piso de concreto con grid (pedido explícito: "como un centro de
    // distribución real", reemplaza al piso "solo sombra" de antes).
    // Sin alphaMap a propósito -- se probó con degradé y aun así se veía un
    // "recuadro" (reportado en vivo dos veces). El plano gigante (60
    // unidades) ya garantiza que su borde geométrico real nunca entre en
    // cuadro; sin fade de por medio no hay ningún borde que se pueda leer
    // mal.
    const texturaPisoColor = crearTexturaPisoConcretoColor();
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(TAMANO_PISO, TAMANO_PISO),
      new THREE.MeshStandardMaterial({ map: texturaPisoColor, roughness: 0.9, metalness: 0.05 }),
    );
    piso.rotation.x = -Math.PI / 2;
    piso.receiveShadow = true;
    escena.add(piso);
    // Luz turquesa rasante (pedido explícito: "está genial, no la saques")
    // -- ilumina las patas/perfiles bajos del rack como un reflector de
    // piso. No depende del material del piso de arriba, sigue intacta.
    const luzPiso = new THREE.PointLight(0x4fe0d1, 0.6, 4.5);
    luzPiso.position.set(0, 0.4, 1.6);
    escena.add(luzPiso);

    const { grupo: grupoRack, cajas: cajasInfo } = crearRack();
    // Ángulo 3/4 fijo (antes rotaba solo) -- pedido explícito: "dejar de
    // rotar, que solo sea interactivo". Se ve el frente y un lateral con
    // profundidad, y el usuario puede arrastrar desde acá.
    grupoRack.rotation.y = ROTACION_INICIAL;
    escena.add(grupoRack);

    const anclasInfo = puntosInfo
      .filter(p => ANCLAS_POR_ID[p.id])
      .map(p => ({ id: p.id, objeto: agregarAncla(grupoRack, ANCLAS_POR_ID[p.id].x, ANCLAS_POR_ID[p.id].y, ANCLAS_POR_ID[p.id].z) }));

    const anclasNivel = NIVELES_BADGE.map(n => ({
      nivel: n.nivel,
      badge: agregarAncla(grupoRack, n.badge.x, n.badge.y, n.badge.z),
      borde: agregarAncla(grupoRack, n.borde.x, n.borde.y, n.borde.z),
    }));

    // Caja de la animación de transferencia RCL -> MZ -- arranca invisible y
    // afuera del rack; agregarAncla() no sirve acá porque necesita
    // geometría real (se ve), así que es un mesh común, hijo del grupo para
    // que viaje con el rack si el usuario arrastra mientras tanto.
    const nivelTransferencia = Math.min(NIVEL_TRANSFERENCIA, CANTIDAD_NIVELES - 1);
    const yEstanteTransferencia = obtenerAlturaNivel(nivelTransferencia) + 0.02;
    const origenTransferencia = new THREE.Vector3(-DIMENSIONES.ANCHO * 1.7, yEstanteTransferencia + 0.15, 0.1);
    const destinoTransferencia = new THREE.Vector3(0.05, yEstanteTransferencia + 0.15, 0);
    const materialTransferencia = new THREE.MeshStandardMaterial({ color: 0x4fe0d1, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0 });
    const cajaTransferencia = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.32), materialTransferencia);
    cajaTransferencia.visible = false;
    cajaTransferencia.castShadow = true;
    grupoRack.add(cajaTransferencia);

    // Destello del estante al llegar la transferencia (pedido explícito:
    // "el nivel parpadea... como si el sistema estuviera diciendo 'aquí va
    // este producto'") -- una malla emissive aparte SOBRE el estante, no se
    // toca el material compartido de la estructura (perfiles/estantes/patas
    // usan el mismo material; mutarlo de golpe destellaría todo el rack).
    const materialDestello = new THREE.MeshStandardMaterial({ color: 0x4fe0d1, emissive: 0x4fe0d1, emissiveIntensity: 0, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const mallaDestello = new THREE.Mesh(new THREE.PlaneGeometry(DIMENSIONES.ANCHO * 0.94, DIMENSIONES.PROFUNDIDAD * 0.88), materialDestello);
    mallaDestello.rotation.x = -Math.PI / 2;
    mallaDestello.position.set(0, obtenerAlturaNivel(nivelTransferencia) + 0.02, 0);
    grupoRack.add(mallaDestello);

    const raycaster = new THREE.Raycaster();
    const puntero = new THREE.Vector2();
    const vectorProyeccion = new THREE.Vector3();

    function proyectarA(div, objeto3D) {
      if (!div) return;
      objeto3D.getWorldPosition(vectorProyeccion);
      vectorProyeccion.project(camara);
      const rect = contenedor.getBoundingClientRect();
      if (vectorProyeccion.z > 1) { div.style.display = 'none'; return null; }
      div.style.display = '';
      const x = (vectorProyeccion.x * 0.5 + 0.5) * rect.width;
      const y = (-vectorProyeccion.y * 0.5 + 0.5) * rect.height;
      div.style.left = `${x}px`;
      div.style.top = `${y}px`;
      return { x, y };
    }

    function actualizarMarcadores() {
      anclasInfo.forEach((ancla, i) => proyectarA(marcadoresRef.current[i], ancla.objeto));

      anclasNivel.forEach((ancla, i) => {
        const posBadge = proyectarA(badgesRef.current[i], ancla.badge);
        const linea = lineasRef.current[i];
        if (!linea) return;
        if (!posBadge) { linea.style.display = 'none'; return; }
        ancla.borde.getWorldPosition(vectorProyeccion);
        vectorProyeccion.project(camara);
        if (vectorProyeccion.z > 1) { linea.style.display = 'none'; return; }
        const rect = contenedor.getBoundingClientRect();
        const xBorde = (vectorProyeccion.x * 0.5 + 0.5) * rect.width;
        const yBorde = (-vectorProyeccion.y * 0.5 + 0.5) * rect.height;
        linea.style.display = '';
        linea.setAttribute('x1', posBadge.x);
        linea.setAttribute('y1', posBadge.y);
        linea.setAttribute('x2', xBorde);
        linea.setAttribute('y2', yBorde);
      });

      if (cajaTransferencia.visible) proyectarA(transferenciaRef.current, cajaTransferencia);

      cajasInfo.forEach((c, i) => {
        const div = cajaCardsRef.current[i];
        if (!div) return;
        if (cajaAbiertaActual === i) proyectarA(div, c.cuerpo);
        else div.style.display = 'none';
      });
    }

    function renderizar() {
      renderer.render(escena, camara);
      actualizarMarcadores();
    }

    // -- Loop permanente (pedido explícito: balanceo idle sutil) -- licencia
    // ya documentada para animaciones permanentes en el Login (MASTER-
    // PROMPT.md, "la vidriera de la app, no la app operativa"). Además del
    // balanceo, comparte cuadro con la inercia del drag, el zoom, el cambio
    // de vista y la transferencia -- todas mutan el mismo `grupoRack`/
    // `camara`, un solo requestAnimationFrame para todo. --
    let velocidadInercia = 0;
    const animacionCamara = { activo: false, desdePos: new THREE.Vector3(), hastaPos: new THREE.Vector3(), desdeMira: new THREE.Vector3(), hastaMira: new THREE.Vector3(), inicio: 0 };
    const animacionTransferencia = { activo: false, inicio: 0 };
    let destelloDisparado = false;
    const destelloEstante = { activo: false, inicio: 0, material: materialDestello };
    function dispararDestello() {
      destelloEstante.activo = true;
      destelloEstante.inicio = performance.now();
      destelloEstante.material.opacity = 0.4;
    }
    // Una tapa abierta/cerrada por caja (pedido explícito: "que las cajas se
    // abran cuando las toquen") -- animación acotada, mismo patrón que las
    // demás; `abierta` guarda el estado lógico entre clicks.
    const animacionesCaja = cajasInfo.map(() => ({ activo: false, desde: 0, hasta: 0, inicio: 0, abierta: false }));
    let bucleId = null;
    let ultimoTiempoBucle = performance.now();
    // Copia local de "puntoEnfocado"/"nivelEnfocado" -- alClick/enfocarPunto/
    // enfocarNivel viven en este mismo closure de montaje único, así que usan
    // esto (siempre al día) en vez del estado de React capturado (que
    // quedaría stale, esta función no se vuelve a crear en cada render).
    let puntoEnfocadoActual = null;
    let nivelEnfocadoActual = null;
    let cajaAbiertaActual = null;
    // Balanceo idle -- solo corre cuando no hay drag/inercia/zoom/vista/foco
    // en curso; `anguloReposo` se recaptura justo al volverse inactivo, para
    // que el balanceo arranque siempre desde 0 sin saltos.
    let anguloReposo = grupoRack.rotation.y;
    let faseBasculacion = 0;
    let inactivoAnterior = true;

    function paso(ahora) {
      const dt = Math.min((ahora - ultimoTiempoBucle) / 1000, 0.1);
      ultimoTiempoBucle = ahora;
      let necesitaOtroFrame = false;

      if (velocidadInercia !== 0) {
        grupoRack.rotation.y += velocidadInercia * dt;
        velocidadInercia *= Math.pow(FRICCION_INERCIA, dt);
        if (Math.abs(velocidadInercia) < 0.01) velocidadInercia = 0;
      }

      const inactivoAhora = !arrastrando && !animacionCamara.activo
        && puntoEnfocadoActual === null && nivelEnfocadoActual === null && velocidadInercia === 0;
      if (inactivoAhora && !inactivoAnterior) {
        anguloReposo = grupoRack.rotation.y;
        faseBasculacion = 0;
      }
      if (inactivoAhora) {
        faseBasculacion += dt * FRECUENCIA_BASCULACION;
        grupoRack.rotation.y = anguloReposo + Math.sin(faseBasculacion) * AMPLITUD_BASCULACION;
      }
      inactivoAnterior = inactivoAhora;

      if (animacionCamara.activo) {
        const t = Math.min((ahora - animacionCamara.inicio) / DURACION_ZOOM_MS, 1);
        const suavizado = easeInOutCubic(t);
        camara.position.lerpVectors(animacionCamara.desdePos, animacionCamara.hastaPos, suavizado);
        miraActual.lerpVectors(animacionCamara.desdeMira, animacionCamara.hastaMira, suavizado);
        camara.lookAt(miraActual);
        if (t >= 1) animacionCamara.activo = false;
      }

      if (animacionTransferencia.activo) {
        const t = ahora - animacionTransferencia.inicio;
        if (t < TRANSFERENCIA_VIAJE_MS) {
          const s = easeInOutCubic(t / TRANSFERENCIA_VIAJE_MS);
          cajaTransferencia.position.lerpVectors(origenTransferencia, destinoTransferencia, s);
          materialTransferencia.opacity = Math.min(s * 2, 1);
          setFaseTransferencia('viajando');
        } else if (t < TRANSFERENCIA_VIAJE_MS + TRANSFERENCIA_PAUSA_MS) {
          cajaTransferencia.position.copy(destinoTransferencia);
          materialTransferencia.opacity = 1;
          if (!destelloDisparado) {
            destelloDisparado = true;
            setFaseTransferencia('llegada');
            dispararDestello();
          }
        } else if (t < TRANSFERENCIA_TOTAL_MS) {
          const s = (t - TRANSFERENCIA_VIAJE_MS - TRANSFERENCIA_PAUSA_MS) / TRANSFERENCIA_DESVANECE_MS;
          materialTransferencia.opacity = 1 - s;
        } else {
          animacionTransferencia.activo = false;
          destelloDisparado = false;
          cajaTransferencia.visible = false;
          setTransferenciaVisible(false);
        }
      }

      animacionesCaja.forEach((anim, i) => {
        if (!anim.activo) return;
        const t = Math.min((ahora - anim.inicio) / DURACION_CAJA_MS, 1);
        const suavizado = easeInOutCubic(t);
        cajasInfo[i].pivote.rotation.x = anim.desde + (anim.hasta - anim.desde) * suavizado;
        if (t >= 1) anim.activo = false;
      });

      if (destelloEstante.activo) {
        const t = Math.min((ahora - destelloEstante.inicio) / DURACION_DESTELLO_MS, 1);
        destelloEstante.material.emissiveIntensity = Math.sin(t * Math.PI) * 0.9;
        if (t >= 1) destelloEstante.activo = false;
      }

      renderizar();
      // Loop permanente -- el balanceo idle necesita seguir corriendo
      // siempre (ver arriba), no solo mientras dura una animación acotada.
      bucleId = requestAnimationFrame(paso);
    }
    function asegurarBucle() {
      if (bucleId !== null) return;
      ultimoTiempoBucle = performance.now();
      bucleId = requestAnimationFrame(paso);
    }

    function alternarCaja(indice) {
      const anim = animacionesCaja[indice];
      if (!anim) return;
      anim.abierta = !anim.abierta;
      anim.desde = cajasInfo[indice].pivote.rotation.x;
      anim.hasta = anim.abierta ? -ANGULO_APERTURA_CAJA : 0;
      anim.inicio = performance.now();
      anim.activo = true;
      // Al abrir se ve una tarjeta con SKU/producto/cantidad (pedido
      // explícito, convive con el contenido de nivel, no lo reemplaza).
      cajaAbiertaActual = anim.abierta ? indice : null;
      setCajaAbierta(cajaAbiertaActual);
      asegurarBucle();
    }

    function animarCamaraHacia(posObjetivo, miraObjetivo) {
      velocidadInercia = 0;
      animacionCamara.desdePos.copy(camara.position);
      animacionCamara.hastaPos.copy(posObjetivo);
      animacionCamara.desdeMira.copy(miraActual);
      animacionCamara.hastaMira.copy(miraObjetivo);
      animacionCamara.inicio = performance.now();
      animacionCamara.activo = true;
      asegurarBucle();
    }

    function notificarEnfoque() {
      onEnfoqueCambioRef.current?.(puntoEnfocadoActual !== null || nivelEnfocadoActual !== null);
    }

    function enfocarPunto(id) {
      puntoEnfocadoActual = id;
      setPuntoEnfocado(id);
      if (id === null) {
        animarCamaraHacia(CAMARA_POS_DEFECTO, CAMARA_MIRA_DEFECTO);
        notificarEnfoque();
        return;
      }
      if (nivelEnfocadoActual !== null) { nivelEnfocadoActual = null; setNivelEnfocado(null); }
      notificarEnfoque();
      const ancla = anclasInfo.find(a => a.id === id);
      if (!ancla) return;
      const mundo = new THREE.Vector3();
      ancla.objeto.getWorldPosition(mundo);
      animarCamaraHacia(mundo.clone().add(DESPLAZAMIENTO_ZOOM), mundo);
    }
    enfocarPuntoRef.current = enfocarPunto;

    // Zoom + panel de capacidad al clickear un nivel -- pedido explícito:
    // "esta será la presentación de mi proyecto", nada de un cajón de texto
    // plano. Mismo mecanismo de cámara que enfocarPunto, apuntando al borde
    // real del estante en vez de a un ancla de información.
    function enfocarNivel(nivel) {
      nivelEnfocadoActual = nivel;
      setNivelEnfocado(nivel);
      if (nivel === null) {
        animarCamaraHacia(CAMARA_POS_DEFECTO, CAMARA_MIRA_DEFECTO);
        notificarEnfoque();
        return;
      }
      if (puntoEnfocadoActual !== null) { puntoEnfocadoActual = null; setPuntoEnfocado(null); }
      notificarEnfoque();
      const ancla = anclasNivel[nivel];
      if (!ancla) return;
      const mundo = new THREE.Vector3();
      ancla.borde.getWorldPosition(mundo);
      animarCamaraHacia(mundo.clone().add(DESPLAZAMIENTO_ZOOM), mundo);
    }
    enfocarNivelRef.current = enfocarNivel;

    function iniciarTransferencia() {
      if (animacionTransferencia.activo) return;
      cajaTransferencia.position.copy(origenTransferencia);
      materialTransferencia.opacity = 0;
      cajaTransferencia.visible = true;
      destelloDisparado = false;
      setFaseTransferencia('viajando');
      setTransferenciaVisible(true);
      animacionTransferencia.inicio = performance.now();
      animacionTransferencia.activo = true;
      asegurarBucle();
    }
    const idPrimeraTransferencia = setTimeout(iniciarTransferencia, 2500);
    const idIntervaloTransferencia = setInterval(iniciarTransferencia, INTERVALO_TRANSFERENCIA_MS);

    let arrastrando = false;
    let seArrastro = false;
    let xUltimoPuntero = 0;
    let tUltimoPuntero = 0;
    let velocidadArrastreActual = 0;

    function alPunteroBajar(e) {
      arrastrando = true;
      seArrastro = false;
      velocidadInercia = 0;
      xUltimoPuntero = e.clientX;
      tUltimoPuntero = performance.now();
    }
    function alPunteroMover(e) {
      if (!arrastrando) return;
      const ahora = performance.now();
      const delta = e.clientX - xUltimoPuntero;
      const dt = Math.max((ahora - tUltimoPuntero) / 1000, 1 / 240);
      if (Math.abs(delta) > 1) seArrastro = true;
      const deltaRotacion = delta * 0.01;
      grupoRack.rotation.y += deltaRotacion;
      velocidadArrastreActual = deltaRotacion / dt;
      xUltimoPuntero = e.clientX;
      tUltimoPuntero = ahora;
      renderizar();
    }
    function alPunteroSoltar() {
      if (!arrastrando) return;
      arrastrando = false;
      if (seArrastro) {
        velocidadInercia = Math.max(Math.min(velocidadArrastreActual, VELOCIDAD_INERCIA_MAX), -VELOCIDAD_INERCIA_MAX);
        asegurarBucle();
      }
    }
    function alClick(e) {
      if (seArrastro) return; // un drag que termina sobre el rack no cuenta como click
      const rect = contenedor.getBoundingClientRect();
      puntero.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      puntero.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(puntero, camara);
      // recursive:true -- las cajas ahora son grupos (cuerpo+tapa con
      // bisagra), no meshes directos de grupoRack como los estantes.
      const intersecciones = raycaster.intersectObjects(grupoRack.children, true);
      const primero = intersecciones[0];
      // Sin el stopPropagation, el click burbujea hasta el onClick de
      // .login-escena (Login.jsx) y cierra el panel en el mismo evento que lo
      // abrió (mismo bug que manejarClickHud ya resuelve para los HUD).
      if (primero?.object.userData?.indiceCaja !== undefined) {
        e.stopPropagation();
        alternarCaja(primero.object.userData.indiceCaja);
        return;
      }
      if (primero?.object.userData?.nivel !== undefined) {
        e.stopPropagation();
        const nivel = primero.object.userData.nivel;
        enfocarNivel(nivelEnfocadoActual === nivel ? null : nivel);
        return;
      }
      // Click en área vacía cierra cualquier zoom activo (punto o nivel).
      if (puntoEnfocadoActual !== null) enfocarPunto(null);
      if (nivelEnfocadoActual !== null) enfocarNivel(null);
    }

    // Zoom con scroll (pedido explícito: "que me pueda acercar y alejar con
    // el cursor") -- ajusta la distancia cámara->mira a lo largo de la
    // misma dirección, sin animación (el propio scroll ya es continuo).
    // Cancela cualquier animación de cámara en curso para que no compitan
    // por la misma posición cuadro a cuadro.
    function alRueda(e) {
      e.preventDefault();
      animacionCamara.activo = false;
      const direccion = new THREE.Vector3().subVectors(camara.position, miraActual);
      const distancia = THREE.MathUtils.clamp(direccion.length() + e.deltaY * 0.0035, DISTANCIA_ZOOM_MIN, DISTANCIA_ZOOM_MAX);
      direccion.setLength(distancia);
      camara.position.copy(miraActual).add(direccion);
      renderizar();
    }

    contenedor.addEventListener('pointerdown', alPunteroBajar);
    window.addEventListener('pointermove', alPunteroMover);
    window.addEventListener('pointerup', alPunteroSoltar);
    contenedor.addEventListener('click', alClick);
    contenedor.addEventListener('wheel', alRueda, { passive: false });

    // El renderer no se redimensiona hasta tener una medida real -- evita un
    // canvas 0x0 en el primer paint (ResizeObserver dispara con el tamaño ya
    // asentado, a diferencia de leer clientWidth/Height en el primer render).
    const resizeObserver = new ResizeObserver(entradas => {
      const { width, height } = entradas[0].contentRect;
      if (width === 0 || height === 0) return;
      camara.aspect = width / height;
      camara.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderizar();
    });
    resizeObserver.observe(contenedor);

    return () => {
      if (bucleId !== null) cancelAnimationFrame(bucleId);
      clearTimeout(idPrimeraTransferencia);
      clearInterval(idIntervaloTransferencia);
      resizeObserver.disconnect();
      contenedor.removeEventListener('pointerdown', alPunteroBajar);
      window.removeEventListener('pointermove', alPunteroMover);
      window.removeEventListener('pointerup', alPunteroSoltar);
      contenedor.removeEventListener('click', alClick);
      contenedor.removeEventListener('wheel', alRueda);
      disposeRack(grupoRack);
      piso.geometry.dispose();
      piso.material.dispose();
      texturaPisoColor.dispose();
      renderer.dispose();
      contenedor.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montaje único a propósito, puntosInfo es una constante de módulo estable (ver Login.jsx)
  }, []);

  return (
    <div ref={contenedorRef} className="rack3d-contenedor">
      <svg className="rack3d-conectores" aria-hidden="true">
        {NIVELES_BADGE.map((n, i) => (
          <line key={n.nivel} ref={el => { lineasRef.current[i] = el; }} />
        ))}
      </svg>

      <div className="rack3d-status">
        <span className="rack3d-status__punto" />
        RACK-MZ · Óptimo
      </div>

      {NIVELES_BADGE.map((n, i) => {
        const capacidad = CAPACIDADES_NIVEL[n.nivel];
        const enfocado = nivelEnfocado === n.nivel;
        return (
          <div key={n.nivel} ref={el => { badgesRef.current[i] = el; }} className="rack3d-nivel-envoltorio">
            <button
              type="button"
              className={`rack3d-nivel-badge ${enfocado ? 'rack3d-nivel-badge--activo' : ''}`}
              onClick={e => { e.stopPropagation(); enfocarNivelRef.current(enfocado ? null : n.nivel); }}
              aria-label={`Ver capacidad del nivel ${n.etiqueta}${capacidad ? `: ${capacidad.titulo}` : ''}`}
            >
              {n.etiqueta}
            </button>
          </div>
        );
      })}

      {/* El panel vive en una posición FIJA (no anclada al badge) -- pedido
          explícito, bug real reportado: con el badge como ancla, el panel
          podía proyectarse justo debajo del título según el ángulo/zoom del
          rack en ese momento, tapándolo. Una posición fija en pantalla nunca
          puede chocar con el título/subtítulo (arriba-izquierda) ni con la
          franja de confianza/botón (abajo-centro). */}
      {nivelEnfocado !== null && CAPACIDADES_NIVEL[nivelEnfocado] && (
        <div className="rack3d-nivel-panel">
          <button
            type="button"
            className="rack3d-nivel-panel__cerrar"
            onClick={e => { e.stopPropagation(); enfocarNivelRef.current(null); }}
            aria-label="Cerrar"
          >
            <i className="ti ti-x" />
          </button>
          <span className="rack3d-nivel-panel__eyebrow">Nivel {nivelEnfocado + 1} de {CAPACIDADES_NIVEL.length}</span>
          <strong><i className={`ti ${CAPACIDADES_NIVEL[nivelEnfocado].icono}`} /> {CAPACIDADES_NIVEL[nivelEnfocado].titulo}</strong>
          <p>{CAPACIDADES_NIVEL[nivelEnfocado].texto}</p>
        </div>
      )}

      {transferenciaVisible && (
        <div className={`rack3d-transferencia ${faseTransferencia === 'llegada' ? 'rack3d-transferencia--llegada' : ''}`} ref={transferenciaRef}>
          {faseTransferencia === 'llegada'
            ? (<><i className="ti ti-circle-check" /> Ubicación óptima</>)
            : (<><i className="ti ti-arrows-right-left" /> Transferencia RCL → MZ</>)}
        </div>
      )}

      {/* Tarjeta de SKU/producto al abrir una caja -- pedido explícito:
          "al seleccionar una ubicación que aparezca SKU/producto/cantidad/
          estado/último movimiento". Convive con el panel de nivel (arriba),
          no lo reemplaza -- es detalle sobre la mercadería, no la capacidad. */}
      {INFO_MERCADERIA.map((info, i) => (
        cajaAbierta === i && (
          <div key={i} ref={el => { cajaCardsRef.current[i] = el; }} className="rack3d-caja-card">
            <span className="rack3d-caja-card__posicion">{info.posicion}</span>
            <div className="rack3d-caja-card__fila"><span>SKU</span><strong>{info.sku}</strong></div>
            <div className="rack3d-caja-card__fila"><span>Producto</span><strong>{info.producto}</strong></div>
            <div className="rack3d-caja-card__fila"><span>Cantidad</span><strong>{info.cantidad}</strong></div>
            <div className="rack3d-caja-card__fila">
              <span>Estado</span>
              <strong className={info.estado === 'Disponible' ? 'rack3d-caja-card__estado--ok' : 'rack3d-caja-card__estado--alerta'}>
                <i className="ti ti-circle-filled" /> {info.estado}
              </strong>
            </div>
            <div className="rack3d-caja-card__ultimo">Último movimiento: {info.ultimoMovimiento}</div>
          </div>
        )
      ))}

      {puntosInfo.map((p, i) => (
        <div
          key={p.id}
          ref={el => { marcadoresRef.current[i] = el; }}
          className={`rack3d-punto ${hoverId === p.id || puntoEnfocado === p.id ? 'rack3d-punto--activo' : ''}`}
          onMouseEnter={() => setHoverId(p.id)}
          onMouseLeave={() => setHoverId(null)}
          onClick={e => { e.stopPropagation(); enfocarPuntoRef.current(puntoEnfocado === p.id ? null : p.id); }}
        >
          <span className="rack3d-punto__nucleo" />
          {(hoverId === p.id || puntoEnfocado === p.id) && (
            <div className={`rack3d-punto__leyenda ${puntoEnfocado === p.id ? 'rack3d-punto__leyenda--enfocada' : ''}`}>
              {puntoEnfocado === p.id && (
                <button
                  type="button"
                  className="rack3d-punto__leyenda-cerrar"
                  onClick={e => { e.stopPropagation(); enfocarPuntoRef.current(null); }}
                  aria-label="Cerrar"
                >
                  <i className="ti ti-x" />
                </button>
              )}
              <strong><i className={`ti ${p.icono}`} /> {p.etiqueta}</strong>
              <p>{p.descripcion}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
