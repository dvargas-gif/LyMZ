import { describe, it, expect, vi } from 'vitest';
import { crearWarehouseModel } from './crearWarehouseModel.js';
import { WarehouseSnapshotSchema } from './WarehouseSnapshot.js';

/**
 * `servicios` fake -- ningún test de este archivo toca red ni Supabase.
 * `suscribirCambios` guarda el callback para que el test lo dispare a mano
 * y simule un evento Realtime real, sin un canal real.
 */
function crearServiciosFake(estadoInicial) {
  let estado = estadoInicial;
  let callbackRealtime = null;
  return {
    servicios: {
      listarBase: () => Promise.resolve(estado.base ?? []),
      listarMovimientos: () => Promise.resolve(estado.movimientos ?? []),
      listarEliminados: () => Promise.resolve(estado.eliminados ?? []),
      listarDescripciones: () => Promise.resolve(estado.descripciones ?? []),
      listarBloqueos: () => Promise.resolve(estado.bloqueos ?? []),
      listarMovimientosHistoricos: () => Promise.resolve(estado.movimientosHistoricos ?? []),
      listarConfiguracionMapa: () => Promise.resolve(estado.configuracionMapa ?? { tema: 'claro', orientacion: 'horizontal' }),
      listarPasillosConfig: () => Promise.resolve(estado.pasillosConfig ?? []),
      listarEnBuffer: () => Promise.resolve(estado.enBuffer ?? []),
      suscribirCambios(callback) {
        callbackRealtime = callback;
        return () => { callbackRealtime = null; };
      },
    },
    // El test usa esto para "cambiar lo que hay en Supabase" y luego disparar el evento.
    actualizarEstado(nuevo) { estado = nuevo; },
    dispararEventoRealtime() { callbackRealtime?.({}); },
    tieneSuscripcionActiva() { return callbackRealtime !== null; },
  };
}

