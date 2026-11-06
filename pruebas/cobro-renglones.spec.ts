/**
 * Cobro de una atención, de extremo a extremo.
 *
 * Recorre lo que hace una secretaria: carga el catálogo, abre un caso,
 * le mete renglones del catálogo y uno escrito a mano, reparte quién paga
 * cada cosa, revisa la cuenta y quita lo que se cargó por error.
 *
 * La prueba se arma sus propios datos, con un sufijo distinto en cada
 * corrida, y los borra al final: no depende de lo que haya sembrado en la
 * base ni se lo lleva por delante.
 */
import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';

const SUFIJO = String(Date.now()).slice(-6);
const CONSULTA = `Consulta de prueba ${SUFIJO}`;
const LABORATORIO = `Hematología de prueba ${SUFIJO}`;
const PACIENTE = `Paciente de prueba ${SUFIJO}`;
const CEDULA = `V-99.${SUFIJO.slice(0, 3)}.${SUFIJO.slice(3)}`;

/** Queda en esta variable para que el borrado final sepa qué caso limpiar. */
let caso = '';

/**
 * Elige un servicio del selector por su nombre. La opción muestra también el
 * precio, así que se busca la fila y se usa su valor, no su rótulo entero.
 */
async function elegirServicio(page: Page, nombre: string) {
  const opcion = page.locator('#servicio option', { hasText: nombre });
  const valor = await opcion.getAttribute('value');
  await page.locator('#servicio').selectOption(valor!);
}

async function entrar(page: Page) {
  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill('admin@atenmefa.local');
  await page.getByLabel('Clave').fill('clave-de-prueba-2');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/sistema$/);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page);

  // Dos servicios del catálogo, uno de consulta y uno de laboratorio.
  for (const [nombre, categoria, precio] of [
    [CONSULTA, 'Consulta', '40,00'],
    [LABORATORIO, 'Laboratorio', '18,50'],
  ]) {
    await page.goto('/sistema/servicios');
    await page.getByLabel('Servicio').fill(nombre);
    await page.getByLabel('Categoría').selectOption({ label: categoria });
    await page.getByLabel('Precio').fill(precio);
    await page.getByRole('button', { name: 'Agregar al catálogo' }).click();
    await expect(page.getByRole('link', { name: nombre })).toBeVisible();
  }

  // Un caso con seguro, para que el cobro proponga la aseguradora.
  await page.goto('/sistema/atencion/nueva');
  await page.locator('#c-nombre').fill(PACIENTE);
  await page.locator('#c-cedula').fill(CEDULA);
  await page.locator('#c-aseguradora').fill('Seguros de prueba');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);
  caso = page.url().split('/atencion/')[1];

  await page.close();
});

test.afterAll(async () => {
  // La base se deja como estaba: la prueba carga datos, no los hereda.
  const sql = postgres(process.env.BASE_DATOS!);
  await sql`DELETE FROM bitacora WHERE atencion_id IN (SELECT id FROM atencion WHERE paciente_id IN (SELECT id FROM paciente WHERE nombre = ${PACIENTE}))`;
  await sql`DELETE FROM renglon  WHERE atencion_id IN (SELECT id FROM atencion WHERE paciente_id IN (SELECT id FROM paciente WHERE nombre = ${PACIENTE}))`;
  await sql`DELETE FROM atencion WHERE paciente_id IN (SELECT id FROM paciente WHERE nombre = ${PACIENTE})`;
  await sql`DELETE FROM paciente WHERE nombre = ${PACIENTE}`;
  await sql`DELETE FROM renglon  WHERE servicio_id IN (SELECT id FROM servicio WHERE nombre IN (${CONSULTA}, ${LABORATORIO}))`;
  await sql`DELETE FROM servicio WHERE nombre IN (${CONSULTA}, ${LABORATORIO})`;
  await sql.end();
});

