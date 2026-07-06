import { useEffect, useState } from 'react';
import { usuariosService } from './usuarios.service.js';
import { miPerfilService } from './miPerfil.service.js';
import { ROLES } from '../auth/roles.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

const TODOS_LOS_ROLES = Object.values(ROLES);

export default function UsuariosPanel({ sesion, onCerrar }) {
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

  return (
    <ModalBase titulo="Permisos de usuarios" onCerrar={onCerrar} maxWidth={640} maxHeight="80vh">
      <p style={{ fontSize: 12, color: 'var(--texto-tenue)', marginBottom: 16 }}>
        Cambiar el rol o desactivar una cuenta tiene efecto inmediato.
      </p>

      {cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--texto-placeholder)', padding: 24 }}>Cargando…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--texto-placeholder)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 8px' }}>Nombre</th>
                <th style={{ padding: '6px 8px' }}>Email</th>
                <th style={{ padding: '6px 8px' }}>Cómo me saluda</th>
                <th style={{ padding: '6px 8px' }}>Rol</th>
                <th style={{ padding: '6px 8px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--borde-sutil)', opacity: guardandoId === u.id ? 0.5 : 1 }}>
                  <td style={{ padding: '8px' }}>
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
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}>{u.email}</td>
                  <td style={{ padding: '8px' }}>
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
                  <td style={{ padding: '8px' }}>
                    <select value={u.rol} onChange={e => handleRol(u, e.target.value)} disabled={guardandoId === u.id} style={selectStyle}>
                      {TODOS_LOS_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button onClick={() => handleActivo(u)} disabled={guardandoId === u.id} style={{ ...toggleBtnStyle, background: u.activo ? 'var(--verde-tenue)' : 'var(--rojo-tenue)', color: u.activo ? 'var(--green)' : 'var(--red)' }}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </ModalBase>
  );
}

const selectStyle = { fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--borde-input)', fontFamily: 'inherit' };
const nombreInputStyle = { fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent)', fontFamily: 'inherit', width: '100%' };
const toggleBtnStyle = { border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' };
