/**
 * Interconsultas.
 *
 * El médico elige la especialidad que hace falta; administración ve los
 * especialistas de esa área con su precio y les escribe por WhatsApp con un
 * toque. Lo que se vigila: que quede anotado a quién se le escribió, que el
 * mensaje no lleve datos del paciente —va por WhatsApp— y que cada quien
 * haga solo lo suyo. Ver 026-interconsultas.sql.
 */
import { test, expect, type Page } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba, crearAtencionCerrada, borrarPacientes } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(20, 0);
const PACIENTE = 'Interconsulta de Prueba Salazar';
const ESPECIALISTA = 'Dra. Oftalmóloga de Prueba';

let consulta = '';

const limpiar = async () => {
  await borrarPacientes(CEDULA);
  await conBase((sql) => sql`DELETE FROM especialista WHERE nombre LIKE '%de Prueba%'`);
};
test.beforeAll(limpiar);
test.afterAll(limpiar);

/** Un POST armado a mano, desde la página: con el origen del sitio y sin
    pasar por lo que la pantalla dibujó. */
const postearAMano = (page: Page, url: string, campos: Record<string, string>) =>
  page.evaluate(async ({ url, campos }) => {
    const datos = new FormData();
    for (const [k, v] of Object.entries(campos)) datos.append(k, v);
    return (await fetch(url, { method: 'POST', body: datos })).text();
  }, { url, campos });

test('administración carga un especialista con su precio y su WhatsApp', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/especialistas');

  // Un número que no es número no se guarda.
  await page.locator('#especialidad').fill('Oftalmología');
  await page.locator('#nombre').fill(ESPECIALISTA);
  await page.locator('#whatsapp').fill('123');
  await page.getByRole('button', { name: 'Cargar' }).click();
  await expect(page.locator('.sis-error')).toContainText('no se entiende');

  await page.locator('#whatsapp').fill('0414-1234567');
  await page.locator('#precio').fill('40,00');
  await page.getByRole('button', { name: 'Cargar' }).click();
  await expect(page.locator('.msj--bien')).toContainText('Especialista cargado');
  await expect(page.locator('.lista li', { hasText: ESPECIALISTA })).toContainText('0414-1234567');

  const [e] = await conBase((sql) => sql`
    SELECT whatsapp, precio::text AS precio FROM especialista WHERE nombre = ${ESPECIALISTA}`);
  expect(e.whatsapp).toBe('584141234567');
  expect(e.precio).toBe('40.00');
});

test('el médico pide una interconsulta eligiendo la especialidad', async ({ page }) => {
  await entrar(page, 'medico');
  consulta = await crearAtencionCerrada(page, { cedula: CEDULA, nombre: PACIENTE });
  await page.goto(`/sistema/atencion/${consulta}`);

  const seccion = page.locator('#interconsultas');
  await seccion.locator('input[name="tipo_derivacion"][value="externa"]').check();
  await seccion.locator('#especialidad').selectOption('Oftalmología');
  await seccion.locator('#motivo_interconsulta').fill('Ojo rojo con baja de visión, descartar glaucoma.');
  await seccion.getByRole('button', { name: 'Derivar' }).click();

  await expect(page.locator('#interconsultas .msj--bien')).toContainText('Derivación pedida');
  await expect(page.locator('#interconsultas .ic')).toContainText('Pendiente');

  // Dos veces la misma, abierta, no: es casi siempre un doble clic.
  await seccion.locator('input[name="tipo_derivacion"][value="externa"]').check();
  await seccion.locator('#especialidad').selectOption('Oftalmología');
  await seccion.getByRole('button', { name: 'Derivar' }).click();
  await expect(page.locator('#interconsultas .sis-error')).toContainText('Ya hay una derivación a Oftalmología');
});

