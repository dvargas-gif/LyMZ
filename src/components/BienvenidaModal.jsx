import { useState } from 'react';
import { miPerfilService } from '../services/miPerfil.service.js';

/**
 * Se muestra UNA vez (mientras `apodo` esté vacío) a Administrador/Supervisor.
 * Guarda la respuesta vía RPC (actualizar_mi_apodo) — nunca toca el rol.
 */
export default function BienvenidaModal({ nombre, onListo }) {
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const apodo = valor.trim();
    if (!apodo) return;
    setGuardando(true);
    try {
      await miPerfilService.actualizarApodo(apodo);
      onListo(apodo);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="bienvenida-overlay">
      <div className="bienvenida-card">
        <div className="bienvenida-card__header">
          <span className="emoji">👋</span>
          <h2>¡Hola, {nombre}!</h2>
          <p>Antes de arrancar, contanos cómo te gustaría que te saludemos de ahora en más.</p>
        </div>
        <form className="bienvenida-card__body" onSubmit={handleSubmit}>
          <input
            autoFocus
            placeholder="Tu nombre o apodo preferido"
            value={valor}
            onChange={e => setValor(e.target.value)}
            maxLength={40}
          />
          <button type="submit" disabled={!valor.trim() || guardando}>
            {guardando ? 'Guardando…' : 'Listo, ¡así me gusta!'}
          </button>
          <button type="button" className="bienvenida-card__omitir" onClick={() => onListo(null)}>
            Preguntame la próxima vez
          </button>
        </form>
      </div>
    </div>
  );
}