describe('crearWarehouseModel -- construcción desde fixtures', () => {
  it('carga posiciones, bloqueos y descripciones desde los servicios inyectados', async () => {
    const { servicios } = crearServiciosFake({
      base: [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL', consumo: 1, picks: 10 }],
      bloqueos: [{ rack_key: 'MZ02|5' }],
      descripciones: [{ articulo: 'A1', descripcion: 'Tornillo hex' }],
    });
    const modelo = await crearWarehouseModel({ servicios }).cargar();

    expect(modelo.posiciones()).toHaveLength(1);
    expect(modelo.posiciones()[0].articulo).toBe('A1');
    expect(modelo.bloqueos()).toEqual(['MZ02|5']);
    expect(modelo.estaBloqueado('MZ02|5')).toBe(true);
    expect(modelo.estaBloqueado('MZ01|1')).toBe(false);
    expect(modelo.descripcion('A1')).toBe('Tornillo hex');
    expect(modelo.descripcion('DESCONOCIDO')).toBe('Sin descripción disponible');
    expect(modelo.descripciones()).toEqual([{ articulo: 'A1', descripcion: 'Tornillo hex' }]); // sin el fallback -- lista cruda
  });

  it('un artículo con fila en migracion_buffer (F2) desaparece del rack -- enBuffer llega hasta racks()', async () => {
    const { servicios } = crearServiciosFake({
      base: [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL' }],
      enBuffer: ['A1'],
    });
    const modelo = await crearWarehouseModel({ servicios }).cargar();

    expect(modelo.posiciones()[0].enBuffer).toBe(true);
    expect(modelo.posiciones()[0].posicionActual).toBeNull();
    expect(modelo.racks().get('MZ01|1')).toBeUndefined(); // el rack queda vacío, agruparPorRack no tiene con qué agruparlo
  });

  it('configuracionMapa()/maxColumnas() -- nuevas fuentes globales (config_mapa, pasillos_config), no dependen de escenarioId', async () => {
    const { servicios } = crearServiciosFake({
      configuracionMapa: { tema: 'oscuro', orientacion: 'vertical' },
      pasillosConfig: [{ pasillo: 'MZ01', max_columna: 30 }, { pasillo: 'MZ02', max_columna: 36 }],
    });
    const modelo = await crearWarehouseModel({ servicios }).cargar();
    expect(modelo.configuracionMapa()).toEqual({ tema: 'oscuro', orientacion: 'vertical' });
    expect(modelo.maxColumnas()).toEqual({ MZ01: 30, MZ02: 36 });
  });

  it('configuracionMapa() usa el mismo fallback que mensajesMapa.js si config_mapa no tiene fila', async () => {
    const { servicios } = crearServiciosFake({});
    const modelo = await crearWarehouseModel({ servicios }).cargar();
    expect(modelo.configuracionMapa()).toEqual({ tema: 'claro', orientacion: 'horizontal' });
  });

  it('escenarioId viaja tal cual, sin transformarlo', async () => {
    const { servicios } = crearServiciosFake({ base: [] });
    const modelo = await crearWarehouseModel({ escenarioId: 42, servicios }).cargar();
    expect(modelo.escenarioId).toBe(42);
  });
});

describe('crearWarehouseModel -- derivados', () => {
  it('racks()/rack() agrupan las posiciones y ocupacionDeRack() usa las fórmulas portadas', async () => {
    const { servicios } = crearServiciosFake({
      base: [
        { articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL', consumo: 2.25, picks: 10 },
      ],
    });
    const modelo = await crearWarehouseModel({ servicios }).cargar();

    const rack = modelo.rack('MZ01', 1);
    expect(rack).toBeDefined();
    const ocupacion = modelo.ocupacionDeRack(rack);
    expect(ocupacion.nArts).toBe(1);
    expect(ocupacion.llenura).toBeCloseTo(0.5); // 2.25 / 4.5
    expect(ocupacion.colorLlenura).toBe('#2E7D83'); // 0.5 está en la banda "medio"
  });

  it('movimientos() expone el histórico de auditoría (solo mapa real, no sala)', async () => {
    const { servicios } = crearServiciosFake({
      movimientosHistoricos: [{ articulo: 'A1', fecha: '2026-07-06', hora: '10:00:00', accion: 'movimiento', estado: 'Correcto' }],
    });
    const modelo = await crearWarehouseModel({ servicios }).cargar();
    expect(modelo.movimientos()).toHaveLength(1);
  });

  it('cargarMovimientos() trae SOLO el histórico, sin recargar posiciones/bloqueos/descripciones (ver nota en crearWarehouseModel.js)', async () => {
    const fake = crearServiciosFake({
      base: [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', consumo: 1 }],
      movimientosHistoricos: [],
    });
    const listarBaseOriginal = fake.servicios.listarBase;
    let vecesLlamadoListarBase = 0;
    fake.servicios.listarBase = (...args) => { vecesLlamadoListarBase++; return listarBaseOriginal(...args); };

    const modelo = await crearWarehouseModel({ servicios: fake.servicios }).cargar();
    expect(vecesLlamadoListarBase).toBe(1);

    fake.actualizarEstado({ base: [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', consumo: 1 }], movimientosHistoricos: [{ articulo: 'A1', fecha: '2026-07-06', hora: '10:00:00', accion: 'movimiento', estado: 'Correcto' }] });
    await modelo.cargarMovimientos();

    expect(modelo.movimientos()).toHaveLength(1);
    expect(vecesLlamadoListarBase).toBe(1); // sigue en 1 -- cargarMovimientos() no tocó listarBase
  });

  it('snapshot() (async -- Zod se importa dinámicamente) produce un objeto válido contra WarehouseSnapshotSchema', async () => {
    const { servicios } = crearServiciosFake({
      base: [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', clase: 'A', tipo: 'NORMAL', consumo: 1, picks: 1 }],
      bloqueos: [{ rack_key: 'MZ02|5' }],
    });
    const modelo = await crearWarehouseModel({ escenarioId: null, servicios }).cargar();
    const snapshot = await modelo.snapshot();
    expect(() => WarehouseSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.version).toBe(1);
    expect(snapshot.bloqueos).toEqual(['MZ02|5']);
  });
});

describe('crearWarehouseModel -- Realtime simulado', () => {
  it('un evento de Realtime dispara UN recálculo que notifica a los suscriptores', async () => {
    const fake = crearServiciosFake({ base: [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', consumo: 1 }] });
    const modelo = await crearWarehouseModel({ servicios: fake.servicios }).cargar();

    expect(fake.tieneSuscripcionActiva()).toBe(true);

    const escuchas = vi.fn();
    modelo.suscribir(escuchas);

    expect(modelo.posiciones()).toHaveLength(1);

    // "Alguien más" movió un artículo nuevo en Supabase -- simulado cambiando
    // el fixture y disparando el callback que el modelo ya registró.
    fake.actualizarEstado({ base: [
      { articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', consumo: 1 },
      { articulo: 'A2', pasillo: 'MZ01', columna: 2, nivel: 'N01', consumo: 1 },
    ] });
    fake.dispararEventoRealtime();
    // cargarTodo() dentro del callback es async -- esperamos el microtask.
    await vi.waitFor(() => expect(modelo.posiciones()).toHaveLength(2));

    expect(escuchas).toHaveBeenCalledTimes(1);
    expect(escuchas).toHaveBeenCalledWith(modelo);
  });

  it('destruir() cancela la suscripción y limpia los listeners', async () => {
    const fake = crearServiciosFake({ base: [] });
    const modelo = await crearWarehouseModel({ servicios: fake.servicios }).cargar();
    expect(fake.tieneSuscripcionActiva()).toBe(true);

    modelo.destruir();
    expect(fake.tieneSuscripcionActiva()).toBe(false);
  });
});

describe('crearWarehouseModel -- reconstrucción total desde cero', () => {
  it('recargarTodo() reemplaza el estado anterior por completo, no lo mezcla', async () => {
    const fake = crearServiciosFake({
      base: [{ articulo: 'A1', pasillo: 'MZ01', columna: 1, nivel: 'N01', consumo: 1 }],
    });
    const modelo = await crearWarehouseModel({ servicios: fake.servicios }).cargar();
    expect(modelo.posiciones()).toHaveLength(1);

    fake.actualizarEstado({ base: [{ articulo: 'B1', pasillo: 'MZ05', columna: 9, nivel: 'N02', consumo: 1 }] });
    await modelo.recargarTodo();

    const posiciones = modelo.posiciones();
    expect(posiciones).toHaveLength(1);
    expect(posiciones[0].articulo).toBe('B1'); // A1 ya no existe -- no quedó pegado de la carga anterior
  });
});
