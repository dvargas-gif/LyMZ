/**
 * Conversor entre el nivel del WMS ('N01'-'N05'/'CUERPO', el que usa
 * posiciones_actuales/WarehouseModel en todo el resto de la app) y el nivel
 * numérico de identidad_legacy (1-5, ver
 * supabase/sql/2026-07-14_identidad_legacy_subposicion.sql). Un solo lugar
 * -- si tiene un off-by-one, revienta todo el flujo de buffer (F2), por eso
 * vive aparte y bien testeado, no inline donde se usa.
 *
 * 'CUERPO' no tiene equivalente en identidad_legacy (el archivo real del
 * cliente solo cubre N01-N05) -- devuelve null a propósito, nunca inventa
 * un número.
 */
const NIVELES_WMS = ['N01', 'N02', 'N03', 'N04', 'N05'];

export function nivelWmsANumero(nivel) {
  const i = NIVELES_WMS.indexOf(nivel);
  return i === -1 ? null : i + 1;
}

export function numeroANivelWms(numero) {
  return NIVELES_WMS[numero - 1] ?? null;
}
