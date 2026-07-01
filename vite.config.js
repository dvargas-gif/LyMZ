import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración estándar de Vite + React.
// El mapa legacy vive en /public/legacy y se sirve como archivo estático,
// por eso no necesita pasar por el bundler ni tocar su JS embebido.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
