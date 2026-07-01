import { storage } from '../services/storage.local.js';
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
  async registrarMovimiento({ usuarioId, usuarioNombre, ip, desde, hacia, articulo, tipoMovimiento, cantidad = 1 }) {
    const origen = parsearUbicacion(desde);
    const destino = parsearUbicacion(hacia);
    return this.registrar({
      usuarioId, usuarioNombre, ip,
      accion: ACCIONES.MOVIMIENTO,
      estado: ESTADOS.CORRECTO,
      rackOrigen: origen.rack, nivelOrigen: origen.nivel,
      rackDestino: destino.rack, nivelDestino: destino.nivel,
      articulo, cantidad,
      tipoMovimiento: tipoMovimiento === 'cuerpo' ? 'cuerpo_completo' : 'individual',
      observaciones: '',
    });
  },

  async listar(filtros = {}) {
    const todos = await storage.getAll('auditoria');
    return todos.filter(r => {
      if (filtros.usuarioNombre && r.usuarioNombre !== filtros.usuarioNombre) return false;
      if (filtros.fecha && r.fecha !== filtros.fecha) return false;
      if (filtros.rack && r.rackOrigen !== filtros.rack && r.rackDestino !== filtros.rack) return false;
      if (filtros.articulo && String(r.articulo || '').indexOf(filtros.articulo) === -1) return false;
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
};
