/**
 * Lo que salió de revisar las pantallas en tablet y teléfono.
 *
 *   - la ficha de la consulta tiene un índice que salta a cada parte;
 *   - las hojas del laboratorio se muestran con un nombre que se lee;
 *   - en el teléfono el menú muestra todas sus entradas;
 *   - el «¿Hubo traslado?» viejo ya no se pregunta, pero lo escrito se ve.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba, crearAtencionCerrada, borrarPacientes } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(22, 0);
let consulta = '';

const limpiar = async () => {
  await borrarPacientes(CEDULA);
  await conBase((sql) => sql`UPDATE hoja_nombre SET nombre = 'Urocultivo' WHERE examen = 'URO1'`);
};
test.beforeAll(limpiar);
test.afterAll(limpiar);

test('la ficha de la consulta tiene un índice que salta a cada parte', async ({ page }) => {
  await entrar(page, 'medico');
  consulta = await crearAtencionCerrada(page, { cedula: CEDULA, nombre: 'Índice de Prueba Torres' });
  await page.goto(`/sistema/atencion/${consulta}`);

  const indice = page.locator('nav.indice');
  await expect(indice.getByRole('link')).toHaveText(['Historia', /Agregados/, /Derivaciones/, /Cobro/]);
  // Cada enlace lleva a algo que existe en la página.
  for (const destino of await indice.getByRole('link').evaluateAll((a) => a.map((x) => x.getAttribute('href')))) {
    await expect(page.locator(destino!)).toHaveCount(1);
  }
});

test('el traslado viejo no se pregunta, pero lo escrito en una historia vieja se ve', async ({ page }) => {
  // Una historia de antes de las derivaciones, con el traslado escrito.
  await conBase((sql) => sql`
    UPDATE atencion SET datos = datos || '{"traslado":"Sí","paramedico":"Pedro Pérez"}'::jsonb
     WHERE id = ${consulta}`);
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.locator('#historia').locator('xpath=..')).toContainText('Pedro Pérez');

  // Una consulta nueva ya no lo pregunta.
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(cedulaDePrueba(22, 1))}&tipo=general`);
  await expect(page.locator('#c-traslado')).toHaveCount(0);
  await expect(page.locator('#c-paramedico')).toHaveCount(0);
});

test('las hojas del laboratorio se muestran con su nombre y se renombran', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto('/sistema/plantillas');
  const uro = page.locator('.lista li', { hasText: 'Urocultivo' });
  await expect(uro).toContainText('URO1');

  await page.goto(`/sistema/plantillas/${encodeURIComponent('URO1')}`);
  await expect(page.locator('h1')).toHaveText('Urocultivo');
  await page.locator('.renombrar summary').click();
  await page.locator('#nombre_hoja').fill('Urocultivo y antibiograma');
  await page.getByRole('button', { name: 'Guardar el nombre' }).click();
  await expect(page.locator('h1')).toHaveText('Urocultivo y antibiograma');

  const [n] = await conBase((sql) => sql`SELECT nombre FROM hoja_nombre WHERE examen = 'URO1'`);
  expect(n.nombre).toBe('Urocultivo y antibiograma');
  // La llave no cambió: las plantillas siguen siendo de «URO1».
  const [r] = await conBase((sql) => sql`SELECT COUNT(*)::int AS n FROM plantilla_examen WHERE examen = 'URO1'`);
  expect(r.n).toBeGreaterThan(0);
});

test('en el teléfono el menú muestra todas sus entradas, sin esconder ninguna', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sistema');
  const ancho = await page.evaluate(() => document.documentElement.clientWidth);
  const cajas = await page.locator('.sis__nav > a, .sis__nav > details > summary')
    .evaluateAll((n) => n.map((x) => { const b = x.getBoundingClientRect(); return { izq: b.left, der: b.right }; }));
  expect(cajas.length).toBe(8);
  for (const c of cajas) {
    expect(c.izq).toBeGreaterThanOrEqual(0);
    expect(c.der).toBeLessThanOrEqual(ancho + 1);
  }
});
