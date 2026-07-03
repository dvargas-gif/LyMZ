import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración estándar de Vite + React.
// El mapa legacy vive en /public/legacy y se sirve como archivo estático,
// por eso no necesita pasar por el bundler ni tocar su JS embebido — y por
// la misma razón, tampoco entra en esta suite de tests (ver README de test/
// si en algún momento se decide agregarle tests de otra forma).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'node', // todo lo que se testea hoy es logica pura (validacion/formato/calculo), sin DOM
    include: ['src/**/*.test.js'],
  },
});
