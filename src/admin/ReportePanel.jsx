import { useEffect, useMemo, useState } from 'react';
import { reporteService } from '../services/reporte.service.js';
import { colorDeClase } from '../constants/coloresArticulo.js';

export default function ReportePanel({ onCerrar, escenario = null }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [actualizadoEn, setActualizadoEn] = useState(null);

  async function cargar() {
    const datos = await reporteService.obtener(escenario?.id ?? null);
    setFilas(datos);
    setActualizadoEn(new Date());
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    const desuscribir = reporteService.suscribirCambios(() => cargar(), escenario?.id ?? null);
    return desuscribir;
  }, [escenario?.id]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(f =>
      f.articulo.toLowerCase().includes(q) ||
      (f.descripcion || '').toLowerCase().includes(q) ||
      f.pasillo.toLowerCase().includes(q)
    );
  }, [filas, busqueda]);

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            {escenario ? `🧪 Reporte de la sala — ${escenario.nombre}` : 'Reporte de posiciones'}
          </h2>
          <button onClick={onCerrar} className="btn-icon"><i className="ti ti-x" /></button>
        </div>
        <p style={{ fontSize: 12, color: '#6E7A72', marginBottom: 4 }}>
          {escenario
            ? 'Datos exclusivos de esta sala — no incluye ni afecta al mapa real.'
            : 'Se actualiza solo cuando alguien mueve algo en el mapa real.'}
          {actualizadoEn && ` Última actualización: ${actualizadoEn.toLocaleTimeString()}.`}
        </p>

        <input
          placeholder="Buscar por artículo, descripción o pasillo…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ ...nombreInputStyle, margin: '12px 0' }}
        />

        {cargando ? (
          <p style={{ textAlign: 'center', color: '#9A9684', padding: 24 }}>Cargando…</p>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '55vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
                <tr style={{ textAlign: 'left', color: '#9A9684', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={thStyle}>Artículo</th>
                  <th style={thStyle}>Descripción</th>
                  <th style={thStyle}>Posición</th>
                  <th style={thStyle}>Rack actual</th>
                  <th style={thStyle}>Niveles a armar</th>
                  <th style={thStyle}>Clase</th>
                  <th style={thStyle}>Picks</th>
                  <th style={thStyle}>Consumo</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9A9684', padding: 20 }}>Sin resultados.</td></tr>
                )}
                {filtradas.map(f => (
                  <tr key={f.articulo} style={{ borderTop: '1px solid #F0EEE5' }}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.articulo}</td>
                    <td style={tdStyle}>{f.descripcion}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{f.pasillo}-C{String(f.columna).padStart(3, '0')}-{f.nivel}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{f.rack_actual || '—'}</td>
                    <td style={tdStyle}>{f.niveles_a_armar ?? '—'}</td>
                    <td style={tdStyle}>
                      {f.clase ? (
                        <span style={{ ...claseBadge, background: colorDeClase(f.clase, f.tipo) }}>
                          {f.tipo === 'CUERPO' ? 'CE' : f.clase}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={tdStyle}>{f.picks ?? '—'}</td>
                    <td style={tdStyle}>{f.consumo ?? '—'}</td>
                    <td style={tdStyle}>{f.movido && <span style={movidoBadge}>movido</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(28,58,62,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 };
const cardStyle = { background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 1040, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.35)' };
const nombreInputStyle = { fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid #DADCE0', fontFamily: 'inherit', width: '100%' };
const thStyle = { padding: '6px 8px', borderBottom: '1px solid #EAECEF' };
const tdStyle = { padding: '7px 8px' };
const movidoBadge = { fontSize: 10, fontWeight: 700, color: '#D08A1E', background: '#FAEEDA', padding: '2px 7px', borderRadius: 10 };
const claseBadge = { display: 'inline-block', minWidth: 22, textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 };
