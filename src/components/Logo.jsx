/** Isotipo "OLO" — badge cuadrado redondeado con el acento de marca de la app. */
export default function Logo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="OLO"
    >
      <rect width="40" height="40" rx="10" fill="#15454A" />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="'SF Pro Display', 'Segoe UI', sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#FFFFFF"
      >
        OLO
      </text>
    </svg>
  );
}
