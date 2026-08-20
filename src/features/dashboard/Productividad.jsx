import { useEffect, useMemo, useState } from 'react';
import { obtenerWarehouseModel } from '../../domain/crearWarehouseModel.js';
import { calcularMetricasPorUsuario, agruparPor, calcularMetricasDespachoPorTrabajador, calcularMetricasMigracionPorPersona } from '../../domain/metricasProductividad.js';
import { despachoService } from '../../shared/services/despacho.service.js';
import { migracionSlotsService } from '../../shared/services/migracionSlots.service.js';
import { mensajesService } from '../../shared/services/mensajes.service.js';
import Skeleton from '../../ui/motion/Skeleton.jsx';
import AnimatedCard from '../../ui/motion/AnimatedCard.jsx';
import KpiValor from '../../ui/motion/KpiValor.jsx';

/**
 * Cero queries propias, cero fórmulas propias (G1e) -- `calcularMetricasPorUsuario`/
 * `agruparPor` viven en src/domain/metricasProductividad.js (con test), y los
 * movimientos salen de WarehouseModel.movimientos() (auditService envuelto
 * ahí) en vez de llamar a auditService directo. Mismo comportamiento que
 * antes: una sola carga al montar, sin suscripción Realtime (la auditoría no
 * está entre las tablas que el modelo escucha hoy -- ver DOMAIN.md).
 *
 * Ampliado 2026-08-19 (pedido explícito el día del lanzamiento real: "medir
 * métricas de trabajo") con dos fuentes MÁS, cada una con su propia consulta
 * directa a su servicio (no son parte del dominio de ocupación de
 * WarehouseModel, no correspondía forzarlas ahí): tareas de Despacho
 * (`despachoService.listarTodasLasTareas()`) y traslados de la migración
 * RCL→MZ (`migracionSlotsService.listar()`, ya trae TODOS los slots sin
 * filtrar por estado). Los nombres de persona se resuelven con
 * `mensajesService.listarContactos()` (el RPC angosto `perfiles_para_mensajeria`)
 * en vez de `usuariosService.listar()` -- ese sigue restringido a
 * Administrador, y este dashboard lo ve también Supervisor/Lectura.
 */
