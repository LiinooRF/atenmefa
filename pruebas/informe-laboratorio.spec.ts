/**
 * El informe del laboratorio, un examen por bloque (16-11).
 *
 * «Que diga examen general de orina… y diga examen químico, microscópico,
 * macroscópico, titulado de qué es ese examen… y una separación, dos
 * dedos, para que sepa que es otro examen.»
 *
 * Y lo que salió al revisarlo: una orden con hematología y orina perdía la
 * hemoglobina y los leucocitos de la orina, porque se tomaban por repetidos.
 */
import { test, expect, type Page } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba, borrarPacientes, borrarServicios, casillaDelExamen, FICHA } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(26, 0);
const HEMA = 'ZI Hematología Completa';
const ORINA = 'ZI Examen de Orina';
const SUELTO = 'ZI Glicemia suelta';
let orden = '';

const limpiar = async () => {
  await borrarPacientes(CEDULA);
  await borrarServicios(HEMA, ORINA, SUELTO);
};
test.beforeAll(async () => {
  await limpiar();
  await conBase((sql) => sql`
    INSERT INTO servicio (nombre, categoria, precio, moneda, activo, plantilla) VALUES
      (${HEMA}, 'laboratorio', 4, 'USD', true, 'HEMA'),
      (${ORINA}, 'laboratorio', 3, 'USD', true, 'ORINA'),
      (${SUELTO}, 'laboratorio', 2, 'USD', true, NULL)`);
});
test.afterAll(limpiar);

/** La casilla del valor de la n-ésima línea que se llama así. */
const valorDe = (page: Page, examen: string, n = 0) =>
  page.locator('#res-cuerpo tr')
    .filter({ has: page.locator(`input[name="examen"][value="${examen}"]`) })
    .nth(n).locator('[name="valor"]');

test('la orina no pierde su hemoglobina ni sus leucocitos al lado de la hematología', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);
  await page.locator('#c-nombre').fill('Informe Por Bloques Prueba');
  await page.locator('#c-edad').fill('40');
  await page.locator('#c-sexo').selectOption('Masculino');
  await page.locator('[data-ir="1"]').click();
  for (const e of [HEMA, ORINA, SUELTO]) await casillaDelExamen(page, e).check();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);
  orden = page.url().split('/atencion/')[1].split(/[/?#]/)[0];

  await page.context().clearCookies();
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/resultados`);
  // Dos de cada una: la de la sangre y la de la orina.
  await expect(page.locator('#res-cuerpo input[name="examen"][value="HEMOGLOBINA"]')).toHaveCount(2);
  await expect(page.locator('#res-cuerpo input[name="examen"][value="LEUCOCITOS"]')).toHaveCount(2);

  await valorDe(page, 'HEMOGLOBINA', 0).fill('14');
  await valorDe(page, 'COLOR').fill('AMARILLO');
  await valorDe(page, 'PROTEINAS').fill('NEGATIVO');
  await valorDe(page, 'LEUCOCITOS', 1).fill('0 - 1 x CMP');
  await valorDe(page, SUELTO).fill('90');
  await page.getByRole('button', { name: 'Dar por listos' }).click();
  await expect(page).toHaveURL(FICHA);
});

test('el informe sale por exámenes: título, sus partes y aire entre uno y otro', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/documento`);
  const tabla = page.locator('table.valores');

  // Cada examen pedido con su título; el suelto es su propio renglón.
  await expect(tabla.locator('.valores__examen')).toHaveText([HEMA, ORINA]);
  await expect(tabla.locator('tbody.valores__grupo')).toHaveCount(3);
  await expect(tabla.locator('.valores__aire')).toHaveCount(2);

  // Las partes de la orina van como subtítulos, dentro de la orina.
  const orina = tabla.locator('tbody.valores__grupo', { has: page.locator('.valores__examen', { hasText: ORINA }) });
  await expect(orina.locator('.valores__seccion')).toHaveText(['EXAMEN MACROSCOPICO', 'ANALISIS QUIMICO:', 'EXAMEN MICROSCOPICO:']);
  await expect(orina).toContainText('0 - 1 x CMP');
  // La hemoglobina de la sangre no se metió en la orina.
  const hema = tabla.locator('tbody.valores__grupo', { has: page.locator('.valores__examen', { hasText: HEMA }) });
  await expect(hema).toContainText('14');
  await expect(hema).not.toContainText('AMARILLO');
});
