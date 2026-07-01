import { storage } from '../services/storage.local.js';
import { ROLES } from './roles.js';

/**
 * Hash de contraseña con SHA-256 + salt vía Web Crypto API.
 * ADVERTENCIA: esto es un hash del lado del cliente para el modo demo
 * (sin backend). Cuando exista un servidor real, el hash de contraseñas
 * debe hacerse en el servidor con bcrypt/argon2, nunca en el navegador.
 * La firma de hashPassword() se mantiene igual para no tocar quien la llama.
 */
async function hashPassword(password, salt = 'wms-salt-v1') {
  const enc = new TextEncoder().encode(password + salt);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_KEY = 'wms_session';

async function seedUsuariosDemo() {
  const existentes = await storage.getAll('usuarios');
  if (existentes.length > 0) return;
  const demo = [
    { nombre: 'Ana Administradora', usuario: 'admin', password: 'admin123', rol: ROLES.ADMIN },
    { nombre: 'Sofía Supervisora', usuario: 'supervisor', password: 'super123', rol: ROLES.SUPERVISOR },
    { nombre: 'Óscar Operador', usuario: 'operador', password: 'oper123', rol: ROLES.OPERADOR },
    { nombre: 'Lucía Lectura', usuario: 'lectura', password: 'lect123', rol: ROLES.LECTURA },
  ];
  for (const u of demo) {
    const password_hash = await hashPassword(u.password);
    await storage.insert('usuarios', {
      nombre: u.nombre, usuario: u.usuario, password_hash, rol: u.rol,
      activo: true, creado_en: new Date().toISOString(),
    });
  }
}

async function obtenerIP() {
  // En el navegador no hay forma confiable de obtener la IP real sin un
  // servicio externo o sin que el backend la reporte (req.ip en el server).
  // Se deja el campo listo; el backend real debe completarlo.
  return 'no-disponible-en-cliente';
}

export const authService = {
  async init() {
    await seedUsuariosDemo();
  },

  async login(usuario, password) {
    const ip = await obtenerIP();
    const usuarios = await storage.getAll('usuarios');
    const found = usuarios.find(u => u.usuario === usuario);
    const hash = await hashPassword(password);
    const exitoso = !!found && found.activo && found.password_hash === hash;

    await storage.insert('intentos_login', {
      usuario, ip, fecha_hora: new Date().toISOString(), exitoso,
    });

    if (!exitoso) {
      throw new Error(!found ? 'Usuario no encontrado' : (!found.activo ? 'Usuario inactivo' : 'Contraseña incorrecta'));
    }

    const sesion = {
      usuarioId: found.id, nombre: found.nombre, usuario: found.usuario,
      rol: found.rol, inicio: new Date().toISOString(), ip,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
    await storage.insert('sesiones', { usuario_id: found.id, ip, inicio: sesion.inicio, fin: null, resultado: 'activa' });
    return sesion;
  },

  async logout() {
    const s = this.getSesion();
    localStorage.removeItem(SESSION_KEY);
    if (s) {
      const sesiones = await storage.find('sesiones', r => r.usuario_id === s.usuarioId && r.fin === null);
      const ultima = sesiones[sesiones.length - 1];
      if (ultima) await storage.update('sesiones', ultima.id, { fin: new Date().toISOString(), resultado: 'cerrada' });
    }
  },

  getSesion() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  async cambiarPassword(usuarioId, nuevaPassword) {
    const password_hash = await hashPassword(nuevaPassword);
    return storage.update('usuarios', usuarioId, { password_hash });
  },

  async listarUsuarios() {
    const usuarios = await storage.getAll('usuarios');
    return usuarios.map(({ password_hash, ...resto }) => resto); // nunca exponer el hash a la UI
  },

  async crearUsuario({ nombre, usuario, password, rol }) {
    const password_hash = await hashPassword(password);
    return storage.insert('usuarios', { nombre, usuario, password_hash, rol, activo: true, creado_en: new Date().toISOString() });
  },

  async cambiarEstado(usuarioId, activo) {
    return storage.update('usuarios', usuarioId, { activo });
  },
};
