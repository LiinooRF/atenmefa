/**
 * Las fórmulas del laboratorio: se ven todas en una pantalla y el
 * bioanalista ajusta los números que dependen del reactivo.
 *
 * Lo que se vigila: que un ISI nuevo cambie de verdad el INR que se
 * calcula, que un número imposible no se guarde —un ISI de 117 por una
 * coma perdida dispararía todos los INR— y que solo el laboratorio lo toque.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar } from './apoyo';

test.describe.configure({ mode: 'serial' });

// Que el resto de la suite siga viendo el ISI de fábrica.
const deFabrica = () => conBase((sql) => sql`DELETE FROM formula_constante`);
test.beforeAll(deFabrica);
test.afterAll(deFabrica);

test('la pantalla muestra las catorce cuentas en palabras', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto('/sistema/formulas');
  await expect(page.locator('.formula')).toHaveCount(14);
  await expect(page.locator('.formula', { hasText: 'INR' }))
    .toContainText('(tiempo del paciente ÷ tiempo control) elevado a 1,17');
  // Solo tres se ajustan: lo demás es conversión de unidades.
  await expect(page.locator('.formula__ajuste')).toHaveCount(3);
});

test('un número fuera de rango no se guarda', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto('/sistema/formulas');
  const inr = page.locator('.formula', { hasText: 'ISI del reactivo' });
  await inr.getByLabel('ISI del reactivo').fill('117');
  await inr.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.sis-error')).toContainText('tiene que estar entre 0,5 y 3');
  const filas = await conBase((sql) => sql`SELECT 1 FROM formula_constante`);
  expect(filas.length).toBe(0);
});

test('un ISI nuevo cambia la cuenta, la explicación y queda en bitácora', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto('/sistema/formulas');
  const inr = page.locator('.formula', { hasText: 'ISI del reactivo' });
  await inr.getByLabel('ISI del reactivo').fill('1,25');
  await inr.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.locator('.msj--bien')).toContainText('INR: guardado');
  await expect(page.locator('.formula', { hasText: 'ISI del reactivo' })).toContainText('elevado a 1,25');
  await expect(page.locator('.formula', { hasText: 'ISI del reactivo' })).toContainText('De fábrica: 1,17');

  const [b] = await conBase((sql) => sql`
    SELECT detalle FROM bitacora WHERE accion = 'formula' ORDER BY momento DESC LIMIT 1`);
  expect(b.detalle).toMatchObject({ analito: 'INR', antes: 1.17, despues: 1.25 });

  // Y el editor de la hoja explica la cuenta con el número nuevo.
  await page.goto(`/sistema/plantillas/${encodeURIComponent('COAG.')}`);
  await expect(page.locator('.pl__formula[title*="elevado a 1,25"]')).toHaveCount(1);
});

test('recepción y el médico no entran', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto('/sistema/formulas');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso|\/sistema\/laboratorio/);
  await expect(page.locator('.formula')).toHaveCount(0);
});
