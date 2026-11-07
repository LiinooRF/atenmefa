/**
 * Pacientes sin cédula.
 *
 * Pasa, y en un centro de salud pasa seguido: un extranjero con pasaporte,
 * un recién nacido que todavía no la tiene, y el caso que de verdad importa,
 * alguien que llega inconsciente a una emergencia sin nada encima. Negarse a
 * registrar la atención hasta que aparezca un documento no es una opción.
 *
 * Lo que se vigila acá son tres cosas que, si fallan, hacen daño:
 *
 *   · que la salida siga siendo SECUNDARIA. La cédula es el camino y esto
 *     es la excepción: si se ofreciera al lado, en una recepción apurada se
 *     usaría por comodidad y el registro se llenaría de personas imposibles
 *     de cruzar con su seguro;
 *   · que un pasaporte de puros números NO se confunda con la cédula de
 *     otra persona, que es lo que pasaría si la llave no llevara prefijo;
 *   · que al que llegó sin nada se le pueda colgar la atención hoy y se lo
 *     reconozca si vuelve.
 */
import { test, expect } from '@playwright/test';
import { entrar, borrarPorLlave, pacientePorLlave } from './apoyo';

test.describe.configure({ mode: 'serial' });

const PASAPORTE = 'A7731204';
const PASAPORTE_NUMERICO = '7731205';
const CEDULA_HOMONIMA = 'V-7.731.205';

const NOMBRE_EXTRANJERO = 'Jean Pierre Mouton de Prueba';
const NOMBRE_PASAPORTE_NUM = 'Numérico Pasaporte de Prueba';
const NOMBRE_CEDULA = 'Homónima Cédula de Prueba';
const NOMBRE_SIN_DOC = 'Sin Documento Uno de Prueba';

/** Los internos se van creando sobre la marcha: se juntan para limpiarlos. */
const internos: string[] = [];

test.afterAll(async () => {
  await borrarPorLlave(
    `P:${PASAPORTE}`,
    `P:${PASAPORTE_NUMERICO}`,
    '7731205',
    ...internos,
  );
});

/* ------------------------------------------------------------------
   Que siga siendo la excepción.
   ------------------------------------------------------------------ */

test('la puerta pregunta por la cédula y lo demás viene cerrado', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');

  await expect(page.getByLabel('Cédula del paciente')).toBeVisible();

  /* Un <details> cerrado: está, se encuentra, pero hay que abrirlo. Si algún
     día alguien lo deja abierto de entrada, esta prueba lo dice. */
  const salida = page.locator('details.otro');
  await expect(salida).toHaveJSProperty('open', false);
  await expect(page.locator('#doc')).toBeHidden();

  await salida.locator('summary').click();
  await expect(page.locator('#doc')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar sin documento' })).toBeVisible();
});

/* ------------------------------------------------------------------
   Pasaporte.
   ------------------------------------------------------------------ */

test('con pasaporte se registra y queda guardado como pasaporte', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?doc=pasaporte&cedula=${PASAPORTE}`);

  await page.locator('#c-nombre').fill(NOMBRE_EXTRANJERO);
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);

  const guardado = await pacientePorLlave(`P:${PASAPORTE}`);
  expect(guardado?.tipo_doc).toBe('pasaporte');
  expect(guardado?.cedula).toBe(PASAPORTE);
  expect(guardado?.nombre).toBe(NOMBRE_EXTRANJERO);
});

test('el mismo pasaporte escrito distinto es la misma persona', async ({ page }) => {
  await entrar(page, 'medico');
  // Con guion, con espacio y en minúscula: en recepción nadie lo teclea igual.
  await page.goto(`/sistema/atencion/nueva?doc=pasaporte&cedula=${encodeURIComponent('a-773 1204')}`);

  await expect(page.locator('.form__nota')).toContainText(NOMBRE_EXTRANJERO);
  await expect(page.locator('.form__nota')).toContainText('Pasaporte');
});

test('un pasaporte de puros números no se come la cédula de otra persona', async ({ page }) => {
  await entrar(page, 'medico');

  await page.goto(`/sistema/atencion/nueva?doc=pasaporte&cedula=${PASAPORTE_NUMERICO}`);
  await page.locator('#c-nombre').fill(NOMBRE_PASAPORTE_NUM);
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);

  /* Mismos dígitos, documento distinto. Sin el prefijo en la llave, este
     segundo registro se habría pegado al anterior y dos personas pasarían a
     compartir historia clínica. */
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_HOMONIMA)}`);
  await expect(page.locator('.form__nota')).not.toContainText(NOMBRE_PASAPORTE_NUM);
  await expect(page.locator('.form__nota')).toContainText('Paciente nuevo');

  await page.locator('#c-nombre').fill(NOMBRE_CEDULA);
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);

  const conPasaporte = await pacientePorLlave(`P:${PASAPORTE_NUMERICO}`);
  const conCedula = await pacientePorLlave('7731205');
  expect(conPasaporte?.nombre).toBe(NOMBRE_PASAPORTE_NUM);
  expect(conCedula?.nombre).toBe(NOMBRE_CEDULA);
  expect(conPasaporte?.tipo_doc).toBe('pasaporte');
  expect(conCedula?.tipo_doc).toBe('cedula');
});

