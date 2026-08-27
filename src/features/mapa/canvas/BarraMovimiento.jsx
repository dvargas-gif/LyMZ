/**
 * Equivalente del "movebar" del mapa legacy (ver iniciarMover()/iniciarMoverCuerpo()
 * en 08-interacciones.js): franja flotante que guía el flujo de 2-3 pasos de
 * mover un artículo o un cuerpo completo -- "tocá el destino", después
 * (solo mover individual) "elegí el nivel". Toda la lógica vive en
 * MapaCanvas.jsx, esto es pura presentación del estado `moviendo`.
 */
export default function BarraMovimiento({ moviendo, guardando, nivelesDisponibles, onElegirNivel, onCancelar }) {
  if (!moviendo) return null;

  const origenTexto = `${moviendo.origen.pasillo}-C${String(moviendo.origen.columna).padStart(3, '0')}${moviendo.origen.nivel ? `-${moviendo.origen.nivel}` : ''}`;

  /**
   * Destino planeado real (2026-08-24, pedido explícito: "que vea donde
   * está y hacia dónde va el artículo" al mover individual desde Vista RCL)
   * -- solo se muestra si hay UN solo movimiento pendiente para ese artículo;
   * si hay más de uno (orígenes distintos) se avisa en vez de arriesgar
   * mostrar el equivocado. Solo aplica al modo 'individual' -- mover un
   * cuerpo entero no tiene un destino planeado por artículo.
   *
   * Cuando NO hay ningún plan (2026-08-26, pedido explícito de David: "una
   * cosa es que le presentes dónde debería ir, sin plan, y otra es que no
   * muestres nada") -- se avisa explícito en vez de quedar en silencio,
   * para que el operador sepa que está moviendo sin ninguna guía, no que
   * el sistema simplemente no tenía nada que decir. Solo en el mapa real
   * (`sinPlanConocido`, ver MapaCanvas.jsx) -- en una sala no existe el
   * concepto de "plan de migración".
   */
  let destinoPlaneadoTexto = null;
  let sinPlan = false;
  if (moviendo.modo === 'individual') {
    if (moviendo.destinoPlaneado) {
      destinoPlaneadoTexto = moviendo.destinoPlaneado.ambiguo
        ? `Destino planeado: ambiguo (${moviendo.destinoPlaneado.cantidad} movimientos pendientes distintos) -- revisá el plan antes de decidir.`
        : `Destino planeado: ${moviendo.destinoPlaneado.mzPasillo}-C${String(moviendo.destinoPlaneado.mzColumna).padStart(3, '0')}-${moviendo.destinoPlaneado.mzNivel}.`;
    } else if (moviendo.sinPlanConocido) {
      sinPlan = true;
    }
  }

  let mensaje;
  if (guardando) {
    mensaje = 'Guardando…';
  } else if (moviendo.modo === 'cuerpo') {
    mensaje = `Moviendo CUERPO COMPLETO ${origenTexto}. Tocá un rack destino VACÍO.`;
  } else if (!moviendo.destino) {
    mensaje = `Moviendo artículo ${moviendo.articulo} (desde ${origenTexto}). Tocá el rack destino.`;
  } else {
    mensaje = `Elegí el nivel destino en ${moviendo.destino.pasillo}-C${String(moviendo.destino.columna).padStart(3, '0')}:`;
  }

  return (
    <div className="mapa-movebar">
      <span>{mensaje}</span>
      {!guardando && destinoPlaneadoTexto && <span className="mapa-movebar__destino-planeado">{destinoPlaneadoTexto}</span>}
      {!guardando && sinPlan && <span className="mapa-movebar__sin-plan">Sin destino planificado -- moviendo libremente.</span>}
      {!guardando && moviendo.modo === 'individual' && moviendo.destino && (
        <div className="mapa-movebar__niveles">
          {nivelesDisponibles.map(n => (
            <button key={n} className="mapa-movebar__nivel" onClick={() => onElegirNivel(n)}>
              {n === 'CUERPO' ? 'CUERPO ENTERO' : n}
            </button>
          ))}
        </div>
      )}
      <button className="mapa-movebar__cancelar" onClick={onCancelar} disabled={guardando}>Cancelar</button>
    </div>
  );
}
