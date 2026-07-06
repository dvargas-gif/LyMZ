import { test, expect } from '@playwright/test';

// Smoke test minimo: solo lo que se puede verificar SIN una sesion real de
// Supabase. Confirma que la app carga, enruta a /login sin sesion, y que
// el formulario (incluido el boton de Google) esta completo -- si algo
// rompe el build/routing/Login.jsx, esto falla antes de llegar a produccion.
test('sin sesión, redirige a /login y el formulario está completo', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await expect(page.getByRole('heading', { name: 'WMS · Slotting Mezanine' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
});

test('el botón "Ingresar" no envía con campos vacíos (los marca required)', async ({ page }) => {
  await page.goto('/login');
  const email = page.getByLabel('Email');
  await expect(email).toHaveAttribute('required', '');
});
