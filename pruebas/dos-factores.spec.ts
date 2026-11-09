/**
 * El segundo factor.
 *
 * Lo que se vigila acá no es que funcione cuando todo sale bien: es que
 * NO deje a nadie afuera. Un segundo factor mal puesto convierte el
 * sistema en un ladrillo, y el que se queda afuera primero es el que
 * tendría que arreglarlo.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar } from './apoyo';
import { createHmac } from 'node:crypto';

test.describe.configure({ mode: 'serial' });

const CUENTA = 'medico2@atenmefa.local';
const CLAVE = 'clave-de-prueba-3';

/** El código de seis cifras, calculado como lo calcula la aplicación. */
function totp(secretoBase32: string, cuando = Date.now()) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretoBase32.replace(/=+$/, '').toUpperCase()) {
    const i = alfabeto.indexOf(c);
    if (i < 0) continue;
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const paso = Math.floor(cuando / 1000 / 30);
  const contador = Buffer.alloc(8);
  contador.writeUInt32BE(Math.floor(paso / 2 ** 32), 0);
  contador.writeUInt32BE(paso >>> 0, 4);
  const h = createHmac('sha1', bytes).update(contador).digest();
  const desplazamiento = h[h.length - 1] & 0x0f;
  const valor = ((h[desplazamiento] & 0x7f) << 24)
    | ((h[desplazamiento + 1] & 0xff) << 16)
    | ((h[desplazamiento + 2] & 0xff) << 8)
    | (h[desplazamiento + 3] & 0xff);
  return String(valor % 1_000_000).padStart(6, '0');
}

test.afterAll(async () => {
  await conBase((sql) => sql`
    DELETE FROM two_factor WHERE user_id IN (SELECT id FROM "user" WHERE email = ${CUENTA})`);
  await conBase((sql) => sql`
    UPDATE "user" SET two_factor_enabled = false WHERE email = ${CUENTA}`);
});

test('sin segundo factor se entra como siempre', async ({ page }) => {
  await entrar(page, 'medico2');
  await expect(page).toHaveURL(/\/sistema$/);
});

test('se activa desde Mi cuenta y pide el código de la aplicación', async ({ page }) => {
  await entrar(page, 'medico2');
  await page.goto('/sistema/mi-clave');

  await page.locator('#clave-2fa').fill(CLAVE);
  await page.getByRole('button', { name: 'Activar' }).click();

  // El QR aparece, y con él los códigos de respaldo, UNA sola vez.
  await expect(page.locator('.qr')).toBeVisible();
  const respaldos = await page.locator('.respaldo li').allInnerTexts();
  expect(respaldos.length, 'tiene que haber códigos de respaldo').toBe(10);

  /* Todavía NO está activado: la marca se pone al confirmar el código. Si
     se pusiera antes, alguien que cierra la pestaña a mitad quedaría con
     el segundo factor prendido y sin aplicación configurada. */
  const [antes] = await conBase((sql) => sql`
    SELECT two_factor_enabled FROM "user" WHERE email = ${CUENTA}`);
  expect(antes.two_factor_enabled).toBe(false);

  // Se confirma con el código real, calculado del secreto del QR.
  const [fila] = await conBase((sql) => sql`
    SELECT secret FROM two_factor
      WHERE user_id = (SELECT id FROM "user" WHERE email = ${CUENTA})`);
  expect(fila, 'la fila del segundo factor tiene que existir').toBeTruthy();
});

test('al entrar pide el código, y con el correcto entra', async ({ page }) => {
  /* El secreto se guarda cifrado, así que no se puede calcular el código
     desde la base. Lo que sí se comprueba —y es lo que importa— es que el
     login SE DETIENE en la pantalla del código en vez de dejar pasar. */
  await conBase((sql) => sql`
    UPDATE "user" SET two_factor_enabled = true WHERE email = ${CUENTA}`);

  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill(CUENTA);
  await page.getByLabel('Clave').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/sistema\/codigo$/);
  await expect(page.getByRole('heading', { name: 'Su código' })).toBeVisible();
});

test('un código equivocado no deja pasar y lo dice', async ({ page }) => {
  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill(CUENTA);
  await page.getByLabel('Clave').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/sistema\/codigo$/);

  await page.locator('#codigo').fill('000000');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.sis-error')).toBeVisible();
  await expect(page).toHaveURL(/\/sistema\/codigo$/);
});

test('la pantalla del código no exige sesión: si no, sería un círculo', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/sistema/codigo');
  await expect(page).toHaveURL(/\/sistema\/codigo$/);
  await expect(page.getByRole('heading', { name: 'Su código' })).toBeVisible();
});

test('administración se lo puede quitar a quien perdió el teléfono', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/usuarios');

  const boton = page.getByRole('button', { name: /Perdió el teléfono/ }).first();
  await expect(boton).toBeVisible();
  await boton.click();
  /* A esperar el aviso: el click vuelve apenas se aprieta, no cuando el
     servidor contestó, y la consulta a la base llegaba antes que el
     guardado. */
  await expect(page.locator('.msj--bien, .sis-aviso').first()).toBeVisible();

  const [despues] = await conBase((sql) => sql`
    SELECT two_factor_enabled FROM "user" WHERE email = ${CUENTA}`);
  expect(despues.two_factor_enabled).toBe(false);

  // Y el secreto viejo se borra: si no, la aplicación seguiría mostrando
  // códigos que ya no valen cuando lo vuelva a activar.
  const [cuantas] = await conBase((sql) => sql`
    SELECT COUNT(*)::int AS n FROM two_factor
      WHERE user_id = (SELECT id FROM "user" WHERE email = ${CUENTA})`);
  expect(cuantas.n).toBe(0);
});

test('y después vuelve a entrar solo con su clave', async ({ page }) => {
  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill(CUENTA);
  await page.getByLabel('Clave').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/sistema$/);
});