test('el caso con seguro propone que pague la aseguradora', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${caso}/cobro`);

  await expect(page.getByRole('heading', { name: /Cobro de la atención N°/ })).toBeVisible();
  await expect(page.locator('#paga')).toHaveValue('aseguradora');
  await expect(page.getByText('Todavía no se cargó nada que cobrar')).toBeVisible();
});

test('cada renglón lleva su pagador y la cuenta se reparte', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${caso}/cobro`);

  // La consulta la cubre el seguro.
  await elegirServicio(page, CONSULTA);
  await page.locator('#cantidad').fill('1');
  await page.locator('#paga').selectOption('aseguradora');
  await page.getByRole('button', { name: 'Cargar' }).first().click();

  // El laboratorio, dos veces, lo paga el paciente.
  await elegirServicio(page, LABORATORIO);
  await page.locator('#cantidad').fill('2');
  await page.locator('#paga').selectOption('paciente');
  await page.getByRole('button', { name: 'Cargar' }).first().click();

  // El material no está en la lista: va escrito a mano y lo paga la empresa.
  await page.getByText('Renglón escrito a mano').click();
  await page.locator('#descripcion').fill('Material de sutura');
  await page.locator('#cantidad-libre').fill('1');
  await page.locator('#precio-libre').fill('12,50');
  await page.locator('#paga-libre').selectOption('empresa');
  await page.locator('form.carga--mano').getByRole('button', { name: 'Cargar' }).click();

  const cuenta = page.locator('section', { has: page.getByRole('heading', { name: 'La cuenta' }) });
  await expect(cuenta).toContainText('Total USD');
  await expect(cuenta).toContainText('89,50');   // 40 + 37 + 12,50
  await expect(cuenta).toContainText('37,00');   // el paciente
  await expect(cuenta).toContainText('40,00');   // la aseguradora
  await expect(cuenta).toContainText('12,50');   // la empresa

  const cargado = page.locator('table', { has: page.getByText('Quién paga') });
  await expect(cargado).toContainText('Lo paga el seguro');
  await expect(cargado).toContainText('Lo paga el paciente');
  await expect(cargado).toContainText('Lo paga la empresa');
  await expect(cargado.getByText('a mano')).toBeVisible();
});

test('la ficha del caso muestra el total cargado', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${caso}`);

  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Cobro' }) });
  await expect(panel).toContainText('89,50');
  await expect(page.getByRole('link', { name: 'Cargar cobro' })).toBeVisible();
});

test('subir el precio del catálogo no mueve lo ya cargado', async ({ page }) => {
  await entrar(page);
  await page.goto('/sistema/servicios');
  await page.getByRole('link', { name: CONSULTA }).click();

  await page.getByLabel('Precio').fill('90,00');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL(/\/sistema\/servicios$/);

  // El renglón conserva el precio del día en que se cargó.
  await page.goto(`/sistema/atencion/${caso}/cobro`);
  const cuenta = page.locator('section', { has: page.getByRole('heading', { name: 'La cuenta' }) });
  await expect(cuenta).toContainText('89,50');
});

test('un servicio desactivado sale del selector pero no de lo cargado', async ({ page }) => {
  await entrar(page);
  await page.goto('/sistema/servicios');
  await page
    .locator('tr', { has: page.getByRole('link', { name: LABORATORIO }) })
    .getByRole('button', { name: 'Desactivar' })
    .click();
  await expect(page.getByText('Desactivado').first()).toBeVisible();

  await page.goto(`/sistema/atencion/${caso}/cobro`);
  await expect(page.locator('#servicio')).not.toContainText(LABORATORIO);
  await expect(page.locator('table', { has: page.getByText('Quién paga') })).toContainText(LABORATORIO);
});

test('el renglón cargado por error se quita', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${caso}/cobro`);

  const fila = page.locator('tr', { hasText: 'Material de sutura' });
  await fila.getByRole('button', { name: 'Quitar' }).click();

  await expect(page.getByText('Material de sutura')).toHaveCount(0);
  const cuenta = page.locator('section', { has: page.getByRole('heading', { name: 'La cuenta' }) });
  await expect(cuenta).toContainText('77,00');   // 40 + 37
});

test('lo que no es un monto no se guarda y la pantalla lo dice', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${caso}/cobro`);

  await page.getByText('Renglón escrito a mano').click();
  await page.locator('#descripcion').fill('Renglón con precio malo');
  await page.locator('#precio-libre').fill('no es un precio');
  await page.locator('form.carga--mano').getByRole('button', { name: 'Cargar' }).click();

  await expect(page.getByText('El precio tiene que ser un monto')).toBeVisible();
  // Lo tecleado vuelve a la pantalla, con la sección abierta.
  await expect(page.locator('#descripcion')).toHaveValue('Renglón con precio malo');
  await expect(page.locator('table', { has: page.getByText('Quién paga') }))
    .not.toContainText('Renglón con precio malo');
});
