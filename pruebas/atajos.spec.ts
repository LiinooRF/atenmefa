/**
 * Atajos del formulario: pasos, guardado automático y relleno por cédula.
 *
 * Son 54 campos en una tablet con el paciente enfrente. Lo que se prueba
 * acá no es que las pantallas se vean: es que el médico no pierda trabajo
 * y no reescriba lo que el sistema ya sabe.
 */
import { test, expect } from '@playwright/test';
import {
  entrar, cedulaDePrueba, historiaMinima, borrarPacientes, idDeLaFicha,
  crearAtencionCerrada, conBase,
} from './apoyo';

const CEDULA = cedulaDePrueba(7);
const CEDULA_NUEVA = cedulaDePrueba(7, 1);
const NOMBRE = 'Rosalba Esperanza Núñez de Prueba';

test.afterAll(async () => {
  await borrarPacientes(CEDULA, CEDULA_NUEVA);
});

/* ---------------------------------------------------------------
   Pasos.
   --------------------------------------------------------------- */

test('el formulario se muestra de a un paso', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');

  const hojas = page.locator('[data-hoja]');
  await expect(hojas).toHaveCount(9);
  await expect(hojas.first()).toBeVisible();
  await expect(hojas.nth(1)).toBeHidden();

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(hojas.first()).toBeHidden();
  await expect(hojas.nth(1)).toBeVisible();

  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(hojas.first()).toBeVisible();
});

test('el paso queda en la dirección y sobrevive a una recarga', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page).toHaveURL(/paso=2/);

  await page.reload();
  await expect(page.locator('[data-hoja]').nth(2)).toBeVisible();
  await expect(page.locator('[data-hoja]').first()).toBeHidden();
});

test('cerrar atención solo aparece en el último paso', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await expect(page.getByRole('button', { name: 'Cerrar atención' })).toBeHidden();
  await page.goto('/sistema/atencion/nueva?paso=8');
  await expect(page.getByRole('button', { name: 'Cerrar atención' })).toBeVisible();
});

/* ---------------------------------------------------------------
   Guardado automático: lo que de verdad importa.
   --------------------------------------------------------------- */

test('lo escrito sobrevive a una recarga sin haber tocado guardar', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');

  await page.locator('#c-nombre').fill(NOMBRE);
  await page.locator('#c-cedula').fill(CEDULA);

  // El guardado automático crea la atención y cambia la dirección.
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}\/editar/, { timeout: 15000 });
  await expect(page.locator('#pasos-estado')).toContainText('Guardado');

  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.locator('#c-nombre')).toHaveValue(NOMBRE);
});

test('no se crea una atención duplicada al cerrar después del guardado automático', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');

  await page.locator('#c-nombre').fill('Paciente Sin Duplicar');
  await page.locator('#c-cedula').fill(CEDULA_NUEVA);
  await expect(page).toHaveURL(/\/editar/, { timeout: 15000 });

  const cuantas = await conBase(async (sql) => {
    const [f] = await sql`
      SELECT count(*)::int AS n FROM atencion a
      JOIN paciente p ON p.id = a.paciente_id
      WHERE p.cedula_busca = ${CEDULA_NUEVA.replace(/\D/g, '')}`;
    return f.n as number;
  });
  expect(cuantas, 'el guardado automático creó más de una atención').toBe(1);
});

test('el estado dice cuántos campos faltan para poder cerrar', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('#c-nombre').fill('Paciente Faltantes');
  await page.locator('#c-cedula').fill(CEDULA);
  await expect(page.locator('#pasos-estado')).toContainText('Faltan', { timeout: 15000 });
});

/* ---------------------------------------------------------------
   Relleno por cédula.
   --------------------------------------------------------------- */

test('la cédula conocida rellena los datos personales', async ({ page }) => {
  await entrar(page, 'medico');
  await crearAtencionCerrada(page, {
    ...historiaMinima,
    nombre: NOMBRE,
    cedula: CEDULA,
    telefono: '0414-1112233',
    alergias: 'Penicilina',
  });

  await page.goto('/sistema/atencion/nueva');
  await page.locator('#c-cedula').fill(CEDULA);
  await page.locator('#c-cedula').blur();

  await expect(page.locator('#atajos-paciente')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#atajos-titulo')).toContainText('Ya atendimos');
  await expect(page.locator('#c-nombre')).toHaveValue(NOMBRE);
});

test('los antecedentes NO se copian solos: se ofrecen', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('#c-cedula').fill(CEDULA);
  await page.locator('#c-cedula').blur();
  await expect(page.locator('#atajos-previo')).toBeVisible({ timeout: 10000 });

  // Está a la vista, pero el campo sigue vacío hasta que el médico decida.
  await expect(page.locator('#atajos-lista')).toContainText('Penicilina');
  await page.goto(page.url().split('?')[0] + '?paso=2');
  await expect(page.locator('#c-alergias')).toHaveValue('');
});

test('el botón de traer antecedentes sí los copia', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('#c-cedula').fill(CEDULA);
  await page.locator('#c-cedula').blur();
  await expect(page.locator('#atajos-traer')).toBeVisible({ timeout: 10000 });
  await page.locator('#atajos-traer').click();
  await expect(page.locator('#c-alergias')).toHaveValue('Penicilina');
});

test('una cédula desconocida no muestra nada', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('#c-cedula').fill('V-98.765.432');
  await page.locator('#c-cedula').blur();
  await page.waitForTimeout(1200);
  await expect(page.locator('#atajos-paciente')).toBeHidden();
});

test('el formulario por pasos no desborda a 390 px', async ({ page }) => {
  await entrar(page, 'medico');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const paso of [0, 4, 8]) {
    await page.goto(`/sistema/atencion/nueva?paso=${paso}`);
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      v: document.documentElement.clientWidth,
    }));
    expect.soft(m.doc, `paso ${paso} mide ${m.doc} en ${m.v}`).toBeLessThanOrEqual(m.v + 1);
  }
});
