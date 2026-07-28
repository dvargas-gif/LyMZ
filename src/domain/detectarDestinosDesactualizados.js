/**
 * Auditoría de "Vista RCL" (2026-07-28, pedido explícito tras un caso real
 * encontrado en piso): `identidad_legacy` es un import de UNA SOLA VEZ
 * (posición RCL <-> posición MZ, ver identidadLegacy.service.js) que
 * después NUNCA se vuelve a tocar -- ni cuando se recalcula un plan, ni
 * cuando se aplica un movimiento. `inventario_slotting` (el plan base real,
 * también estático pero la fuente que usa el resto de la app -- Vista MZ,
 * Dashboard, Despacho) puede tener, para el MISMO artículo, una posición
 * MZ real distinta a la que quedó importada en `identidad_legacy`.
 *
 * Caso real que disparó esto: la "Vista RCL" de RCL146-C003 decía que el
 * artículo 5180060 iba a MZ06-C018 -- pero `inventario_slotting` (el plan
 * real) lo tiene en MZ06-C022-N02. Alguien confiando en la Vista RCL
 * hubiera caminado hasta el rack equivocado con el artículo físico en la
 * mano.
 *
 * Función pura, sin Supabase -- SOLO detecta y reporta, no cambia ni borra
 * nada de `identidad_legacy` ni `inventario_slotting` (mismo espíritu que
 * reglasAsignacionCuerpo.js/detectarSobrecargaRacks.js).
 */
import { numeroANivelWms } from '../features/migracion/nivelWms.js';

/**
 * @param {Array<{mzPasillo, mzColumna, mzNivel, rclCodigo, rclNivel, rclSubnivel, estadoRcl}>} identidadLegacy -- identidadLegacyService.listar()
 * @param {Array<{rclCodigo, rclNivel, rclSubnivel, articulo, cantidad}>} inventarioRcl -- inventarioRclService.listar()
 * @param {Array<{articulo, pasillo, columna, nivel}>} inventarioSlotting -- inventarioService.listar()
 * @returns {Array<{articulo, rclCodigo, rclNivel, rclSubnivel, destinoImportado, destinoReal}>}
 *   `destinoImportado` = {pasillo, columna, nivel} según identidad_legacy (el dato viejo).
 *   `destinoReal` = {pasillo, columna, nivel} según inventario_slotting, o `null` si el
 *   artículo no tiene NINGÚN lugar reservado en el plan real (el caso más grave: no
 *   tiene dónde vivir cuando se lo traslade). Solo incluye artículos donde ambos datos
 *   DIFIEREN (o el real no existe) -- si coinciden, no hay nada que reportar.
 */
export function detectarDestinosDesactualizados(identidadLegacy, inventarioRcl, inventarioSlotting) {
  // Mismo agrupamiento que vistaRcl.js: una sub-posición RCL puede tener varios artículos.
  const articulosPorSubPosicion = new Map();
  for (const inv of inventarioRcl) {
    if (inv.cantidad <= 0) continue; // sin stock real, no participa (mismo criterio que construirVistaRcl())
    const clave = `${inv.rclCodigo}|${inv.rclNivel}|${inv.rclSubnivel}`;
    if (!articulosPorSubPosicion.has(clave)) articulosPorSubPosicion.set(clave, []);
    articulosPorSubPosicion.get(clave).push(inv.articulo);
  }

  const posicionRealPorArticulo = new Map(
    inventarioSlotting.map(f => [f.articulo, { pasillo: f.pasillo, columna: f.columna, nivel: f.nivel }]),
  );

  const resultado = [];
  for (const id of identidadLegacy) {
    if (id.estadoRcl !== 'asignado') continue;
    const nivelDestinoImportado = numeroANivelWms(id.mzNivel);
    if (nivelDestinoImportado == null) continue; // nivel fuera de N01-N05 -- no se puede comparar, no se asume nada

    const clave = `${id.rclCodigo}|${id.rclNivel}|${id.rclSubnivel}`;
    const articulos = articulosPorSubPosicion.get(clave) ?? [];
    const destinoImportado = { pasillo: id.mzPasillo, columna: id.mzColumna, nivel: nivelDestinoImportado };

    for (const articulo of articulos) {
      const destinoReal = posicionRealPorArticulo.get(articulo) ?? null;
      const coincide = destinoReal
        && destinoReal.pasillo === destinoImportado.pasillo
        && destinoReal.columna === destinoImportado.columna
        && destinoReal.nivel === destinoImportado.nivel;
      if (coincide) continue;

      resultado.push({
        articulo, rclCodigo: id.rclCodigo, rclNivel: id.rclNivel, rclSubnivel: id.rclSubnivel,
        destinoImportado, destinoReal,
      });
    }
  }
  // Sin destino real (nunca tuvo dónde vivir) primero -- más grave que "el destino cambió".
  return resultado.sort((a, b) => (a.destinoReal === null ? -1 : 0) - (b.destinoReal === null ? -1 : 0));
}
