/**
 * Verificar un documento impreso.
 *
 * El papel se puede rehacer en cualquier procesador de texto. El documento
 * lleva un QR y un PIN, y quien lo recibe —una aseguradora, una empresa, una
 * farmacia— los contrasta contra el sitio.
 *
 * Lo que se vigila:
 *
 *   · que la página NO muestre nada de la historia clínica. Es pública: si
 *     un día alguien agrega el diagnóstico "para que se entienda mejor",
 *     esto lo dice;
 *   · que hagan falta las dos cosas, cédula y PIN. Si bastara el enlace del
 *     QR, reenviarlo sería suficiente para verificar;
 *   · que los intentos se cuenten. Un PIN de seis dígitos son un millón de
 *     combinaciones: sin freno se prueban todas;
 *   · que un documento anulado se vea anulado y no simplemente "auténtico".
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar, crearAtencionCerrada, cedulaDePrueba, anularEnLaBase } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(12, 0);
const CEDULA_ANULADA = cedulaDePrueba(12, 1);
const NOMBRE = 'Amparo Lucía Verificada de Prueba';
const DIAGNOSTICO = 'Lumbalgia mecánica de prueba';

let caso = '';
let numero = '';
let pin = '';
let casoAnulado = '';
let pinAnulado = '';

const pinDe = (id: string) =>
  conBase(async (sql) => {
    const [a] = await sql`SELECT pin FROM atencion WHERE id = ${id}`;
    return (a?.pin ?? '') as string;
  });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page, 'medico');

  caso = await crearAtencionCerrada(page, {
    nombre: NOMBRE, cedula: CEDULA, idx: DIAGNOSTICO,
    recipe: 'Ibuprofeno 400 mg cada 8 horas por 5 días',
  });
  numero = (await page.locator('.cab__meta').first().innerText()).match(/N°\s*(\d+)/)?.[1] ?? '';
  pin = await pinDe(caso);

  casoAnulado = await crearAtencionCerrada(page, {
    nombre: 'Anulada de Prueba', cedula: CEDULA_ANULADA, idx: 'Control de prueba',
  });
  pinAnulado = await pinDe(casoAnulado);
  await anularEnLaBase(casoAnulado, 'Cargada por error en una prueba');

  await page.close();
});

test.afterAll(async () => {
  await conBase(async (sql) => {
    for (const c of [CEDULA, CEDULA_ANULADA]) {
      const busca = c.replace(/\D/g, '');
      const suyas = sql`SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
                         WHERE p.cedula_busca = ${busca}`;
      await sql`DELETE FROM bitacora WHERE atencion_id IN (${suyas})`;
      await sql`DELETE FROM renglon  WHERE atencion_id IN (${suyas})`;
      await sql`DELETE FROM atencion WHERE paciente_id IN (
                  SELECT id FROM paciente WHERE cedula_busca = ${busca})`;
      await sql`DELETE FROM paciente WHERE cedula_busca = ${busca}`;
    }
  });
});

/* ------------------------------------------------------------------
   El documento impreso.
   ------------------------------------------------------------------ */

test('al cerrar, la atención recibe un PIN de seis dígitos', async () => {
  expect(pin).toMatch(/^[0-9]{6}$/);
});

test('el documento imprime el QR y el PIN en cada hoja', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/documento`);

  /* Una por hoja: el récipe viaja solo a la farmacia y tiene que poder
     verificarse sin el informe. */
  await expect(page.locator('.sello')).toHaveCount(2);
  await expect(page.locator('.sello__qr svg')).toHaveCount(2);
  await expect(page.locator('.sello').first()).toContainText(pin);

  // En pantalla sobra; es para el papel.
  await expect(page.locator('.sello').first()).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sello').first()).toBeVisible();
});

test('se puede descargar el informe, el récipe o los dos', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/documento`);

  const botones = await page.locator('[data-imprimir]').allInnerTexts();
  expect(botones.map((b) => b.trim())).toEqual(['Informe', 'Récipe', 'Los dos']);

  await page.emulateMedia({ media: 'print' });
  const informe = page.locator('.hoja').first();
  const recipe = page.locator('.hoja--recipe');

  await page.evaluate(() => { document.body.dataset.soloImprime = 'informe'; });
  await expect(recipe).toBeHidden();
  await expect(informe).toBeVisible();

  await page.evaluate(() => { document.body.dataset.soloImprime = 'recipe'; });
  await expect(informe).toBeHidden();
  await expect(recipe).toBeVisible();

  await page.evaluate(() => { document.body.dataset.soloImprime = 'todo'; });
  await expect(informe).toBeVisible();
  await expect(recipe).toBeVisible();
});

