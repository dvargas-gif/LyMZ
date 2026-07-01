import { StorageInterface } from './storage.interface.js';

/**
 * Adapter de desarrollo: persiste en localStorage como si fueran tablas SQL.
 * Cada "colección" es una key de localStorage con un array JSON.
 * Los IDs son incrementales por colección (simulando autoincrement).
 *
 * IMPORTANTE: la auditoría nunca se borra físicamente desde esta capa;
 * no existe un método delete() a propósito.
 */
class LocalStorageAdapter extends StorageInterface {
  _key(coleccion) { return `wms_${coleccion}`; }

  async getAll(coleccion) {
    const raw = localStorage.getItem(this._key(coleccion));
    return raw ? JSON.parse(raw) : [];
  }

  async _save(coleccion, arr) {
    localStorage.setItem(this._key(coleccion), JSON.stringify(arr));
  }

  async insert(coleccion, registro) {
    const arr = await this.getAll(coleccion);
    const nextId = arr.length ? Math.max(...arr.map(r => r.id)) + 1 : 1;
    const nuevo = { id: nextId, ...registro };
    arr.push(nuevo);
    await this._save(coleccion, arr);
    return nuevo;
  }

  async update(coleccion, id, cambios) {
    const arr = await this.getAll(coleccion);
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) return null;
    arr[idx] = { ...arr[idx], ...cambios };
    await this._save(coleccion, arr);
    return arr[idx];
  }

  async find(coleccion, predicado) {
    const arr = await this.getAll(coleccion);
    return arr.filter(predicado);
  }
}

// Instancia única compartida por toda la app.
export const storage = new LocalStorageAdapter();
