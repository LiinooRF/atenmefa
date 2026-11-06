/**
 * Cuentas y bitácora.
 *
 * Hasta acá las cuentas se creaban por línea de comandos: el centro no
 * podía dar de alta a nadie solo. Y la bitácora registraba todo sin que
 * hubiera forma de leerla.
 */
import { test, expect } from '@playwright/test';
import { entrar, salir, conBase, CORRIDA } from './apoyo';

const CORREO = `prueba.cuenta.${CORRIDA}@atenmefa.local`;
const CLAVE = 'clave-larga-de-prueba';
const CLAVE_NUEVA = 'otra-clave-larga-1';
const CORREO_FLOJA = `floja.${CORRIDA}@atenmefa.local`;

/**
 * La cuenta de prueba se borra entera, y el orden importa: bitacora tiene
 * clave foránea contra user, así que mientras quede un movimiento suyo la
 * fila no se puede eliminar. Eso no es un estorbo, es el diseño: por eso
 * en el sistema se da de baja y no se borra.
 */
test.afterAll(async () => {
  await conBase(async (sql) => {
    const ids = await sql`SELECT id FROM "user" WHERE email IN (${CORREO}, ${CORREO_FLOJA})`;
    for (const { id } of ids) {
      await sql`DELETE FROM bitacora WHERE usuario_id = ${id}`;
      await sql`DELETE FROM bitacora WHERE detalle->>'usuario' = ${id}`;
      await sql`DELETE FROM account WHERE user_id = ${id}`;
      await sql`DELETE FROM session WHERE user_id = ${id}`;
      await sql`DELETE FROM "user" WHERE id = ${id}`;
    }
  });
});

/* ---------------------------------------------------------------
   Quién entra a la pantalla.
   --------------------------------------------------------------- */

test('el médico no puede abrir las cuentas', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/usuarios');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});

test('el médico no puede abrir la bitácora', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/bitacora');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});

/* ---------------------------------------------------------------
   Alta, y que la cuenta nueva sirva de verdad.
   --------------------------------------------------------------- */

test('administración crea una cuenta y esa cuenta puede entrar', async ({ page, browser }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/usuarios');

  const alta = page.locator('form.alta');
  await alta.getByLabel('Nombre y apellido').fill('Cuenta Recien Creada');
  await alta.getByLabel('Correo').fill(CORREO);
  await alta.getByLabel('Rol', { exact: true }).selectOption('medico');
  await alta.getByLabel('Colegiatura').fill('9999');
  await alta.getByLabel('Clave provisional').fill(CLAVE);
  await alta.getByRole('button', { name: 'Crear la cuenta' }).click();

  await expect(page.locator('.msj--bien')).toContainText('Cuenta creada');
  await expect(page.getByText(CORREO)).toBeVisible();

  // Lo que importa: que con esa clave se entre.
  const otra = await browser.newContext();
  const nueva = await otra.newPage();
  await nueva.goto('/sistema/entrar');
  await nueva.getByLabel('Correo').fill(CORREO);
  await nueva.getByLabel('Clave').fill(CLAVE);
  await nueva.getByRole('button', { name: 'Entrar' }).click();
  await expect(nueva).toHaveURL(/\/sistema$/);
  await expect(nueva.locator('.sis__yo')).toContainText('Cuenta Recien Creada');
  await otra.close();
});

test('no deja repetir un correo', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/usuarios');
  const alta = page.locator('form.alta');
  await alta.getByLabel('Nombre y apellido').fill('Otra Persona');
  await alta.getByLabel('Correo').fill(CORREO);
  await alta.getByLabel('Clave provisional').fill('clave-larga-distinta');
  await alta.getByRole('button', { name: 'Crear la cuenta' }).click();
  await expect(page.locator('.sis-error')).toContainText('Ya hay una cuenta');
});

test('rechaza una clave floja', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/usuarios');
  const alta = page.locator('form.alta');
  await alta.getByLabel('Nombre y apellido').fill('Clave Floja');
  await alta.getByLabel('Correo').fill(CORREO_FLOJA);
  await alta.getByLabel('Clave provisional').fill('1234567890');
  await alta.getByRole('button', { name: 'Crear la cuenta' }).click();
  await expect(page.locator('.sis-error')).toContainText('solo números');
});

/* ---------------------------------------------------------------
   Uno no puede cerrarse la puerta por dentro.
   --------------------------------------------------------------- */

test('administración no puede darse de baja a sí misma', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/usuarios');

  const miFila = page.locator('li', { hasText: 'usted' }).first();
  await expect(miFila.getByRole('button', { name: 'Dar de baja' })).toBeDisabled();
  await expect(miFila.getByRole('button', { name: 'Cambiar' }).first()).toBeDisabled();
});

