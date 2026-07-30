import Skeleton from '../../ui/motion/Skeleton.jsx';

/**
 * Reemplaza el "Cargando…" en texto plano que tenían varias pantallas
 * (2026-07-28, pedido explícito) -- unas líneas de shimmer escalonadas en
 * vez de una palabra sola, mismo componente Skeleton que ya usaba el
 * Dashboard. La última línea más angosta, para que lea como texto real
 * (un párrafo nunca termina justo al borde).
 */
export default function PanelCargando({ lineas = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
      {Array.from({ length: lineas }, (_, i) => (
        <Skeleton key={i} indice={i} ancho={i === lineas - 1 ? '55%' : '100%'} />
      ))}
    </div>
  );
}
