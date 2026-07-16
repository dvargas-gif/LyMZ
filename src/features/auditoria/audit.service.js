import { storage } from '../../shared/services/storage.supabase.js';
import { supabase } from '../../shared/services/supabaseClient.js';
import { ACCIONES, ESTADOS } from './audit.schema.js';

function partirFechaHora(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

/**
 * Parsea el string "MZ01-C016-N02" (formato que ya usa el mapa legacy)
 * en {rack, nivel} para poblar las columnas separadas de auditoría.
 */
function parsearUbicacion(str) {
  if (!str) return { rack: null, nivel: null };
  const m = String(str).match(/^(MZ\d+-C\d+)-(N\d+|CUERPO.*)$/);
  if (!m) return { rack: str, nivel: null };
  return { rack: m[1], nivel: m[2] };
}

export const auditService = {
  /** Registro genérico — usado por login/logout/cambios administrativos. */
  async registrar({ usuarioId, usuarioNombre, ip, accion, estado = ESTADOS.CORRECTO, observaciones = '', ...resto }) {
    const { fecha, hora } = partirFechaHora(new Date().toISOString());
    return storage.insert('auditoria', {
      usuarioId, usuarioNombre, fecha, hora, ip, accion, estado, observaciones,
      rackOrigen: resto.rackOrigen ?? null,
      nivelOrigen: resto.nivelOrigen ?? null,
      rackDestino: resto.rackDestino ?? null,
      nivelDestino: resto.nivelDestino ?? null,
      articulo: resto.articulo ?? null,
      cantidad: resto.cantidad ?? 0,
      tipoMovimiento: resto.tipoMovimiento ?? null,
    });
  },

  /**
   * Registro específico de un movimiento del mapa de slotting.
   * Este es el método que llama SlottingFrame cuando recibe el postMessage
   * emitido por el hook agregado en mapa_editable_slotting.html.
   */
  async registrarMovimiento({ usuarioId, usuarioNombre, ip, desde, hacia, articulo, tipoMovimiento, cantidad = 1, estado = ESTADOS.CORRECTO }) {
    const origen = parsearUbicacion(desde);
    const destino = parsearUbicacion(hacia);
    return this.registrar({
      usuarioId, usuarioNombre, ip,
      accion: ACCIONES.MOVIMIENTO,
      estado,
      rackOrigen: origen.rack, nivelOrigen: origen.nivel,
      rackDestino: destino.rack, nivelDestino: destino.nivel,
      articulo, cantidad,
      tipoMovimiento: tipoMovimiento === 'cuerpo' ? 'cuerpo_completo' : 'individual',
      observaciones: '',
    });
  },

  /** Deshacer un movimiento — mismo registro que un movimiento normal, pero con estado "Deshecho". */
  async registrarDeshecho({ usuarioId, usuarioNombre, ip, desde, hacia, articulo }) {
    return this.registrarMovimiento({ usuarioId, usuarioNombre, ip, desde, hacia, articulo, estado: ESTADOS.DESHECHO });
  },

  async listar(filtros = {}) {
    const todos = await storage.getAll('auditoria');
    return todos.filter(r => {
      if (filtros.usuarioNombre && r.usuarioNombre !== filtros.usuarioNombre) return false;
      if (filtros.fecha && r.fecha !== filtros.fecha) return false;
      if (filtros.rack && r.rackOrigen !== filtros.rack && r.rackDestino !== filtros.rack) return false;
      if (filtros.articulo && !String(r.articulo || '').toLowerCase().includes(filtros.articulo.toLowerCase())) return false;
      if (filtros.tipoMovimiento && r.tipoMovimiento !== filtros.tipoMovimiento) return false;
      if (filtros.estado && r.estado !== filtros.estado) return false;
      if (filtros.accion && r.accion !== filtros.accion) return false;
      return true;
    }).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  },

  async recientes(n = 20) {
    const todos = await storage.getAll('auditoria');
    return todos.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)).slice(0, n);
  },

  /**
   * Página filtrada de auditoría -- a diferencia de listar() (trae TODA la
   * tabla y filtra en memoria; lo sigue usando Productividad.jsx, que
   * necesita el set completo para calcular agregados por usuario/día/hora),
   * esto filtra, ordena y pagina en el SERVIDOR: nunca descarga más que la
   * página pedida. Pensado para Historial.jsx y AuditoriaView.jsx, que solo
   * muestran una tabla y no agregan nada -- la auditoría es la única tabla
   * del proyecto sin techo natural (crece con cada login/movimiento), así
   * que era la candidata real a volverse lenta con el tiempo.
   *
   * `filtros.articulo` usa `ilike` (substring, igual que el filtro en
   * memoria que reemplaza) -- el resto son igualdad exacta, mismo criterio
   * que ya tenía listar().
   */
  async listarPaginado(filtros = {}, { pagina = 1, porPagina = 50 } = {}) {
    let query = supabase.from('auditoria').select('*', { count: 'exact' });
    if (filtros.usuarioNombre) query = query.eq('usuarioNombre', filtros.usuarioNombre);
    if (filtros.fecha) query = query.eq('fecha', filtros.fecha);
    // Comillas dobles (con el propio " escapado) -- sintaxis de PostgREST
    // para tratar el valor como literal, sin que una coma o paréntesis
    // tipeados en el input rompan o alteren la estructura del filtro .or().
    if (filtros.rack) {
      const rackEscapado = `"${String(filtros.rack).replace(/"/g, '\\"')}"`;
      query = query.or(`rackOrigen.eq.${rackEscapado},rackDestino.eq.${rackEscapado}`);
    }
    // Escapa los comodines propios de LIKE/ILIKE (%, _) y la barra de escape
    // -- si no, un código de artículo con "_" (convención común de SKU) hace
    // de comodín "cualquier carácter" y trae filas de más, y el resultado ya
    // no coincide con el de listar() (que hace un includes() literal, sin
    // comodines) usado para el export a Excel del mismo filtro.
    if (filtros.articulo) {
      const articuloEscapado = filtros.articulo.replace(/[\\%_]/g, m => `\\${m}`);
      query = query.ilike('articulo', `%${articuloEscapado}%`);
    }
    if (filtros.tipoMovimiento) query = query.eq('tipoMovimiento', filtros.tipoMovimiento);
    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.accion) query = query.eq('accion', filtros.accion);

    const desde = (pagina - 1) * porPagina;
    const { data, error, count } = await query
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .range(desde, desde + porPagina - 1);
    if (error) throw error;
    return { filas: data, total: count ?? 0 };
  },
};
