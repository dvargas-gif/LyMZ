import { defineConfig } from '@playwright/test';

// Arranque minimo, a proposito: por ahora solo cubrimos lo que se puede
// probar SIN credenciales reales de Supabase (la pagina de login renderiza
// bien). El flujo autenticado (mover un articulo, ver que se guardo) queda
// para cuando se decida como manejar un usuario de prueba -- no se inventan
// credenciales acá.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  webServer: {
    command: 'npm run dev -- --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:5175',
  },
});
