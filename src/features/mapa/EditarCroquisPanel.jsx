import { useEffect, useState } from 'react';
import { configMapaService } from '../../shared/services/configMapa.service.js';
import ModalBase from '../../shared/components/ModalBase.jsx';

const TEMAS = [
  { id: 'claro', label: 'Claro', swatch: ['#F7F4EC', '#15454A'] },
  { id: 'oscuro', label: 'Oscuro', swatch: ['#14201F', '#3FA7AC'] },
  { id: 'alto_contraste', label: 'Alto contraste', swatch: ['#FFFFFF', '#0B5394'] },
];

export default function EditarCroquisPanel({ sesion, onCerrar }) {
  const [config, setConfig] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { configMapaService.obtener().then(setConfig); }, []);

  async function aplicar(cambios) {
    setGuardando(true);
    const nuevo = { ...config, ...cambios };
    setConfig(nuevo);
    await configMapaService.actualizar({ ...cambios, usuarioId: sesion.usuarioId });
    window.dispatchEvent(new CustomEvent('mapa:config-cambiada'));
    setGuardando(false);
  }

  return (
    <ModalBase titulo="Editar croquis" onCerrar={onCerrar} maxWidth={460}>
      <p style={{ fontSize: 12, color: '#6E7A72', marginBottom: 20 }}>
        Estos cambios se ven en el mapa para todos los que lo abran (se aplican al instante si ya lo tenés abierto).
      </p>

      {!config ? (
        <p style={{ textAlign: 'center', color: '#9A9684', padding: 24 }}>Cargando…</p>
      ) : (
        <>
          <div style={{ marginBottom: 22 }}>
            <div style={sectionTitle}>Tema de colores</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {TEMAS.map(t => (
                <button
                  key={t.id}
                  onClick={() => aplicar({ tema: t.id })}
                  disabled={guardando}
                  style={{
                    ...temaBtnStyle,
                    borderColor: config.tema === t.id ? '#15454A' : '#E0DACE',
                    boxShadow: config.tema === t.id ? '0 0 0 2px rgba(21,69,74,.15)' : 'none',
                  }}
                >
                  <span style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', width: 40, height: 20 }}>
                    <span style={{ flex: 1, background: t.swatch[0] }} />
                    <span style={{ flex: 1, background: t.swatch[1] }} />
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={sectionTitle}>Orientación del mapa</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ id: 'horizontal', label: '↔ Horizontal' }, { id: 'vertical', label: '↕ Vertical' }].map(o => (
                <button
                  key={o.id}
                  onClick={() => aplicar({ orientacion: o.id })}
                  disabled={guardando}
                  style={{
                    ...orientBtnStyle,
                    background: config.orientacion === o.id ? '#15454A' : '#F1EFE8',
                    color: config.orientacion === o.id ? '#fff' : '#6E7A72',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </ModalBase>
  );
}

const sectionTitle = { fontSize: 12, fontWeight: 700, color: '#1C3A3E', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.3px' };
const temaBtnStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: '#fff', border: '2px solid #E0DACE', borderRadius: 10, padding: '10px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const orientBtnStyle = { flex: 1, border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