/* ---------------------------------------------------------------
   Dar de baja.
   --------------------------------------------------------------- */

test('la cuenta dada de baja deja de entrar', async ({ page, browser }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/usuarios');

  const fila = page.locator('li').filter({ hasText: CORREO });
  await fila.getByRole('button', { name: 'Dar de baja' }).click();
  await expect(page.locator('.msj--bien')).toContainText('sin acceso');

  const otra = await browser.newContext();
  const caida = await otra.newPage();
  await caida.goto('/sistema/entrar');
  await caida.getByLabel('Correo').fill(CORREO);
  await caida.getByLabel('Clave').fill(CLAVE);
  await caida.getByRole('button', { name: 'Entrar' }).click();
  // Entra el login pero el guardia la saca: la cuenta está inactiva.
  await expect(caida).toHaveURL(/\/sistema\/entrar/);
  await otra.close();

  // Se le devuelve el acceso para las pruebas que siguen.
  await page.goto('/sistema/usuarios');
  await page.locator('li').filter({ hasText: CORREO })
    .getByRole('button', { name: 'Dar acceso' }).click();
  await expect(page.locator('.msj--bien')).toContainText('vuelve a tener acceso');
});

/* ---------------------------------------------------------------
   La propia clave.
   --------------------------------------------------------------- */

test('la clave actual equivocada no deja cambiar nada', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/mi-clave');
  await page.getByLabel('Clave actual').fill('no-es-la-clave');
  await page.getByLabel('Clave nueva', { exact: true }).fill('clave-nueva-larga');
  await page.getByLabel('Repita la clave nueva').fill('clave-nueva-larga');
  await page.getByRole('button', { name: 'Cambiar mi clave' }).click();
  await expect(page.locator('.sis-error')).toContainText('no es correcta');
});

test('las dos claves nuevas tienen que coincidir', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/mi-clave');
  await page.getByLabel('Clave actual').fill('clave-de-prueba-2');
  await page.getByLabel('Clave nueva', { exact: true }).fill('clave-nueva-larga');
  await page.getByLabel('Repita la clave nueva').fill('clave-nueva-distinta');
  await page.getByRole('button', { name: 'Cambiar mi clave' }).click();
  await expect(page.locator('.sis-error')).toContainText('no coinciden');
});

test('cambiar la propia clave cierra la sesión y la nueva sirve', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('/sistema/entrar');
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByLabel('Clave').fill(CLAVE);
  await p.getByRole('button', { name: 'Entrar' }).click();
  await expect(p).toHaveURL(/\/sistema$/);

  await p.goto('/sistema/mi-clave');
  await p.getByLabel('Clave actual').fill(CLAVE);
  await p.getByLabel('Clave nueva', { exact: true }).fill(CLAVE_NUEVA);
  await p.getByLabel('Repita la clave nueva').fill(CLAVE_NUEVA);
  await p.getByRole('button', { name: 'Cambiar mi clave' }).click();
  await expect(p.locator('h2')).toContainText('Clave cambiada');

  // La sesión vieja ya no vale.
  await p.goto('/sistema');
  await expect(p).toHaveURL(/\/sistema\/entrar/);

  // Y la nueva sí.
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByLabel('Clave').fill(CLAVE_NUEVA);
  await p.getByRole('button', { name: 'Entrar' }).click();
  await expect(p).toHaveURL(/\/sistema$/);
  await ctx.close();
});

/* ---------------------------------------------------------------
   Bitácora.
   --------------------------------------------------------------- */

test('la bitácora muestra el alta de la cuenta', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/bitacora');
  await expect(page.locator('table')).toContainText('Creó una cuenta');
});

test('la bitácora filtra por acción', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/bitacora');
  await page.getByLabel('Qué hizo').selectOption('creo_usuario');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/accion=creo_usuario/);
  const filas = page.locator('tbody tr');
  const cuantas = await filas.count();
  for (let i = 0; i < cuantas; i++) {
    await expect(filas.nth(i)).toContainText('Creó una cuenta');
  }
});

test('ninguna de las pantallas nuevas desborda a 390 px', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const ruta of ['/sistema/usuarios', '/sistema/bitacora', '/sistema/mi-clave']) {
    await page.goto(ruta);
    const m = await page.evaluate(() => ({
      documento: document.documentElement.scrollWidth,
      ventana: document.documentElement.clientWidth,
    }));
    expect.soft(m.documento, `${ruta} mide ${m.documento} en ${m.ventana}`).toBeLessThanOrEqual(m.ventana + 1);
  }
});
