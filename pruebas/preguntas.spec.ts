/**
 * Las páginas de pregunta, y lo que NO puede salir publicado.
 *
 * Dos cosas distintas se vigilan acá.
 *
 * La primera es el AEO. Gemini y AI Overviews citan pares de pregunta y
 * respuesta porque son extraíbles: una pregunta literal como título, una
 * respuesta que se sostiene sola, y un QAPage que lo diga. Si eso se rompe,
 * las páginas siguen viéndose bien y dejan de servir para lo único que se
 * hicieron.
 *
 * La segunda es que el andamio del encargo no se publique. El sitio tenía
 * en vivo "estas preguntas están esperando el dato del cliente" y "falta el
 * dato de horario": lenguaje interno, indexado por Google, en la página de
 * un centro de salud. Quien busca una emergencia no tiene por qué leer cómo
 * va el trabajo, y el cliente tampoco su lista de pendientes.
 */
import { test, expect } from '@playwright/test';

/** El sitio público no necesita sesión. */
const PUBLICAS = ['/', '/preguntas/', '/servicios/laboratorio-clinico/'];

test('cada pregunta respondida tiene su página, con la respuesta primero', async ({ page }) => {
  await page.goto('/preguntas/');

  const enlaces = await page.locator('.lista a').evaluateAll((a) =>
    a.map((x) => (x as HTMLAnchorElement).getAttribute('href')!));
  expect(enlaces.length, 'el índice vino vacío').toBeGreaterThan(5);

  await page.goto(enlaces[0]);

  /* La pregunta es el título de la página, literal. Es lo que calza con lo
     que alguien escribe en el buscador. */
  const h1 = await page.locator('h1').innerText();
  expect(h1.startsWith('¿')).toBe(true);

  /* Y la respuesta va inmediatamente después, sin nada en medio: es el
     trozo que se cita. */
  const respuesta = await page.locator('.preg__respuesta').innerText();
  expect(respuesta.length).toBeGreaterThan(40);

  // La descripción de la página ES la respuesta, no un resumen aparte.
  const descripcion = await page.locator('meta[name="description"]').getAttribute('content');
  expect(respuesta).toContain(descripcion!.slice(0, 60));
});

test('la página de una pregunta se marca como QAPage, no como FAQPage', async ({ page }) => {
  await page.goto('/preguntas/como-pedir-una-ambulancia/');

  const grafo = await page.locator('script[type="application/ld+json"]').evaluate((e) =>
    JSON.parse(e.textContent!)['@graph']);
  const tipos = grafo.map((x: { '@type': string }) => x['@type']);

  /* FAQPage es una página con VARIAS preguntas. Esta tiene una sola y es su
     tema: eso es QAPage. Marcarla mal describe mal la página. */
  expect(tipos).toContain('QAPage');
  expect(tipos).not.toContain('FAQPage');
  expect(tipos).toContain('BreadcrumbList');

  const qa = grafo.find((x: { '@type': string }) => x['@type'] === 'QAPage');
  expect(qa.mainEntity.name).toContain('ambulancia');
  expect(qa.mainEntity.acceptedAnswer.text.length).toBeGreaterThan(40);
});

test('los identificadores del schema son la dirección de verdad', async ({ page }) => {
  await page.goto('/preguntas/donde-queda-atenmefa/');

  const grafo = await page.locator('script[type="application/ld+json"]').evaluate((e) =>
    JSON.parse(e.textContent!)['@graph']);

  /* Llevaban doble barra —atenmefa.site//#clinica— y eso no es la dirección
     de nada. Un @id tiene que ser la URL real para que lo que se dice de la
     clínica acá se junte con lo que se diga en otra parte del mismo sitio. */
  for (const nodo of grafo) {
    expect.soft(nodo['@id'], `${nodo['@type']} tiene un @id mal formado`).not.toMatch(/[^:]\/\//);
  }
});

test('las páginas de pregunta se enlazan entre ellas y con su servicio', async ({ page }) => {
  /* Sin enlaces, cada página queda colgando de la nada: Google tarda meses
     en llegar y no entiende que son un conjunto. */
  await page.goto('/preguntas/traslados-programados/');

  await expect(page.locator('.otras__lista a').first()).toBeVisible();
  const suServicio = page.locator('.preg__servicio a');
  await expect(suServicio).toHaveAttribute('href', /\/servicios\//);
});

test('el menú lleva a la sección de preguntas', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('header a', { hasText: 'Preguntas' }).first();
  await expect(menu).toHaveAttribute('href', /\/preguntas\/$/);
});

/* ------------------------------------------------------------------
   Lo que no puede salir publicado.
   ------------------------------------------------------------------ */

const INTERNO = [
  'falta el dato',
  'lo que falta responder',
  'esperando el dato del cliente',
  'falta imagen',
  'pendiente del cliente',
];

for (const ruta of PUBLICAS) {
  test(`${ruta} no publica el andamio del encargo`, async ({ page }) => {
    await page.goto(ruta);
    const texto = (await page.locator('body').innerText()).toLowerCase();
    for (const frase of INTERNO) {
      expect.soft(texto, `"${frase}" está publicado en ${ruta}`).not.toContain(frase);
    }
  });
}

test('no se enlaza una sección que no existe', async ({ page }) => {
  /* Mientras no haya personal confirmado, "Quiénes atienden" no se publica.
     El enlace del menú tiene que irse con ella: si no, lleva a un ancla que
     no está y deja al visitante donde cayó, sin nada que lo explique. */
  await page.goto('/');

  const haySeccion = await page.locator('#equipo').count();
  const hayEnlace = await page.locator('a[href*="#equipo"]').count();
  expect(hayEnlace === 0 || haySeccion > 0,
    'el menú enlaza a #equipo y esa sección no está publicada').toBe(true);
});

test('no se promete lo que la página no muestra', async ({ page }) => {
  /* La sección del equipo decía "con su número de registro a la vista" sin
     mostrar un solo nombre. En un sitio de salud esa es la peor clase de
     afirmación sin respaldo. */
  await page.goto('/');
  const texto = await page.locator('body').innerText();
  if (!texto.includes('número de registro')) return;
  await expect(page.locator('#equipo')).toBeVisible();
});