/* ------------------------------------------------------------------
   Sin ningún documento.
   ------------------------------------------------------------------ */

test('al que no trae nada el sistema le asigna un número y lo dice', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('details.otro summary').click();
  await page.getByRole('button', { name: 'Registrar sin documento' }).click();

  /* El número queda en la dirección a propósito: si viviera solo en la
     pantalla, recargar quemaría uno nuevo cada vez. */
  await expect(page).toHaveURL(/\?doc=interno&cedula=SD-\d{6}$/);
  const asignado = new URL(page.url()).searchParams.get('cedula')!;
  internos.push(`SD:${Number(asignado.slice(3))}`);

  await expect(page.locator('.form__nota')).toContainText(asignado);
  await expect(page.locator('.form__nota')).toContainText('sin documento');

  // Recargar no gasta otro número.
  await page.reload();
  expect(new URL(page.url()).searchParams.get('cedula')).toBe(asignado);
});

test('dos personas sin documento no se mezclan, y la que vuelve se reconoce', async ({ page }) => {
  await entrar(page, 'medico');

  const registrar = async (nombre: string) => {
    await page.goto('/sistema/atencion/nueva?doc=interno');
    const numero = new URL(page.url()).searchParams.get('cedula')!;
    internos.push(`SD:${Number(numero.slice(3))}`);
    await page.locator('#c-nombre').fill(nombre);
    await page.getByRole('button', { name: 'Guardar y salir' }).click();
    await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);
    return numero;
  };

  const uno = await registrar(NOMBRE_SIN_DOC);
  const dos = await registrar('Sin Documento Dos de Prueba');
  expect(uno).not.toBe(dos);

  // El que vuelve con su papelito: el sistema ya lo conoce.
  await page.goto(`/sistema/atencion/nueva?doc=interno&cedula=${uno}`);
  await expect(page.locator('.form__nota')).toContainText(NOMBRE_SIN_DOC);
  await expect(page.locator('.form__nota')).toContainText(uno);
});

test('el registro de pacientes dice qué documento trae cada uno', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes?q=${encodeURIComponent(NOMBRE_EXTRANJERO)}`);

  const fila = page.locator('tbody tr').filter({ hasText: NOMBRE_EXTRANJERO }).first();
  await expect(fila).toContainText('Pasaporte');
  await expect(fila).toContainText(PASAPORTE);
});

test('abierta, la salida tampoco desborda ni deja botones chicos a 390 px', async ({ page }) => {
  /* La prueba general de 390 px recorre esta pantalla, pero el <details>
     viene cerrado y lo de adentro no se mide. Se abre acá. */
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva');
  await page.locator('details.otro summary').click();

  const medida = await page.evaluate(() => ({
    ventana: document.documentElement.clientWidth,
    pagina: document.documentElement.scrollWidth,
  }));
  expect(medida.pagina).toBeLessThanOrEqual(medida.ventana + 1);

  const seToca = page.locator(
    'details.otro summary:visible, details.otro button:visible, ' +
    'details.otro select:visible, details.otro input:visible',
  );
  for (let i = 0; i < (await seToca.count()); i++) {
    const caja = await seToca.nth(i).boundingBox();
    const texto = (await seToca.nth(i).innerText()).replace(/\s+/g, ' ').trim()
      || (await seToca.nth(i).getAttribute('name'));
    expect.soft(caja?.height ?? 0, `"${texto}" mide ${Math.round(caja?.height ?? 0)} px`)
      .toBeGreaterThanOrEqual(44);
  }
});
