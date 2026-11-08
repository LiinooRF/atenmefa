/**
 * El menú del panel.
 *
 * Administración llegó a ver diez entradas sueltas y la barra se cortaba
 * sola en la tablet: lo de más a la derecha quedaba fuera de la pantalla sin
 * que nada avisara. Ahora lo del día a día está arriba de un toque y lo que
 * se abre una vez al mes va agrupado.
 *
 * Lo que se vigila:
 *
 *   · que el médico siga teniendo su menú plano. No hay dos menús escritos:
 *     hay uno con grupos, y un grupo al que le queda UNA entrada visible se
 *     dibuja como enlace suelto. Si esa regla se rompe, al médico le
 *     aparecen desplegables de un solo elemento;
 *   · que ninguna entrada del menú lleve a "no tiene permiso". Una puerta
 *     visible que no abre es peor que no mostrarla;
 *   · que el grupo se marque cuando estás en una de sus pantallas, porque si
 *     no, estando en el cierre del mes nada en la barra dice dónde estás;
 *   · que el desplegable se comporte como se espera de uno: abrir uno cierra
 *     el otro, Escape cierra, tocar afuera cierra.
 */
import { test, expect, type Page } from '@playwright/test';
import { entrar } from './apoyo';

/** Lo que se ve en la barra sin abrir nada. */
const deLaBarra = (page: Page) =>
  page.locator('.sis__nav > a, .sis__nav > details > summary')
    .evaluateAll((n) => n.map((x) => (x.textContent ?? '').replace(/\s+/g, ' ').trim()));

test('al médico le queda el menú plano, sin desplegables', async ({ page }) => {
  await entrar(page, 'medico');

  expect(await deLaBarra(page)).toEqual(['Casos', 'Nueva atención', 'Borradores', 'Pacientes']);
  /* Sin Laboratorio: el que llega solo a hacerse un examen no es un caso
     suyo. Lo que él pidió en consulta lo ve colgado de esa consulta. */
  /* Ni uno: al médico no le alcanza para completar ningún grupo, así que
     cada entrada suya es un enlace y no un desplegable de un solo elemento. */
  await expect(page.locator('.sis__grupo')).toHaveCount(0);
});

test('administración ve siete entradas en vez de once sueltas', async ({ page }) => {
  await entrar(page, 'administracion');

  expect(await deLaBarra(page)).toEqual([
    'Casos', 'Borradores', 'Laboratorio', 'Pacientes', 'Cobros', 'Reportes', 'Administración',
  ]);

  const dentro = async (grupo: string) =>
    page.locator('.sis__grupo').filter({ hasText: grupo }).locator('.sis__menu a')
      .evaluateAll((a) => a.map((x) => (x.textContent ?? '').trim()));

  expect(await dentro('Cobros')).toEqual(['Cierre del mes', 'Servicios y precios']);
  expect(await dentro('Reportes')).toEqual(['Tablero', 'Marketing del sitio']);
  expect(await dentro('Administración')).toEqual([
    'Cuentas', 'Diagnósticos frecuentes', 'Bitácora de accesos',
  ]);
});

/* Una prueba por rol y no un bucle con los cuatro dentro de una: entrar con
   la sesión del anterior todavía abierta rebota a /sistema y no hay
   formulario que llenar. */
for (const quien of ['medico', 'administracion', 'bioanalista', 'recepcionista'] as const) {
  test(`ninguna entrada del menú de ${quien} lleva a "no tiene permiso"`, async ({ page }) => {
    await entrar(page, quien);

    const destinos = await page.locator('.sis__nav a')
      .evaluateAll((a) => a.map((x) => new URL((x as HTMLAnchorElement).href).pathname));
    /* La red para que esta prueba no pase en vano si el menú vuelve vacío.
       Dos y no tres: el bioanalista tiene exactamente tres entradas y con
       un umbral de tres el propio guardia hacía fallar la prueba. */
    expect(destinos.length, 'el menú vino vacío').toBeGreaterThan(1);

    for (const destino of destinos) {
      await page.goto(destino);
      expect
        .soft(new URL(page.url()).pathname, `el menú ofrece ${destino} y no se puede abrir`)
        .not.toContain('sin-permiso');
    }
  });
}

