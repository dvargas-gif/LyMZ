import { useEffect, useRef, useState } from 'react';
import UsuariosPanel from './UsuariosPanel.jsx';
import EditarCroquisPanel from './EditarCroquisPanel.jsx';
import ReportePanel from './ReportePanel.jsx';

const RADIO = 170; // px desde el centro del botón principal — dejar espacio para que los 6 ítems no se toquen
const ANGULO_INICIO = 95; // grados (0=derecha, 90=arriba, 180=izquierda)
const ANGULO_FIN = 195;
const TAMANO_BOTON = 64;
const TAMANO_ITEM = 52;
const MARGEN = 20;
const CLAVE_POS = 'wms_admin_fab_pos';
const UMBRAL_ARRASTRE = 6; // px — por debajo de esto, un pointerup cuenta como click, no arrastre

function posInicial() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_POS));
    if (guardada) return guardada;
  } catch { /* ignore */ }
  return { x: window.innerWidth - TAMANO_BOTON - MARGEN, y: window.innerHeight - TAMANO_BOTON - MARGEN };
}

function clamp(pos) {
  return {
    x: Math.min(Math.max(pos.x, MARGEN), window.innerWidth - TAMANO_BOTON - MARGEN),
    y: Math.min(Math.max(pos.y, MARGEN), window.innerHeight - TAMANO_BOTON - MARGEN),
  };
}

/**
 * Menú flotante circular — SOLO visible/usable por dvargas@ologistics.com
 * (gateado en Shell, ver App.jsx). Da acceso rápido a simulación, auditoría,
 * historial, reporte, permisos de usuarios y edición del croquis.
 *
 * Arrastre: usa Pointer Events + setPointerCapture sobre el propio botón.
 * Esto es lo que evita "perder" el cursor al arrastrar rápido — sin capture,
 * si el puntero pasa sobre el <iframe> del mapa (un documento aparte), el
 * navegador dejaría de entregar los eventos de mousemove al documento
 * padre. Con capture, el botón sigue recibiendo los eventos de ESE puntero
 * pase por donde pase, iframe incluido. Durante el arrastre se mueve el
 * contenedor escribiendo directamente su estilo (sin pasar por setState en
 * cada pixel) para que se sienta fluido; recién al soltar se confirma la
 * posición en el estado de React (y se guarda en localStorage).
 */
