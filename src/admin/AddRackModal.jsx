import { useEffect, useMemo, useState } from 'react';
import { pasillosConfigService } from '../services/pasillosConfig.service.js';
import { auditService } from '../audit/audit.service.js';
import { ACCIONES } from '../audit/audit.schema.js';
import ModalBase from '../components/ModalBase.jsx';

// Mismo listado que PAS_LR en el mapa legacy — los pasillos son fijos (8),
// "Añadir rack" extiende uno existente, no crea pasillos nuevos.
const PASILLOS = ['MZ01', 'MZ02', 'MZ03', 'MZ04', 'MZ05', 'MZ06', 'MZ07', 'MZ08'];
// Mismo valor de fábrica que MAXCOL_MZ01/36 en el mapa legacy — se usa
// cuando un pasillo todavía no tiene fila en pasillos_config (nunca se extendió).
const maxColPorDefecto = pasillo => (pasillo === 'MZ01' ? 27 : 36);
const TECHO_ABSOLUTO = 36; // COLS del mapa legacy va de 1 a 36 — no se puede ir más allá sin tocar esa numeración

/**
 * "Añadir rack" real: sube el límite de columnas de un pasillo (guardado en
 * `pasillos_config`) para que el mapa dibuje las columnas nuevas como slots
 * vacíos — no crea artículos ni toca los que ya existen. Al confirmar,
 * dispara el mismo evento que ya usa EditarCroquisPanel para forzar que el
 * mapa recargue y lea la estructura nueva.
 */
export default function AddRackModal({ sesion, onCerrar }) {
  const [config, setConfig] = useState([]);
  const [pasillo, setPasillo] = useState('MZ01');
  const [hasta, setHasta] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  useEffect(() => { pasillosConfigService.listar().then(c => { setConfig(c); setCargando(false); }); }, []);

  const actual = useMemo(() => {
    const fila = config.find(c => c.pasillo === pasillo);
    return fila ? fila.max_columna : maxColPorDefecto(pasillo);
  }, [config, pasillo]);

  const alTope = actual >= TECHO_ABSOLUTO;

  async function confirmar(e) {
    e.preventDefault();
    setError('');
    setExito('');
    const nueva = parseInt(hasta, 10);
    if (!Number.isFinite(nueva) || nueva <= actual) {
      setError(`Tiene que ser un número mayor a ${actual} (la columna actual hasta donde llega ${pasillo}).`);
      return;
    }
    if (nueva > TECHO_ABSOLUTO) {
      setError(`El mapa no soporta más de C0${TECHO_ABSOLUTO} por pasillo todavía (cambiaría la numeración de toda la grilla).`);
      return;
    }
    setGuardando(true);
    try {
      await pasillosConfigService.extender({ pasillo, maxColumna: nueva, usuarioId: sesion.usuarioId });
      await auditService.registrar({
        usuarioId: sesion.usuarioId, usuarioNombre: sesion.nombre, ip: sesion.ip,
        accion: ACCIONES.ADMIN,
        rackDestino: `${pasillo}-C${String(nueva).padStart(3, '0')}`,
        observaciones: `Añadir rack: extendió ${pasillo} de C${String(actual).padStart(3, '0')} a C${String(nueva).padStart(3, '0')}`,
      });
      setConfig(prev => [...prev.filter(c => c.pasillo !== pasillo), { pasillo, max_columna: nueva }]);
      setExito(`✓ ${pasillo} ahora llega hasta C${String(nueva).padStart(3, '0')}. El mapa se está actualizando…`);
      setHasta('');
      window.dispatchEvent(new CustomEvent('mapa:config-cambiada')); // mismo mecanismo que EditarCroquisPanel: recarga el iframe
    } catch (err) {
      setError(`No se pudo guardar: ${err.message || err}`);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalBase titulo="🧱 Añadir rack (extender pasillo)" onCerrar={onCerrar} maxWidth={440}>
      <p style={{ fontSize: 12, color: '#6E7A72', marginBottom: 18 }}>
        Sube el límite de columnas de un pasillo — las columnas nuevas aparecen vacías en el mapa,
        listas para usarse. No mueve ni borra ningún artículo existente.
      </p>

      {cargando ? (
        <p style={{ textAlign: 'center', color: '#9A9684', padding: 24 }}>Cargando…</p>
      ) : (
        <form onSubmit={confirmar}>
          <label style={labelStyle}>Pasillo</label>
          <select value={pasillo} onChange={e => { setPasillo(e.target.value); setHasta(''); setError(''); setExito(''); }} style={selectStyle}>
            {PASILLOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <p style={{ fontSize: 13, color: '#1C3A3E', margin: '12px 0' }}>
            Columna actual: <b>hasta C{String(actual).padStart(3, '0')}</b>
            {alTope && <span style={{ color: '#D08A1E' }}> — ya está al máximo que soporta el mapa (C036).</span>}
          </p>

          {!alTope && (
            <>
              <label style={labelStyle}>Extender hasta columna (máx. {TECHO_ABSOLUTO})</label>
              <input
                type="number" min={actual + 1} max={TECHO_ABSOLUTO}
                value={hasta} onChange={e => setHasta(e.target.value)}
                placeholder={`ej. ${TECHO_ABSOLUTO}`}
                style={inputStyle}
              />
              <p style={{ fontSize: 11.5, color: '#9A9684', margin: '6px 0 0' }}>
                Se van a crear las columnas C{String(actual + 1).padStart(3, '0')} a C{String(hasta || TECHO_ABSOLUTO).padStart(3, '0')} como slots vacíos.
              </p>
            </>
          )}

          {error && <p style={{ color: '#C0392B', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
          {exito && <p style={{ color: '#1D9E75', fontSize: 12.5, marginTop: 10 }}>{exito}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="submit" className="btn-primary" disabled={alTope || guardando || !hasta}>
              {guardando ? 'Extendiendo…' : `Extender ${pasillo}`}
            </button>
            <button type="button" className="btn-secondary" onClick={onCerrar}>Cerrar</button>
          </div>
        </form>
      )}
    </ModalBase>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 700, color: '#1C3A3E', display: 'block', marginBottom: 6 };
const selectStyle = { fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontFamily: 'inherit', width: '100%' };
const inputStyle = { fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid #DADCE0', fontFamily: 'inherit', width: '100%' };