test('el grupo se marca cuando estás en una de sus pantallas', async ({ page }) => {
  await entrar(page, 'administracion');

  const marcado = async () => {
    const s = page.locator('.sis__nav summary[aria-current="true"]');
    return (await s.count()) ? (await s.first().innerText()).replace(/\s+/g, ' ').trim() : null;
  };

  await page.goto('/sistema/cierre');
  expect(await marcado()).toBe('Cobros');

  await page.goto('/sistema/marketing');
  expect(await marcado()).toBe('Reportes');

  await page.goto('/sistema/bitacora');
  expect(await marcado()).toBe('Administración');

  /* /sistema es la lista de casos y calza exacta. Con prefijo se marcaría
     como actual en TODAS las pantallas, porque todas cuelgan de ahí. */
  await page.goto('/sistema/cierre');
  await expect(page.locator('.sis__nav > a[href="/sistema"][aria-current="page"]')).toHaveCount(0);
});

test('la pantalla hija sigue marcando su entrada del menú', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/pacientes');
  await expect(page.locator('.sis__nav > a[href="/sistema/pacientes"]')).toHaveAttribute('aria-current', 'page');
});

test('el desplegable se porta como un desplegable', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema');

  const cobros = page.locator('.sis__grupo').filter({ hasText: 'Cobros' });
  const reportes = page.locator('.sis__grupo').filter({ hasText: 'Reportes' });

  await cobros.locator('summary').click();
  await expect(cobros).toHaveJSProperty('open', true);

  // Abrir otro cierra el primero: dos abiertos a la vez no se entiende.
  await reportes.locator('summary').click();
  await expect(cobros).toHaveJSProperty('open', false);
  await expect(reportes).toHaveJSProperty('open', true);

  // Escape.
  await page.keyboard.press('Escape');
  await expect(reportes).toHaveJSProperty('open', false);

  // Tocar afuera. Lejos del menú, que en el teléfono tapa lo de arriba.
  await reportes.locator('summary').click();
  await expect(reportes).toHaveJSProperty('open', true);
  await page.mouse.click(20, 700);
  await expect(reportes).toHaveJSProperty('open', false);
});

test('el desplegable cabe en la pantalla y no se mete bajo la barra', async ({ page }) => {
  await entrar(page, 'administracion');

  /* Vive colgado de la ventana porque el menú desplaza de lado, y una caja
     que desplaza recorta lo que se sale. Lo que hay que comprobar es que el
     cálculo lo deje entero a la vista en cualquier ancho. */
  for (const ancho of [390, 768, 1280]) {
    await page.setViewportSize({ width: ancho, height: 844 });
    await page.goto('/sistema');

    for (const grupo of ['Cobros', 'Reportes', 'Administración']) {
      const g = page.locator('.sis__grupo').filter({ hasText: grupo });
      await g.locator('summary').scrollIntoViewIfNeeded();
      await g.locator('summary').click();

      const caja = (await g.locator('.sis__menu').boundingBox())!;
      const barra = (await page.locator('.sis__barra').boundingBox())!;
      const ventana = await page.evaluate(() => document.documentElement.clientWidth);

      expect.soft(caja.x, `${ancho}px · ${grupo} se sale por la izquierda`).toBeGreaterThanOrEqual(0);
      expect.soft(caja.x + caja.width, `${ancho}px · ${grupo} se sale por la derecha`)
        .toBeLessThanOrEqual(ventana + 1);
      expect.soft(caja.y, `${ancho}px · ${grupo} queda tapado por la barra`)
        .toBeGreaterThanOrEqual(barra.height - 1);

      await g.locator('summary').click();
    }
  }
});