export default function AdminFab({ sesion, onNavigate }) {
  const [abierto, setAbierto] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'usuarios' | 'croquis' | 'reporte'
  const [pos, setPos] = useState(posInicial);
  const contenedorRef = useRef(null);
  const arrastre = useRef(null); // {pointerId, startX, startY, origX, origY, movido, ultima}

  useEffect(() => {
    function onResize() { setPos(p => clamp(p)); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function iniciarArrastre(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, movido: false, ultima: pos };
  }

  function moverArrastre(e) {
    const a = arrastre.current;
    if (!a || e.pointerId !== a.pointerId) return;
    const dx = e.clientX - a.startX;
    const dy = e.clientY - a.startY;
    if (!a.movido && (Math.abs(dx) > UMBRAL_ARRASTRE || Math.abs(dy) > UMBRAL_ARRASTRE)) a.movido = true;
    const nueva = clamp({ x: a.origX + dx, y: a.origY + dy });
    a.ultima = nueva;
    if (contenedorRef.current) {
      contenedorRef.current.style.left = `${nueva.x}px`;
      contenedorRef.current.style.top = `${nueva.y}px`;
    }
  }

  function soltarArrastre(e) {
    const a = arrastre.current;
    if (!a) return;
    try { e.currentTarget.releasePointerCapture(a.pointerId); } catch { /* ya liberado */ }
    if (!a.movido) {
      setAbierto(v => !v); // no se movió -> fue un click real, no un arrastre
    } else {
      setPos(a.ultima);
      localStorage.setItem(CLAVE_POS, JSON.stringify(a.ultima));
    }
    arrastre.current = null;
  }

  const items = [
    { icon: 'ti-users', label: 'Permisos de usuarios', onClick: () => { setPanel('usuarios'); setAbierto(false); } },
    { icon: 'ti-table', label: 'Reporte de posiciones', onClick: () => { setPanel('reporte'); setAbierto(false); } },
    { icon: 'ti-flask', label: 'Salas de simulación', onClick: () => { onNavigate('salas'); setAbierto(false); } },
    { icon: 'ti-shield-check', label: 'Auditoría', onClick: () => { onNavigate('auditoria'); setAbierto(false); } },
    { icon: 'ti-history', label: 'Historial de movimientos', onClick: () => { onNavigate('historial'); setAbierto(false); } },
    { icon: 'ti-palette', label: 'Editar croquis', onClick: () => { setPanel('croquis'); setAbierto(false); } },
  ];

  const paso = (ANGULO_FIN - ANGULO_INICIO) / (items.length - 1);
  // El abanico se abre hacia el cuadrante libre de pantalla más cercano,
  // para que nunca se vaya fuera de los bordes sea cual sea la esquina
  // donde quedó el botón tras arrastrarlo.
  const signoX = pos.x > window.innerWidth / 2 ? -1 : 1;
  const signoY = pos.y > window.innerHeight / 2 ? -1 : 1;

  return (
    <>
      {abierto && <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />}

      <div ref={contenedorRef} style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 999 }}>
        {items.map((item, i) => {
          const angulo = (ANGULO_INICIO + paso * i) * (Math.PI / 180);
          const x = abierto ? signoX * Math.cos(angulo) * RADIO : 0;
          const y = abierto ? signoY * Math.sin(angulo) * RADIO : 0;
          return (
            <button
              key={item.label}
              title={item.label}
              onClick={item.onClick}
              style={{
                position: 'absolute', left: TAMANO_BOTON / 2 - TAMANO_ITEM / 2, top: TAMANO_BOTON / 2 - TAMANO_ITEM / 2,
                width: TAMANO_ITEM, height: TAMANO_ITEM, borderRadius: '50%',
                background: '#fff', color: '#15454A', border: '1px solid #E0DACE',
                boxShadow: '0 4px 14px rgba(0,0,0,.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'clamp(18px, 2.4vw, 22px)', cursor: 'pointer',
                transform: `translate(${x}px, ${y}px) scale(${abierto ? 1 : 0})`,
                opacity: abierto ? 1 : 0,
                transition: `transform .45s cubic-bezier(.34,1.56,.64,1) ${abierto ? i * 35 : (items.length - i) * 25}ms, opacity .25s ease ${abierto ? i * 35 : 0}ms`,
                pointerEvents: abierto ? 'auto' : 'none',
              }}
            >
              <i className={`ti ${item.icon}`} />
            </button>
          );
        })}

        <button
          onPointerDown={iniciarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={soltarArrastre}
          onPointerCancel={soltarArrastre}
          title="Panel de administración (arrastrable)"
          style={{
            position: 'relative', width: TAMANO_BOTON, height: TAMANO_BOTON, borderRadius: '50%',
            background: '#15454A', color: '#fff', border: 'none',
            boxShadow: '0 6px 20px rgba(21,69,74,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(22px, 3vw, 28px)', cursor: 'grab', zIndex: 1, touchAction: 'none',
            transform: `rotate(${abierto ? 135 : 0}deg)`,
            transition: 'transform .4s cubic-bezier(.34,1.56,.64,1), background .2s ease',
          }}
        >
          <i className="ti ti-plus" />
        </button>
      </div>

      {panel === 'usuarios' && <UsuariosPanel onCerrar={() => setPanel(null)} />}
      {panel === 'croquis' && <EditarCroquisPanel sesion={sesion} onCerrar={() => setPanel(null)} />}
      {panel === 'reporte' && <ReportePanel onCerrar={() => setPanel(null)} />}
    </>
  );
}