test('un caso sin récipe ofrece un solo botón', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${casoAnulado}/documento`);
  await expect(page.locator('[data-imprimir]')).toHaveCount(1);
});

/* ------------------------------------------------------------------
   La verificación, que es pública.
   ------------------------------------------------------------------ */

test('con la cédula y el PIN correctos, confirma el documento', async ({ page }) => {
  await page.goto(`/verificar/${caso}`);
  await page.getByLabel('Cédula del paciente').fill(CEDULA);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Verificar' }).click();

  const tarjeta = page.locator('.tarjeta');
  await expect(tarjeta).toContainText('Documento emitido por Atenmefa');
  await expect(tarjeta).toContainText(NOMBRE);
  await expect(tarjeta).toContainText(`N.° ${numero}`);
  await expect(tarjeta).toContainText('Informe de atención médica y Récipe');
});

test('la verificación NO muestra nada de la historia clínica', async ({ page }) => {
  /* Es una página pública. Confirma que el papel es auténtico, no qué dice.
     El diagnóstico y el tratamiento son del paciente y de su médico. */
  await page.goto(`/verificar/${caso}`);
  await page.getByLabel('Cédula del paciente').fill(CEDULA);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Verificar' }).click();

  const texto = await page.locator('body').innerText();
  expect(texto).not.toContain(DIAGNOSTICO);
  expect(texto).not.toContain('Ibuprofeno');
  await expect(page.locator('.tarjeta__limite')).toContainText('no muestra el contenido clínico');
});

test('el enlace del QR no alcanza sin la cédula y el PIN', async ({ page }) => {
  /* Abrir la dirección no verifica nada: pide los dos datos, y los dos están
     impresos en el papel. Reenviar el enlace no sirve. */
  await page.goto(`/verificar/${caso}`);
  await expect(page.locator('.tarjeta')).toHaveCount(0);
  await expect(page.getByLabel('PIN')).toBeVisible();
});

test('el PIN equivocado no dice si la cédula estaba bien', async ({ page }) => {
  await page.goto(`/verificar/${caso}`);
  await page.getByLabel('Cédula del paciente').fill(CEDULA);
  await page.getByLabel('PIN').fill(pin === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verificar' }).click();

  const aviso = page.locator('.aviso-ver');
  await expect(aviso).toContainText('No se pudo verificar');
  /* Decir cuál de los dos falló le diría a quien prueba al azar cuál ya
     acertó, y la cédula es lo fácil de adivinar. */
  await expect(aviso).not.toContainText('cédula');
  await expect(aviso).not.toContainText('PIN correcto');
});

test('se puede verificar a mano, con el N° de atención', async ({ page }) => {
  /* El QR lleva un uuid que nadie va a teclear. Quien no puede escanear
     escribe lo que sí está impreso en grande. */
  await page.goto('/verificar');
  await page.getByLabel('N° de atención').fill(numero);
  await page.getByLabel('Cédula del paciente').fill(CEDULA);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Verificar' }).click();

  await expect(page.locator('.tarjeta')).toContainText('Documento emitido por Atenmefa');
});

test('un documento anulado se verifica, pero dice que está anulado', async ({ page }) => {
  /* Existió y se entregó: negarlo sería mentir. Lo que hay que decir es que
     no debe usarse. */
  await page.goto(`/verificar/${casoAnulado}`);
  await page.getByLabel('Cédula del paciente').fill(CEDULA_ANULADA);
  await page.getByLabel('PIN').fill(pinAnulado);
  await page.getByRole('button', { name: 'Verificar' }).click();

  const tarjeta = page.locator('.tarjeta');
  await expect(tarjeta).toHaveClass(/tarjeta--anulada/);
  await expect(tarjeta).toContainText('ANULADO');
  await expect(tarjeta).toContainText('no debe usarse');
});

test('a los cinco intentos fallidos el documento se cierra un rato', async ({ page }) => {
  /* Un millón de combinaciones se prueban en una tarde si nada lo impide. */
  const malo = pin === '999999' ? '888888' : '999999';

  for (let i = 0; i < 5; i++) {
    await page.goto(`/verificar/${caso}`);
    await page.getByLabel('Cédula del paciente').fill(CEDULA);
    await page.getByLabel('PIN').fill(malo);
    await page.getByRole('button', { name: 'Verificar' }).click();
  }

  await expect(page.locator('.aviso-ver')).toContainText('Demasiados intentos');

  // Y ahora ni con el PIN bueno, hasta que pase el rato.
  await page.goto(`/verificar/${caso}`);
  await page.getByLabel('Cédula del paciente').fill(CEDULA);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.locator('.aviso-ver')).toContainText('Demasiados intentos');

  // Se libera para no dejar el caso trabado para las demás pruebas.
  await conBase((sql) => sql`
    UPDATE atencion SET intentos_fallidos = 0, bloqueada_hasta = NULL WHERE id = ${caso}`);
});

test('la página de verificación no se indexa', async ({ page }) => {
  /* No es contenido: es una herramienta para quien ya tiene el papel, y cada
     dirección lleva el id de una atención. */
  await page.goto('/verificar');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
