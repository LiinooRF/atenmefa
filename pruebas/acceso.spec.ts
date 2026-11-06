/**
 * Acceso al sistema interno.
 *
 * Es la primera puerta y la que más importa: adentro hay historias
 * clínicas. Se prueba que sin sesión no se entra, que una clave mala no
 * abre nada, que el panel dice de quién es la sesión, que ninguna pantalla
 * se puede indexar y que salir de verdad cierra.
 *
 * No crea ni toca datos, así que no hay nada que limpiar.
 */
import { test, expect } from '@playwright/test';
import { CUENTAS, entrar, salir } from './apoyo';

test('sin sesión, el panel manda a la pantalla de entrada', async ({ page }) => {
  await page.goto('/sistema');

  await expect(page).toHaveURL(/\/sistema\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  // La barra del panel no se dibuja sin usuario: no hay nada que mirar.
  await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(0);
});

test('la ficha de un caso tampoco se abre sin sesión', async ({ page }) => {
  // El guardia es del middleware, no de cada pantalla: cualquier ruta de
  // adentro contesta lo mismo, incluso una que no existe.
  const respuesta = await page.request.get('/sistema/atencion/nueva', { maxRedirects: 0 });

  expect(respuesta.status()).toBe(302);
  expect(respuesta.headers()['location']).toBe('/sistema/entrar');
});

test('la clave equivocada muestra el error y no deja entrar', async ({ page }) => {
  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill(CUENTAS.medico.correo);
  await page.getByLabel('Clave').fill('esta-no-es-la-clave');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.locator('.sis-error')).toContainText('Correo o clave incorrectos.');
  await expect(page).toHaveURL(/\/sistema\/entrar$/);

  // Y la sesión no quedó abierta por el intento.
  await page.goto('/sistema');
  await expect(page).toHaveURL(/\/sistema\/entrar$/);
});

test('con la clave correcta entra y la barra dice quién es', async ({ page }) => {
  const cuenta = await entrar(page, 'medico');

  const quien = page.locator('.sis__quien');
  await expect(quien).toContainText(cuenta.nombre);
  await expect(quien).toContainText(cuenta.rol);
  await expect(page.getByRole('heading', { name: 'Casos atendidos' })).toBeVisible();
});

test('administración entra con su propia cuenta', async ({ page }) => {
  const cuenta = await entrar(page, 'administracion');

  await expect(page.locator('.sis__quien')).toContainText(cuenta.nombre);
});

test('toda respuesta del sistema trae X-Robots-Tag noindex', async ({ page }) => {
  // La pantalla de entrada se ve sin sesión, así que se revisa antes.
  const entrada = await page.goto('/sistema/entrar');
  expect(entrada?.headers()['x-robots-tag']).toContain('noindex');

  await entrar(page, 'administracion');

  const rutas = [
    '/sistema',
    '/sistema/borradores',
    '/sistema/servicios',
    '/sistema/cierre',
    '/sistema/atencion/nueva',
  ];

  for (const ruta of rutas) {
    const respuesta = await page.goto(ruta);
    expect.soft(respuesta?.headers()['x-robots-tag'], `cabecera de ${ruta}`).toContain('noindex');
  }

  // La descarga del cierre también pasa por el middleware. Se pide un mes
  // sin nada cerrado a propósito: lo que se mira es la cabecera, no el
  // archivo, y así la prueba no deja un 'exporto' en bitácora.
  const descarga = await page.request.get('/sistema/cierre/exportar?mes=1999-01');
  expect(descarga.headers()['x-robots-tag']).toContain('noindex');
});

test('salir invalida la sesión', async ({ page }) => {
  await entrar(page, 'medico');
  await salir(page);

  await page.goto('/sistema');
  await expect(page).toHaveURL(/\/sistema\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

/* ---------------------------------------------------------------
   Origen de los formularios.

   El chequeo de Astro compara contra el esquema del socket, que detrás
   de un proxy que termina el TLS es http y nunca coincide con el https
   del navegador: todo formulario daba 403 en producción. Se reemplazó
   por uno propio contra URL_BASE, y esto lo vigila.
   --------------------------------------------------------------- */

test('un formulario desde otro sitio se rechaza', async ({ request }) => {
  const r = await request.post('/sistema/entrar', {
    form: { correo: 'medico@atenmefa.local', clave: 'clave-de-prueba-1' },
    headers: { Origin: 'https://sitio-ajeno.example' },
    maxRedirects: 0,
  });
  expect(r.status()).toBe(403);
});

test('un formulario que no dice de dónde viene se rechaza', async ({ request }) => {
  const r = await request.post('/sistema/entrar', {
    form: { correo: 'medico@atenmefa.local', clave: 'clave-de-prueba-1' },
    maxRedirects: 0,
  });
  expect(r.status()).toBe(403);
});

test('un formulario del propio sitio pasa', async ({ request }) => {
  const r = await request.post('/sistema/entrar', {
    form: { correo: 'medico@atenmefa.local', clave: 'clave-de-prueba-1' },
    headers: { Origin: 'http://localhost:4399' },
    maxRedirects: 0,
  });
  expect(r.status()).toBe(302);
});
