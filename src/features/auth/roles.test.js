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
});
