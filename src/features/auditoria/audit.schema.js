/**
 * Forma de un registro de auditoría. Documentado aquí para que quien
 * implemente el backend real sepa exactamente qué columnas necesita
 * la tabla `auditoria` (ver /db/schema.sql).
 *
 * id                 number   autoincremental
 * usuarioId          number   FK a usuarios.id
 * usuarioNombre      string   snapshot del nombre (por si el usuario se borra/renombra después)
 * fecha              string   YYYY-MM-DD
 * hora               string   HH:MM:SS
 * ip                 string
 * accion             string   'movimiento' | 'login' | 'logout' | 'login_fallido' | 'cambio_password' | 'admin'
 * rackOrigen         string|null
 * nivelOrigen        string|null
 * rackDestino        string|null
 * nivelDestino       string|null
 * articulo           string|null
 * cantidad           number
 * tipoMovimiento      'individual' | 'cuerpo_completo' | null
 * estado             'Correcto' | 'Cancelado' | 'Deshecho'
 * observaciones      string
 */
export const ACCIONES = {
  MOVIMIENTO: 'movimiento',
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FALLIDO: 'login_fallido',
  CAMBIO_PASSWORD: 'cambio_password',
  ADMIN: 'admin',
};

export const ESTADOS = {
  CORRECTO: 'Correcto',
  CANCELADO: 'Cancelado',
  DESHECHO: 'Deshecho',
};
