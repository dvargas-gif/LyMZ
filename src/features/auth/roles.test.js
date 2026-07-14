import { describe, it, expect } from 'vitest';
import { ROLES, puede } from './roles.js';

describe('puede', () => {
  it('Administrador puede administrar_usuarios, Supervisor no', () => {
    expect(puede(ROLES.ADMIN, 'administrar_usuarios')).toBe(true);
    expect(puede(ROLES.SUPERVISOR, 'administrar_usuarios')).toBe(false);
  });

  it('Operador solo puede ver el mapa, no moverlo ni usar salas', () => {
    expect(puede(ROLES.OPERADOR, 'ver_mapa')).toBe(true);
    expect(puede(ROLES.OPERADOR, 'mover')).toBe(false);
    expect(puede(ROLES.OPERADOR, 'usar_salas')).toBe(false);
  });

  it('Solo lectura puede ver dashboard e historial pero no exportar', () => {
    expect(puede(ROLES.LECTURA, 'ver_dashboard')).toBe(true);
    expect(puede(ROLES.LECTURA, 'ver_historial')).toBe(true);
    expect(puede(ROLES.LECTURA, 'exportar')).toBe(false);
  });

  it('un rol desconocido no puede nada (sin romper)', () => {
    expect(puede('Rol inventado', 'ver_mapa')).toBe(false);
  });

  it('migrar_slot (F2): Operador SÍ puede, a diferencia de "mover" -- es explícitamente su trabajo', () => {
    expect(puede(ROLES.OPERADOR, 'migrar_slot')).toBe(true);
    expect(puede(ROLES.SUPERVISOR, 'migrar_slot')).toBe(true);
    expect(puede(ROLES.ADMIN, 'migrar_slot')).toBe(true);
    expect(puede(ROLES.LECTURA, 'migrar_slot')).toBe(false);
  });

  it('confirmar_migracion (paso 4): SOLO Supervisor/Administrador, Operador no', () => {
    expect(puede(ROLES.OPERADOR, 'confirmar_migracion')).toBe(false);
    expect(puede(ROLES.SUPERVISOR, 'confirmar_migracion')).toBe(true);
    expect(puede(ROLES.ADMIN, 'confirmar_migracion')).toBe(true);
  });
});
