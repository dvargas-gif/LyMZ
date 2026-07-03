/**
 * Contrato que debe cumplir cualquier adapter de persistencia.
 * Hoy lo implementa storage.local.js (localStorage). El día que exista
 * backend real, se crea storage.api.js con la MISMA firma y se cambia
 * un solo import en cada servicio (auth.service.js / audit.service.js).
 * Nada del resto de la app necesita saber de dónde vienen los datos.
 */
export class StorageInterface {
  async getAll(coleccion) { throw new Error('no implementado'); }
  async insert(coleccion, registro) { throw new Error('no implementado'); }
  async update(coleccion, id, cambios) { throw new Error('no implementado'); }
  async find(coleccion, predicado) { throw new Error('no implementado'); }
}
