/**
 * La puerta de la cédula.
 *
 * Lo primero que se pregunta es a quién se atiende. Si ya lo conocemos, no
 * tiene sentido volver a pedir su nombre ni su edad.
 */
import { test, expect } from '@playwright/test';
import {
  entrar, crearAtencionCerrada, cedulaDePrueba, historiaMinima, borrarPacientes,
} from './apoyo';

const CONOCIDO = cedulaDePrueba(10);
const NUEVO = cedulaDePrueba(10, 1);
const NOMBRE = 'Carmen Alicia Rodríguez de Prueba';

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page, 'medico');
  await crearAtencionCerrada(page, {
    ...historiaMinima, nombre: NOMBRE, cedula: CONOCIDO,
    telefono: '0414-5556677', idx: 'Gastritis de prueba',
  });
  await page.close();
});

test.afterAll(async () => {
  await borrarPacientes(CONOCIDO, NUEVO);
});

test('lo primero que se pregunta es la cédula', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await expect(page.locator('h1')).toContainText('¿A quién va a atender?');
  await expect(page.locator('#cedula')).toBeVisible();
  // Todavía no se muestra el formulario entero.
  await expect(page.locator('[data-hoja]')).toHaveCount(0);
});

test('una cédula conocida no vuelve a pedir los datos', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('#cedula').fill(CONOCIDO);
  await page.getByRole('button', { name: 'Continuar' }).click();

  /* De la cédula al formulario, sin paso del medio: cuál se abre lo decide
     el rol, y el médico escribe historias y nada más. */
  await expect(page.locator('.form__nota')).toContainText(NOMBRE);
  await expect(page.locator('.form__nota')).toContainText('última atención');
  await expect(page.locator('#c-nombre')).toHaveValue(NOMBRE);
  await expect(page.locator('#c-telefono')).toHaveValue('0414-5556677');
});

test('con el paciente conocido se arranca en el paso siguiente', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CONOCIDO)}&tipo=general`);
  await expect(page.locator('[aria-current=step] .pasos__nombre')).toHaveText('El caso');
});

test('una cédula nueva abre el formulario desde el paciente', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('#cedula').fill(NUEVO);
  await page.getByRole('button', { name: 'Continuar' }).click();
  /* Ya no hay paso del medio: el formulario que se abre lo decide el rol.
     El médico escribe historias y nada más, así que entra directo. */

  await expect(page.locator('.form__nota')).toContainText('Paciente nuevo');
  await expect(page.locator('[aria-current=step] .pasos__nombre')).toHaveText('Paciente');
  await expect(page.locator('#c-cedula')).toHaveValue(NUEVO);
  await expect(page.locator('#c-nombre')).toHaveValue('');
});

test('la cédula se reconoce sin importar cómo se escriba', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${CONOCIDO.replace(/\D/g, '')}&tipo=general`);
  await expect(page.locator('#c-nombre')).toHaveValue(NOMBRE);
});

test('se puede volver atrás si no era ese paciente', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CONOCIDO)}&tipo=general`);
  await page.getByRole('link', { name: 'No es este paciente' }).click();
  await expect(page.locator('h1')).toContainText('¿A quién va a atender?');
});

test('la puerta no desborda a 390 px', async ({ page }) => {
  await entrar(page, 'medico');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sistema/atencion/nueva');
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    v: document.documentElement.clientWidth,
  }));
  expect(m.doc).toBeLessThanOrEqual(m.v + 1);
});
