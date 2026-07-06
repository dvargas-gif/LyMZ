import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Verificación estática (Ley/protocolo G1: "src/domain/ sin imports de
 * React/DOM/UI"). No es una opinión, es un chequeo automático que falla la
 * suite si algún archivo futuro del dominio se acopla a React o al DOM --
 * exactamente lo que se pidió verificar en el cierre de G1d.
 */
const carpetaDominio = dirname(fileURLToPath(import.meta.url));

function archivosFuenteDelDominio() {
  return readdirSync(carpetaDominio)
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
}

describe('src/domain/ no depende de React ni del DOM', () => {
  const archivos = archivosFuenteDelDominio();

  it('efectivamente hay archivos para revisar (si esto falla, el chequeo no está corriendo)', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  archivos.forEach(archivo => {
    it(`${archivo}: sin import de 'react'/'react-dom', sin referencias a document./window.`, () => {
      const contenido = readFileSync(join(carpetaDominio, archivo), 'utf8');

      expect(contenido).not.toMatch(/from\s+['"]react(-dom)?['"]/);
      expect(contenido).not.toMatch(/require\(\s*['"]react(-dom)?['"]\s*\)/);
      expect(contenido).not.toMatch(/\bdocument\s*\./);
      expect(contenido).not.toMatch(/\bwindow\s*\./);
    });
  });
});