export default function Productividad() {
  const [movimientos, setMovimientos] = useState(null); // null = cargando (para el skeleton)
  const [tareasDespacho, setTareasDespacho] = useState(null);
  const [slotsMigracion, setSlotsMigracion] = useState(null);
  const [nombresPorId, setNombresPorId] = useState(new Map());

  useEffect(() => {
    (async () => {
      const modelo = obtenerWarehouseModel(null);
      const [, tareas, slots, contactos] = await Promise.all([
        modelo.cargarMovimientos(),
        despachoService.listarTodasLasTareas(),
        migracionSlotsService.listar(),
        mensajesService.listarContactos(),
      ]);
      setMovimientos(modelo.movimientos().filter(r => r.accion === 'movimiento'));
      setTareasDespacho(tareas);
      setSlotsMigracion([...slots.values()]);
      setNombresPorId(new Map(contactos.map(c => [c.id, c.apodo || c.nombre])));
    })();
  }, []);

  const cargando = movimientos === null || tareasDespacho === null || slotsMigracion === null;
  const lista = movimientos ?? [];
  const porUsuario = useMemo(() => calcularMetricasPorUsuario(lista), [lista]);
  const porDia = useMemo(() => agruparPor(lista, m => m.fecha), [lista]);
  const porHora = useMemo(() => agruparPor(lista, m => m.hora.slice(0, 2) + ':00'), [lista]);
  const hayDatos = lista.length > 0;

  const resolverNombre = useMemo(() => id => nombresPorId.get(id) ?? 'Desconocido', [nombresPorId]);
  const porTrabajadorDespacho = useMemo(() => calcularMetricasDespachoPorTrabajador(tareasDespacho ?? []), [tareasDespacho]);
  const porPersonaMigracion = useMemo(() => calcularMetricasMigracionPorPersona(slotsMigracion ?? [], resolverNombre), [slotsMigracion, resolverNombre]);

  if (cargando) {
    return (
      <div className="panel">
        <h2>Dashboard de productividad</h2>
        <div className="dash-g2" style={{ marginTop: 16 }}>
          <Skeleton indice={0} alto={110} />
          <Skeleton indice={1} alto={110} />
        </div>
        <Skeleton indice={2} alto={160} className="skeleton--tabla" />
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Dashboard de productividad</h2>

      {!hayDatos && (
        <div className="pend-banner">
          <i className="ti ti-database-off" /> Todavía no hay movimientos registrados en esta sesión. Las métricas se llenan a medida que se usa el mapa.
        </div>
      )}

      <div className="dash-g2" style={{ marginTop: 16 }}>
        <AnimatedCard className="dc">
          <h3>Movimientos por día</h3>
          <ul className="lista-simple">
            {Object.entries(porDia).map(([k, v]) => <li key={k}><span>{k}</span><strong><KpiValor valor={v} /></strong></li>)}
            {!hayDatos && <li className="muted">Sin datos</li>}
          </ul>
        </AnimatedCard>
        <AnimatedCard className="dc">
          <h3>Movimientos por hora</h3>
          <ul className="lista-simple">
            {Object.entries(porHora).map(([k, v]) => <li key={k}><span>{k}</span><strong><KpiValor valor={v} /></strong></li>)}
            {!hayDatos && <li className="muted">Sin datos</li>}
          </ul>
        </AnimatedCard>
      </div>

      <h3 style={{ marginTop: 24 }}>Ranking de usuarios</h3>
      <table className="tabla">
        <thead>
          <tr><th>#</th><th>Usuario</th><th>Movimientos</th><th>Tiempo prom. entre mov.</th><th>Errores</th><th>Deshechos</th><th>Productividad</th><th>Última actividad</th></tr>
        </thead>
        <tbody>
          {porUsuario.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin datos aún</td></tr>}
          {porUsuario.map((u, i) => (
            <tr key={u.usuario}>
              <td>{i + 1}</td><td>{u.usuario}</td>
              <td><span className="chip"><KpiValor valor={u.movimientos} /></span></td>
              <td><span className="chip chip--tenue">{u.tiempoPromedio}</span></td>
              <td><span className={`chip ${u.errores > 0 ? 'chip--warn' : ''}`}>{u.errores}</span></td>
              <td><span className={`chip ${u.deshechos > 0 ? 'chip--warn' : ''}`}>{u.deshechos}</span></td>
              <td><span className="estado-badge estado-badge--ok"><KpiValor valor={u.productividad} formatear={v => `${Math.round(v)}%`} /></span></td>
              <td>{u.ultimaActividad ? new Date(u.ultimaActividad).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Despacho -- trabajo por operador</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 10 }}>
        Los operadores de piso son un número, sin cuenta propia -- este ranking mide el trabajo de cada NÚMERO, no de una persona identificada.
      </p>
      <table className="tabla">
        <thead>
          <tr><th>#</th><th>Operador</th><th>Tareas completadas</th><th>Vaciar</th><th>Recolectar</th><th>Canceladas</th><th>Tiempo prom. entre tareas</th><th>Última actividad</th></tr>
        </thead>
        <tbody>
          {porTrabajadorDespacho.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin datos aún</td></tr>}
          {porTrabajadorDespacho.map((t, i) => (
            <tr key={t.trabajadorNumero}>
              <td>{i + 1}</td><td>Operador {t.trabajadorNumero}</td>
              <td><span className="chip"><KpiValor valor={t.completadas} /></span></td>
              <td>{t.vaciar}</td><td>{t.recolectar}</td>
              <td><span className={`chip ${t.canceladas > 0 ? 'chip--warn' : ''}`}>{t.canceladas}</span></td>
              <td><span className="chip chip--tenue">{t.tiempoPromedio}</span></td>
              <td>{t.ultimaActividad ? new Date(t.ultimaActividad).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Migración RCL→MZ -- trabajo por persona</h3>
      <table className="tabla">
        <thead>
          <tr><th>#</th><th>Usuario</th><th>Iniciados</th><th>Bloqueados</th><th>Confirmados</th><th>Aprobados</th><th>Total acciones</th><th>Última actividad</th></tr>
        </thead>
        <tbody>
          {porPersonaMigracion.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sin datos aún</td></tr>}
          {porPersonaMigracion.map((u, i) => (
            <tr key={u.usuario}>
              <td>{i + 1}</td><td>{u.usuario}</td>
              <td>{u.iniciados}</td><td>{u.bloqueados}</td><td>{u.confirmados}</td><td>{u.aprobados}</td>
              <td><span className="chip"><KpiValor valor={u.totalAcciones} /></span></td>
              <td>{u.ultimaActividad ? new Date(u.ultimaActividad).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
