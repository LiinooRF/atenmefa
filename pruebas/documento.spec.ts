/**
 * El documento imprimible: informe de atención y récipe.
 *
 * Es el "2 en 1" que pidió el cliente y la única cosa del sistema que sale
 * en papel, así que lo que se vigila es el conteo de hojas: dos cuando hay
 * récipe y una sola cuando no, porque una segunda hoja en blanco con el
 * encabezado de la clínica parece un récipe que nadie llenó.
 */
import { test, expect } from '@playwright/test';
import {
  bitacoraDe, borrarPacientes, cedulaDePrueba, crearAtencionCerrada, crearBorrador, entrar,
  numeroDelCaso,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA_CON_RECIPE = cedulaDePrueba(5, 0);
const CEDULA_SIN_RECIPE = cedulaDePrueba(5, 1);
const CEDULA_BORRADOR = cedulaDePrueba(5, 2);

const NOMBRE_CON_RECIPE = 'Yolanda del Valle Mora de Prueba';
const NOMBRE_SIN_RECIPE = 'Simón Eduardo Lara de Prueba';
const MEDICAMENTO = 'Amoxicilina 500 mg, una cápsula cada 8 horas por 7 días';

let conRecipe = '';
let numeroConRecipe = '';
let sinRecipe = '';
let borrador = '';

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page, 'medico');

  conRecipe = await crearAtencionCerrada(page, {
    nombre: NOMBRE_CON_RECIPE,
    cedula: CEDULA_CON_RECIPE,
    idx: 'Faringoamigdalitis aguda',
    recipe: MEDICAMENTO,
    indicaciones: 'Reposo y abundante líquido. Control en 48 horas.',
  });
  numeroConRecipe = await numeroDelCaso(page);

  sinRecipe = await crearAtencionCerrada(page, {
    nombre: NOMBRE_SIN_RECIPE,
    cedula: CEDULA_SIN_RECIPE,
    idx: 'Contusión de rodilla derecha',
  });

  borrador = await crearBorrador(page, {
    nombre: 'Borrador para imprimir de prueba',
    cedula: CEDULA_BORRADOR,
  });

  await page.close();
});

test.afterAll(async () => {
  await borrarPacientes(CEDULA_CON_RECIPE, CEDULA_SIN_RECIPE, CEDULA_BORRADOR);
});

test('el documento abre con dos hojas cuando hay récipe', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${conRecipe}/documento`);

  const hojas = page.locator('article.hoja');
  await expect(hojas).toHaveCount(2);

  // Primera hoja: el informe, con quién es y qué se le encontró.
  await expect(hojas.first()).toContainText('Informe de atención médica');
  await expect(hojas.first()).toContainText(NOMBRE_CON_RECIPE);
  await expect(hojas.first()).toContainText(CEDULA_CON_RECIPE);
  await expect(hojas.first()).toContainText(`N° ${numeroConRecipe}`);
  await expect(hojas.first()).toContainText('Faringoamigdalitis aguda');
  // El récipe no se repite en el informe: tiene su propia hoja.
  await expect(hojas.first()).not.toContainText(MEDICAMENTO);

  // Segunda hoja: el récipe, con el medicamento y las indicaciones.
  const receta = hojas.nth(1);
  await expect(receta).toHaveClass(/hoja--recipe/);
  await expect(receta).toContainText('Récipe');
  await expect(receta).toContainText(MEDICAMENTO);
  await expect(receta).toContainText('Control en 48 horas');
  await expect(receta).toContainText(NOMBRE_CON_RECIPE);

  // Imprimir una historia también queda registrado.
  expect(await bitacoraDe(conRecipe)).toContain('imprimio');
});

test('el documento es una sola hoja cuando no hay récipe', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${sinRecipe}/documento`);

  await expect(page.locator('article.hoja')).toHaveCount(1);
  await expect(page.locator('article.hoja')).toContainText('Contusión de rodilla derecha');
  await expect(page.locator('.hoja--recipe')).toHaveCount(0);
});

test('el documento de un borrador avisa que no es el definitivo', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${borrador}/documento`);

  await expect(page.locator('.aviso')).toContainText('borrador');
  await expect(page.locator('.aviso')).toContainText('se imprime una vez cerrada');
});

test('la ficha del caso enlaza al documento', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${conRecipe}`);

  const enlace = page.getByRole('link', { name: 'Documento' });
  await expect(enlace).toHaveAttribute('href', `/sistema/atencion/${conRecipe}/documento`);
  // Se abre aparte para no perder la ficha que el médico está mirando.
  await expect(enlace).toHaveAttribute('target', '_blank');
});

/* ------------------------------------------------------------------
   Carta u oficio.
   ------------------------------------------------------------------ */

test('el documento deja elegir entre carta y oficio, y arranca en carta', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${conRecipe}/documento`);

  await expect(page.getByRole('radio', { name: /Carta/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Oficio/ })).toHaveAttribute('aria-checked', 'false');
});

test('elegir oficio cambia el tamaño con el que se pagina', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${conRecipe}/documento`);

  const regla = () => page.locator('#papel').textContent();

  // 21,6 × 33 cm. El "legal" de los navegadores mide 35,6 de alto y no sirve.
  await page.getByRole('radio', { name: /Oficio/ }).click();
  expect(await regla()).toContain('216mm 330mm');

  await page.getByRole('radio', { name: /Carta/ }).click();
  expect(await regla()).toContain('letter');
});

test('el papel elegido sigue puesto al volver a abrir el documento', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${conRecipe}/documento`);
  await page.getByRole('radio', { name: /Oficio/ }).click();

  await page.goto(`/sistema/atencion/${sinRecipe}/documento`);
  await expect(page.getByRole('radio', { name: /Oficio/ })).toHaveAttribute('aria-checked', 'true');
  expect(await page.locator('#papel').textContent()).toContain('216mm 330mm');
});

test('cada hoja impresa lleva de quién es, no solo la primera', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${conRecipe}/documento`);

  /* El pie va en un <tfoot>, que el navegador repite al pie de cada página
     impresa. En pantalla sobra, porque la hoja se ve entera y con membrete. */
  const pies = page.locator('.corrida > tfoot .pie');
  await expect(pies).toHaveCount(2); // informe y récipe
  await expect(pies.first()).toBeHidden();

  await page.emulateMedia({ media: 'print' });
  await expect(pies.first()).toBeVisible();
  await expect(pies.first()).toContainText(NOMBRE_CON_RECIPE);
  await expect(pies.first()).toContainText(`N.° ${numeroConRecipe}`);
});
