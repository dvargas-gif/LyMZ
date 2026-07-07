import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Tests de regresión sobre 2 bugfixes recientes del mapa legacy (ver
 * PROGRESO.md / DECISIONES.md): "Deshacer" parcial de un cuerpo completo, y
 * el slot que quedaba pintado con "0" en vez de vacío. El mapa legacy NO es
 * un módulo ES -- son scripts clásicos de scope global, cargados en el
 * mismo orden que la página real (mapa_editable_slotting.html), insertados
 * como <script> reales dentro de una ventana jsdom, para probar las
 * funciones tal cual corren en producción (sin extraer ni reescribir nada
 * de su lógica).
 *
 * jsdom es una dependencia de DESARROLLO únicamente (no se importa desde
 * ningún archivo que compile al bundle de producción) -- cero impacto en
 * lo que se le manda al navegador.
 */
const carpetaLegacy = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'legacy');

const ARCHIVOS = [
  '01-datos.js', '02-estado.js', '03-configuracion.js', '04-sesion.js',
  '05-ayudantes.js', '07-render.js', '08-interacciones.js', '09-arrastre.js',
  '10-servicios.js', '11-buscar-exportar.js', '12-arranque.js',
];

const HTML_MINIMO = `<!DOCTYPE html><html><body>
  <div id="bannerSala" style="display:none"></div>
  <button id="btnAddRack" style="display:none"></button>
  <span id="badge">0 cambios</span>
  <input id="buscar" /><div id="resbuscar"></div>
  <button id="btnLock"></button><button id="btnEdit"></button>
  <div id="movebar"></div>
  <div class="wrap"><div id="grid" class="grid"></div></div>
  <div id="terminal" style="display:none"><div id="termlog"></div></div>
  <div id="overlay"><div id="mhead"></div><div id="mtit"></div><div id="mmeta"></div><div id="mbody"></div></div>
  <span id="swA"></span><span id="swB"></span><span id="swC"></span><span id="swD"></span><span id="swCuerpo"></span>
</body></html>`;

/**
 * `CUERPOS`/`cambios`/`moviendo` son `const`/`let` de nivel superior del
 * script -- visibles como identificadores sueltos para código posterior
 * QUE COMPARTA el mismo scope léxico de página, pero nunca como propiedad
 * de `window` (así es JS: solo `var`/`function` de nivel superior se
 * vuelven propiedades de `window`; `let`/`const` no). Por eso se agrega un
 * último <script> -- en el MISMO scope compartido -- que expone justo lo
 * necesario en `window.__test`, en vez de tratar de leer/asignar esos
 * nombres desde afuera.
 */
function crearVentanaMapa() {
  const dom = new JSDOM(HTML_MINIMO, { url: 'http://localhost/mapa_editable_slotting.html', runScripts: 'dangerously' });
  const { document } = dom.window;

  for (const archivo of ARCHIVOS) {
    const script = document.createElement('script');
    script.textContent = readFileSync(join(carpetaLegacy, 'js', archivo), 'utf8');
    document.body.appendChild(script);
  }

  const puente = document.createElement('script');
  puente.textContent = `
    window.__test = {
      fijarCuerpos(obj) {
        for (const k of Object.keys(CUERPOS)) delete CUERPOS[k];
        Object.assign(CUERPOS, obj);
      },
      obtenerCuerpo(key) { return CUERPOS[key]; },
      cantidadCambios() { return cambios.length; },
    };
  `;
  document.body.appendChild(puente);

  return dom.window;
}

describe('bugfix -- Deshacer revierte un cuerpo completo de una sola vez', () => {
  it('deshacer() una sola vez devuelve TODOS los artículos del cuerpo, no uno por uno', () => {
    const win = crearVentanaMapa();
    win.__test.fijarCuerpos({
      'MZ01|1': { pas: 'MZ01', col: 1, clase: 'A', grupo: 'G1', tipo: 'NORMAL', niveles: {
        N01: [{ art: 'A1', picks: 1, consumo: 0.1, actual: '-' }, { art: 'A2', picks: 1, consumo: 0.1, actual: '-' }],
      } },
    });

    win.iniciarMoverCuerpo('MZ01|1');
    win.soltarCuerpoEn('MZ02|5');

    // El cuerpo se movió entero -- origen borrado, destino con los 2 artículos.
    expect(win.__test.obtenerCuerpo('MZ01|1')).toBeUndefined();
    expect(win.__test.obtenerCuerpo('MZ02|5').niveles.N01.map(a => a.art).sort()).toEqual(['A1', 'A2']);
    expect(win.__test.cantidadCambios()).toBe(2); // una entrada por artículo (así es hoy)

    win.deshacer(); // UNA sola llamada

    // Antes del fix, esto solo devolvía UN artículo (quedaba 1 en destino y 1 en origen).
    expect(win.__test.obtenerCuerpo('MZ02|5')).toBeUndefined(); // el destino quedó vacío -> se borra
    expect(win.__test.obtenerCuerpo('MZ01|1').niveles.N01.map(a => a.art).sort()).toEqual(['A1', 'A2']);
    expect(win.__test.cantidadCambios()).toBe(0);
  });
});

describe('bugfix -- un slot vaciado por completo no queda pintado con "0"', () => {
  it('confirmar() borra el rack de origen cuando se queda sin artículos', () => {
    const win = crearVentanaMapa();
    win.__test.fijarCuerpos({
      'MZ01|1': { pas: 'MZ01', col: 1, clase: 'A', grupo: 'G1', tipo: 'NORMAL', niveles: {
        N01: [{ art: 'A1', picks: 1, consumo: 0.1, actual: '-' }],
      } },
    });

    win.iniciarMover('A1', 'MZ01|1', 'N01');
    win.soltarEn('MZ02|5'); // crea el rack destino si no existe (mismo flujo real: iniciarMover -> soltarEn -> confirmar)
    win.confirmar('MZ02|5', 'N01');

    // Antes del fix, CUERPOS['MZ01|1'] seguía existiendo con niveles:{} -> render()
    // lo pintaba con nArts()=0, es decir "0", en vez de aparecer vacío.
    expect(win.__test.obtenerCuerpo('MZ01|1')).toBeUndefined();
    expect(win.__test.obtenerCuerpo('MZ02|5').niveles.N01.map(a => a.art)).toEqual(['A1']);
  });
});
