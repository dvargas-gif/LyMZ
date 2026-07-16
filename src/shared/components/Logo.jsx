import { useId } from 'react';

/**
 * Isotipo "OLO" — badge cuadrado redondeado con el acento de marca de la app.
 * `suave` es opt-in (Sidebar/Header no lo usan, quedan exactamente igual):
 * esquinas más redondeadas, relleno en degradé en vez de plano, y una sombra
 * suave -- pensado para el logo grande del panel de Login, no un cambio
 * global de marca.
 */
export default function Logo({ size = 32, suave = false }) {
  const idGradiente = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="OLO"
      style={suave ? { filter: 'drop-shadow(0 8px 18px rgba(21, 69, 74, .35))' } : undefined}
    >
      {suave && (
        <defs>
          <linearGradient id={idGradiente} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#2E8B8F" />
          </linearGradient>
        </defs>
      )}
      <rect width="40" height="40" rx={suave ? 14 : 10} fill={suave ? `url(#${idGradiente})` : 'var(--accent)'} />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="'SF Pro Display', 'Segoe UI', sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="0.5"
        fill="var(--card)"
      >
        OLO
      </text>
    </svg>
  );
}
