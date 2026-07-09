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
