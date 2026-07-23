import { useEffect, useState } from 'react';
import { usuariosService } from './usuarios.service.js';
import { miPerfilService } from './miPerfil.service.js';
import { permisosRolService } from '../auth/permisosRol.service.js';
import { ROLES, TODAS_LAS_ACCIONES, ETIQUETAS_ACCIONES, puede } from '../auth/roles.js';
import { useAuth } from '../auth/AuthContext.jsx';

const TODOS_LOS_ROLES = Object.values(ROLES);

function TablaUsuarios({ sesion }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [nombreTemp, setNombreTemp] = useState('');
  const [editandoApodoId, setEditandoApodoId] = useState(null);
  const [apodoTemp, setApodoTemp] = useState('');

  async function cargar() {
    setCargando(true);
    setUsuarios(await usuariosService.listar());
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function handleRol(u, rol) {
    setGuardandoId(u.id);
    await usuariosService.actualizarRol(u.id, rol);
    setUsuarios(prev => prev.map(x => (x.id === u.id ? { ...x, rol } : x)));
    setGuardandoId(null);
  }

  async function handleActivo(u) {
    setGuardandoId(u.id);
    await usuariosService.actualizarActivo(u.id, !u.activo);
    setUsuarios(prev => prev.map(x => (x.id === u.id ? { ...x, activo: !x.activo } : x)));
    setGuardandoId(null);
  }

  function iniciarEdicionNombre(u) {
    setEditandoId(u.id);
    setNombreTemp(u.nombre);
  }

  async function confirmarNombre(u) {
    const nombre = nombreTemp.trim();
    setEditandoId(null);
    if (!nombre || nombre === u.nombre) return;
    setGuardandoId(u.id);
    await usuariosService.actualizarNombre(u.id, nombre);
    setUsuarios(prev => prev.map(x => (x.id === u.id ? { ...x, nombre } : x)));
    setGuardandoId(null);
  }

  function iniciarEdicionApodo(u) {
    setEditandoApodoId(u.id);
    setApodoTemp(u.apodo || '');
  }

  async function confirmarApodo(u) {
    const apodo = apodoTemp.trim();
    setEditandoApodoId(null);
    if (apodo === (u.apodo || '')) return;
    setGuardandoId(u.id);
    // Función propia (auth.uid()) — por eso esta celda solo es editable en TU fila.
    await miPerfilService.actualizarApodo(apodo);
    setUsuarios(prev => prev.map(x => (x.id === u.id ? { ...x, apodo } : x)));
    setGuardandoId(null);
  }

  if (cargando) return <p style={{ textAlign: 'center', color: 'var(--texto-placeholder)', padding: 24 }}>Cargando…</p>;

  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Cómo me saluda</th>
          <th>Rol</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {usuarios.map(u => (
          <tr key={u.id} style={{ opacity: guardandoId === u.id ? 0.5 : 1 }}>
            <td>
              {editandoId === u.id ? (
                <input
                  autoFocus
                  value={nombreTemp}
                  onChange={e => setNombreTemp(e.target.value)}
                  onBlur={() => confirmarNombre(u)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { e.stopPropagation(); setEditandoId(null); }
                  }}
                  style={nombreInputStyle}
                />
              ) : (
                <span
                  onClick={() => iniciarEdicionNombre(u)}
                  title="Tocá para editar el nombre"
                  style={{ cursor: 'pointer', borderBottom: '1px dotted var(--borde-medio)' }}
                >
                  {u.nombre} <i className="ti ti-pencil" style={{ fontSize: 11, color: 'var(--texto-placeholder)' }} />
                </span>
              )}
            </td>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.email}</td>
            <td>
              {u.id !== sesion.usuarioId ? (
                <span style={{ color: u.apodo ? 'inherit' : 'var(--borde-medio)' }}>{u.apodo || '—'}</span>
              ) : editandoApodoId === u.id ? (
                <input
                  autoFocus
                  placeholder="ej. Amo supremo"
                  value={apodoTemp}
                  onChange={e => setApodoTemp(e.target.value)}
                  onBlur={() => confirmarApodo(u)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { e.stopPropagation(); setEditandoApodoId(null); }
                  }}
                  style={nombreInputStyle}
                />
              ) : (
                <span
                  onClick={() => iniciarEdicionApodo(u)}
                  title="Tocá para cambiar cómo te saluda al entrar"
                  style={{ cursor: 'pointer', borderBottom: '1px dotted var(--borde-medio)', color: u.apodo ? 'inherit' : 'var(--texto-placeholder)', fontStyle: u.apodo ? 'normal' : 'italic' }}
                >
                  {u.apodo || 'sin definir'} <i className="ti ti-pencil" style={{ fontSize: 11, color: 'var(--texto-placeholder)' }} />
                </span>
              )}
            </td>
            <td>
              <select value={u.rol} onChange={e => handleRol(u, e.target.value)} disabled={guardandoId === u.id} style={selectStyle}>
                {TODOS_LOS_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </td>
            <td>
              <button onClick={() => handleActivo(u)} disabled={guardandoId === u.id} style={{ ...toggleBtnStyle, background: u.activo ? 'var(--verde-tenue)' : 'var(--rojo-tenue)', color: u.activo ? 'var(--green)' : 'var(--red)' }}>
                {u.activo ? 'Activo' : 'Inactivo'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Matriz de permisos por rol (2026-07-23, pedido explícito: "dar todos los
 * permisos y acciones por separado" en vez de un dropdown con 4 opciones
 * fijas). El modelo sigue siendo por ROL, no por usuario -- cada checkbox
 * es "¿el rol X puede hacer Y?", ver permisos_rol/roles.js.
 *
 * No guarda estado propio de la matriz: lee `puede()` en cada render (la
 * misma función que usa el resto de la app) y confía en que
 * `refrescarPermisos()` (AuthContext) haga que este componente vuelva a
 * renderizar con el valor ya actualizado después de guardar -- así nunca
 * puede quedar desincronizada de lo que en verdad usa el resto de la UI.
 */
function MatrizPermisos() {
  const { refrescarPermisos } = useAuth();
  const [pendientes, setPendientes] = useState(new Set());
  const [error, setError] = useState('');

  async function alternar(rol, accion) {
    const clave = `${rol}|${accion}`;
    setError('');
    setPendientes(prev => new Set(prev).add(clave));
    try {
      await permisosRolService.actualizar(rol, accion, !puede(rol, accion));
      await refrescarPermisos();
    } catch (err) {
      setError(`No se pudo guardar -- ¿ya se aplicó el SQL de permisos por rol (2026-07-23_permisos_rol.sql)? (${err.message || err})`);
    } finally {
      setPendientes(prev => { const s = new Set(prev); s.delete(clave); return s; });
    }
  }

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Qué puede hacer cada rol en la interfaz -- cambia con efecto inmediato para todos los que tengan ese rol.
        Las acciones operativas más sensibles (migración, despacho, eliminar artículos) además están reforzadas de
        forma fija en la base de datos: desmarcarlas acá oculta el botón, pero no cambia ese refuerzo.
      </p>
      {error && <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla">
          <thead>
            <tr>
              <th>Acción</th>
              {TODOS_LOS_ROLES.map(r => <th key={r} style={{ textAlign: 'center' }}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {TODAS_LAS_ACCIONES.map(accion => (
              <tr key={accion}>
                <td>{ETIQUETAS_ACCIONES[accion]}</td>
                {TODOS_LOS_ROLES.map(rol => {
                  const clave = `${rol}|${accion}`;
                  return (
                    <td key={rol} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={puede(rol, accion)}
                        disabled={pendientes.has(clave)}
                        onChange={() => alternar(rol, accion)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Usuarios y permisos (2026-07-23, antes "Permisos de usuarios") -- pasó de
 * ser un ModalBase a su propia página de navegación (pedido explícito: "no
 * sea un modal para poder dar todos los permisos y acciones por
 * separado") -- acá adentro entra la matriz de permisos editable, que
 * necesita más aire del que da un modal angosto.
 */
export default function UsuariosPanel({ sesion }) {
  return (
    <div className="panel">
      <h2>Usuarios y permisos</h2>
      <p className="muted">Cambiar el rol o desactivar una cuenta tiene efecto inmediato.</p>
      <TablaUsuarios sesion={sesion} />

      <h3 style={{ marginTop: 28 }}>Permisos por rol</h3>
      <MatrizPermisos />
    </div>
  );
}

const selectStyle = { fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--borde-input)', fontFamily: 'inherit' };
const nombreInputStyle = { fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent)', fontFamily: 'inherit', width: '100%' };
const toggleBtnStyle = { border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' };
