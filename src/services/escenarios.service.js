import { supabase } from './supabaseClient.js';
import { posicionesService } from './posiciones.service.js';
import { escenarioPosicionesService } from './escenarioPosiciones.service.js';
import { escenarioEliminadosService } from './escenarioEliminados.service.js';
import { escenarioBloqueosService } from './escenarioBloqueos.service.js';

/**
 * "Salas" de simulación: copias aisladas del mapa donde Admin/Supervisor
 * pueden proponer acomodos alternativos sin tocar `posiciones_actuales`
 * (el mapa real). Cada sala arranca como una foto del estado real al
 * momento de crearla, y a partir de ahí vive en `escenario_posiciones`.
 */
export const escenariosService = {
  async listar() {
    const { data, error } = await supabase.from('escenarios').select('*').order('creado_en', { ascending: false });
    if (error) throw error;
    return data;
  },

  /** Crea la sala y copia ahí mismo el estado real actual (snapshot). */
  async crear({ nombre, usuarioId, usuarioNombre }) {
    const { data: escenario, error } = await supabase
      .from('escenarios')
      .insert({ nombre, creado_por: usuarioId, creado_por_nombre: usuarioNombre })
      .select()
      .single();
    if (error) throw error;

    const posicionesReales = await posicionesService.listar();
    if (posicionesReales.length > 0) {
      const filas = posicionesReales.map(p => ({
        escenario_id: escenario.id,
        articulo: p.articulo, pasillo: p.pasillo, columna: p.columna, nivel: p.nivel,
        clase: p.clase, grupo: p.grupo, tipo: p.tipo,
        actualizado_por: usuarioId,
      }));
      const { error: copiaError } = await supabase.from('escenario_posiciones').insert(filas);
      if (copiaError) throw copiaError;
    }
    return escenario;
  },

  async eliminar(id) {
    const { error } = await supabase.from('escenarios').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * "Volver al acomodo base": tira todo lo propio de la sala (posiciones
   * movidas, artículos limpiados, bloqueos) y vuelve a copiar el estado REAL
   * actual — igual que hace crear(), pero sobre una sala que ya existe. El
   * mapa real nunca se toca acá, solo se LEE (posicionesService.listar()).
   */
  async restaurarDesdeBase({ escenarioId, usuarioId }) {
    const [posicionesReales] = await Promise.all([
      posicionesService.listar(),
      escenarioPosicionesService.borrarTodos(escenarioId),
      escenarioEliminadosService.borrarTodos(escenarioId),
      escenarioBloqueosService.borrarTodos(escenarioId),
    ]);
    if (posicionesReales.length > 0) {
      const filas = posicionesReales.map(p => ({
        escenario_id: escenarioId,
        articulo: p.articulo, pasillo: p.pasillo, columna: p.columna, nivel: p.nivel,
        clase: p.clase, grupo: p.grupo, tipo: p.tipo,
        actualizado_por: usuarioId,
      }));
      const { error } = await supabase.from('escenario_posiciones').insert(filas);
      if (error) throw error;
    }
  },

  /** Checkpoint manual del botón "Guardar simulación" — confirma al usuario que quedó todo al día. */
  async tocar(id) {
    const { error } = await supabase.from('escenarios').update({ actualizado_en: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
};
