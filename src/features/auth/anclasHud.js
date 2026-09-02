// Punto del panel HUD (hud) + punto de la escena al que apunta (escena) --
// separado de loginEscenaAlmacen.jsx para que ese archivo exporte solo
// componentes (react-refresh/only-export-components). Login.jsx importa
// esto mismo para posicionar los paneles en `%`, nunca hay dos copias de
// estas coordenadas.
export const ANCLAS_HUD = {
  slotting: { hud: { x: 46, y: 40 }, escena: { x: 150, y: 96 } },
  trazabilidad: { hud: { x: 354, y: 40 }, escena: { x: 26, y: 128 } },
  inventario: { hud: { x: 354, y: 222 }, escena: { x: 322, y: 194 } },
};