test('y una de un área que todavía no tiene especialista cargado', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}`);
  const seccion = page.locator('#interconsultas');
  await seccion.locator('input[name="tipo_derivacion"][value="externa"]').check();
  await seccion.locator('#especialidad').selectOption('__otra');
  await seccion.locator('#otra').fill('Nefrología');
  await seccion.getByRole('button', { name: 'Derivar' }).click();
  await expect(page.locator('#interconsultas .ic')).toHaveCount(2);
});

test('recepción no pide derivaciones ni ve las que no pasan por ella', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.locator('[data-interconsulta]')).toHaveCount(0);
  const html = await postearAMano(page, `/sistema/atencion/${consulta}`, {
    accion: 'pedir_interconsulta', tipo_derivacion: 'externa', especialidad: 'Cardiología', motivo_interconsulta: 'x',
  });
  expect(html).toContain('Las derivaciones las pide el médico');

  /* Su panel solo trae las que el médico mandó a pasar por recepción: estas
     dos van directas a administración. */
  await page.goto('/sistema/derivaciones');
  await expect(page.locator('h1')).toContainText('Derivaciones para recepción');
  await expect(page.locator('.ic', { hasText: PACIENTE })).toHaveCount(0);
});

test('administración contacta al especialista por WhatsApp y queda anotado', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/derivaciones');

  const oftalmo = page.locator('.ic', { hasText: 'Oftalmología' });
  await expect(oftalmo).toContainText(PACIENTE);
  await expect(oftalmo).toContainText(ESPECIALISTA);
  await expect(oftalmo).toContainText('40,00');
  const boton = oftalmo.getByRole('button', { name: 'Contactar' });
  await expect(boton).toBeVisible();

  // La de nefrología dice que falta a quién escribirle.
  await expect(page.locator('.ic', { hasText: 'Nefrología' })).toContainText('No hay especialistas de Nefrología');

  /* El botón manda este mismo formulario. Se manda sin seguir la
     redirección para leer a dónde iba: WhatsApp no se abre de verdad. */
  const form = oftalmo.locator('form[data-contactar]');
  const campos = Object.fromEntries(await form.locator('input[type="hidden"]').evaluateAll(
    (i) => i.map((x) => [(x as HTMLInputElement).name, (x as HTMLInputElement).value]),
  ));
  const base = new URL(page.url()).origin;
  const r = await page.request.post('/sistema/derivaciones', {
    form: campos, headers: { origin: base }, maxRedirects: 0,
  });
  expect(r.status()).toBe(303);
  const url = new URL(r.headers()['location']);
  expect(url.host).toBe('wa.me');
  expect(url.pathname).toBe('/584141234567');
  const mensaje = url.searchParams.get('text') ?? '';
  expect(mensaje).toContain('interconsulta de Oftalmología');
  // Va por WhatsApp: ni el nombre ni la cédula del paciente.
  expect(mensaje).not.toContain('Salazar');

  const [ic] = await conBase((sql) => sql`
    SELECT i.estado, e.nombre AS especialista FROM interconsulta i
      JOIN especialista e ON e.id = i.especialista_id
     WHERE i.atencion_id = ${consulta} AND i.especialidad = 'Oftalmología'`);
  expect(ic.estado).toBe('contactada');
  expect(ic.especialista).toBe(ESPECIALISTA);
});

test('se da por atendida y se anula la otra con motivo', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/derivaciones');

  await page.locator('.ic', { hasText: 'Oftalmología' }).getByRole('button', { name: 'Ya lo atendió' }).click();
  await expect(page.locator('.msj--bien')).toContainText('Quedó cerrada');

  const nefro = page.locator('.ic', { hasText: 'Nefrología' });
  await nefro.locator('summary', { hasText: 'Anular' }).click();
  await nefro.getByLabel('¿Por qué se anula?').fill('La familia lo lleva a otro centro');
  await nefro.getByRole('button', { name: 'Anular' }).click();
  await expect(page.locator('.ic', { hasText: PACIENTE })).toHaveCount(0);

  // El médico ve cómo terminó cada una en su consulta.
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.locator('#interconsultas .ic--atendida')).toContainText('Oftalmología');
  await expect(page.locator('#interconsultas .ic--anulada')).toContainText('La familia lo lleva a otro centro');
});
