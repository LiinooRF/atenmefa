/**
 * El panel en un teléfono de 390 px.
 *
 * El médico lo usa de pie con una tablet, pero la secretaria lo abre en el
 * teléfono, y una pantalla que se desplaza de lado no se puede leer de un
 * barrido. Lo que se mide es el ancho del documento contra el de la
 * ventana: una tabla ancha puede desplazarse dentro de su caja, lo que no
 * puede es arrastrar la página entera.
 *
 * El documento imprimible entra con una salvedad: la hoja sigue midiendo
 * 215 mm, porque es papel y tiene que medir eso, pero se desplaza dentro de
 * su caja. Lo que se le exige es lo mismo que a todo lo demás: que no
 * arrastre la página entera ni deje botones por debajo de 44 px.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  CORRIDA, anchos, borrarPacientes, borrarServicios, cargarAMano, cedulaDePrueba,
  crearAtencionCerrada, crearBorrador, entrar, mesDeLaAtencion,
} from './apoyo';

/** El teléfono más angosto que se sigue vendiendo. */
test.use({ viewport: { width: 390, height: 844 } });

const CEDULA_CERRADA = cedulaDePrueba(6, 0);
const CEDULA_BORRADOR = cedulaDePrueba(6, 1);
const SERVICIO = `Servicio angosto de prueba ${CORRIDA}`;

/** Se arman en beforeAll porque las rutas llevan el id del caso. */
const rutas: string[] = [];
let documento = '';

/** Las pantallas del menú, leídas del menú: una nueva entra sola a las
    pruebas en vez de esperar a que alguien se acuerde de anotarla acá. */
async function rutasDelMenu(page: Page) {
  await page.goto('/sistema');
  const enlaces = await page.locator('.sis__nav a').evaluateAll((lista) =>
    lista.map((e) => new URL((e as HTMLAnchorElement).href).pathname));
  expect(enlaces.length, 'el menú no cargó, no se probó nada').toBeGreaterThan(4);
  return enlaces;
}

test.beforeAll(async ({ browser }) => {
  /* Los datos se cargan con la ventana grande: lo que se está probando es
     cómo se ven las pantallas, no si se pueden llenar en el teléfono. */
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contexto.newPage();
  await entrar(page, 'medico');

  const cerrada = await crearAtencionCerrada(page, {
    nombre: 'Josefina Mercedes Álvarez de Prueba',
    cedula: CEDULA_CERRADA,
    aseguradora: `Seguros Angostos ${CORRIDA}`,
    recipe: 'Ibuprofeno 400 mg cada 8 horas por 3 días',
  });

  // Con renglones cargados: la tabla del cobro es la caja más ancha del panel.
  await cargarAMano(page, cerrada, { descripcion: 'Consulta angosta de prueba', precio: '40,00', paga: 'aseguradora' });
  await cargarAMano(page, cerrada, { descripcion: 'Insumo angosto de prueba', cantidad: '3', precio: '12,50', paga: 'paciente' });

  const borrador = await crearBorrador(page, {
    nombre: 'Hilda Josefina Rondón de Prueba',
    cedula: CEDULA_BORRADOR,
  });

  /* El catálogo es de administración: hace falta su sesión. El médico que
     viene llenando las historias no puede abrirlo, y está bien que no pueda. */
  const deAdmin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await deAdmin.newPage();
  await entrar(admin, 'administracion');
  await admin.goto('/sistema/servicios');
  await admin.getByLabel('Servicio').fill(SERVICIO);
  await admin.getByLabel('Precio').fill('21,00');
  await admin.getByRole('button', { name: 'Agregar al catálogo' }).click();
  await admin.getByRole('link', { name: SERVICIO }).first().click();
  await expect(admin).toHaveURL(/\/sistema\/servicios\/[0-9a-f-]{36}$/);
  const servicio = new URL(admin.url()).pathname;
  await deAdmin.close();

  const mes = await mesDeLaAtencion(cerrada);

  rutas.push(
    '/sistema',
    `/sistema?q=${encodeURIComponent(CEDULA_CERRADA)}`,
    '/sistema/borradores',
    '/sistema/atencion/nueva',
    '/sistema/atencion/nueva?cedula=V-99.800.000',
    `/sistema/atencion/${cerrada}`,
    `/sistema/atencion/${cerrada}/cobro`,
    `/sistema/atencion/${cerrada}/editar`,
    `/sistema/atencion/${borrador}`,
    `/sistema/atencion/${borrador}/editar`,
    '/sistema/servicios',
    servicio,
    `/sistema/cierre?mes=${mes}`,
    `/sistema/cierre?mes=${mes}&cobrar_a=pacientes-directos`,
    `/sistema/atencion/${cerrada}/documento`,
  );

  documento = `/sistema/atencion/${cerrada}/documento`;

  await contexto.close();
});

test.afterAll(async () => {
  await borrarPacientes(CEDULA_CERRADA, CEDULA_BORRADOR);
  await borrarServicios(SERVICIO);
});

test('la pantalla de entrada no desborda a 390 px', async ({ page }) => {
  await page.goto('/sistema/entrar');

  const medida = await anchos(page);
  expect(medida.documento).toBeLessThanOrEqual(medida.ventana);
});

test('ninguna pantalla del panel desborda a 390 px', async ({ page }) => {
  await entrar(page, 'administracion');

  /* La lista de arriba es solo para las rutas que llevan el id de un caso y
     no salen en el menú. Administración no ve las del médico: esas ya están
     anotadas ahí. */
  for (const ruta of [...new Set([...(await rutasDelMenu(page)), ...rutas])]) {
    await page.goto(ruta);
    const medida = await anchos(page);
    /* Un píxel de tolerancia: el redondeo de un borde a mitad de píxel no
       es un desborde, y se nota igual si algo se sale de verdad. */
    expect
      .soft(medida.documento, `${ruta} mide ${medida.documento} en una ventana de ${medida.ventana}`)
      .toBeLessThanOrEqual(medida.ventana + 1);
  }
});

test('la barra del panel y el pie de guardar caben sin desplazar', async ({ page }) => {
  // El formulario es del médico: administración no escribe historias.
  await entrar(page, 'medico');
  await page.goto('/sistema/atencion/nueva?cedula=V-99.800.000');

  // La barra fija de arriba y la de guardar son las dos que pueden empujar.
  for (const caja of ['.sis__barra-int', '.pasos__pie-int']) {
    const medida = await page.locator(caja).evaluate((e) => ({
      ancho: e.scrollWidth,
      visible: e.clientWidth,
    }));
    expect.soft(medida.ancho, `${caja} no cabe`).toBeLessThanOrEqual(medida.visible + 1);
  }

  /* Guardar y salir está en todos los pasos; cerrar solo en el último,
     que es donde el médico termina. Los dos tienen que caber sin que el
     teléfono se mueva de lado. */
  await expect(page.getByRole('button', { name: 'Guardar y salir' })).toBeVisible();
  const pasos = await page.locator('[data-ir]').count();
  await page.locator(`[data-ir="${pasos - 1}"]`).click();
  await expect(page.getByRole('button', { name: 'Cerrar atención' })).toBeVisible();
});

/* La regla de la casa: 44 px de alto para todo lo que se toca con el dedo.
   .sis-boton arrancaba en 42 y los botones secundarios quedaban 2 px por
   debajo; el mínimo está unificado en la hoja del panel.

   Esta prueba decía que sí y no estaba mirando. Abría UNA pantalla
   (/sistema/atencion/nueva, que ni siquiera lleva el filtro de fechas) y
   medía solo .sis-boton, así que no alcanzaba los controles de Rango.astro,
   que se bajaban el mínimo a 38 px en los atajos y a 42 en los campos y en
   el botón Ver. Estuvieron meses en verde incumpliendo la regla. Ahora
   recorre el menú entero y mide todo lo que se pulsa.

   Quedan fuera las casillas y los radios: el navegador los dibuja de 13 px y
   lo que el dedo busca es su rótulo, que se mide de otra manera. */
const SE_TOCA = [
  'button:visible',
  'select:visible',
  'summary:visible', // un <details> se despliega con el dedo igual que un botón
  '.sis-boton:visible',
  'input:visible:not([type=hidden]):not([type=checkbox]):not([type=radio])',
].join(', ');

test('todo lo que se toca mide 44 px de alto', async ({ page }) => {
  await entrar(page, 'administracion');
  const porRevisar = [...new Set([...(await rutasDelMenu(page)), ...rutas])];

  for (const ruta of porRevisar) {
    await page.goto(ruta);
    const cosas = page.locator(SE_TOCA);
    for (let i = 0; i < (await cosas.count()); i++) {
      const caja = await cosas.nth(i).boundingBox();
      if (!caja) continue; // fuera de pantalla: no se toca
      const texto = (await cosas.nth(i).innerText()).replace(/\s+/g, ' ').trim();
      const nombre = texto || (await cosas.nth(i).getAttribute('aria-label'))
        || (await cosas.nth(i).getAttribute('name')) || (await cosas.nth(i).getAttribute('type'));
      expect
        .soft(caja.height, `${ruta}: "${nombre}" mide ${Math.round(caja.height)} px`)
        .toBeGreaterThanOrEqual(44);
    }
  }
});

test('la hoja del documento se desplaza en su caja, no arrastrando la página', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(documento);

  /* La hoja mide 215 mm y así tiene que quedar: es papel. Lo que no puede
     es llevarse la página de lado y dejar la barra de arriba fuera de vista. */
  const medida = await page.evaluate(() => ({
    ventana: document.documentElement.clientWidth,
    pagina: document.documentElement.scrollWidth,
    caja: document.querySelector('.lienzo')!.clientWidth,
    hoja: document.querySelector('.hoja')!.scrollWidth,
  }));

  expect(medida.pagina).toBeLessThanOrEqual(medida.ventana + 1);
  expect(medida.hoja).toBeGreaterThan(medida.caja); // se desplaza de verdad
});

test('los botones del documento también miden 44 px', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(documento);

  for (const sel of ['.acciones a', '.papel button', '.acciones__imprimir']) {
    const botones = page.locator(sel);
    for (let i = 0; i < (await botones.count()); i++) {
      const caja = await botones.nth(i).boundingBox();
      const rotulo = (await botones.nth(i).innerText()).replace(/\s+/g, ' ').trim();
      expect.soft(caja?.height ?? 0, `"${rotulo}" mide ${caja?.height}`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('el rango de fechas no separa el rótulo de su campo a 390 px', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');

  /* Sueltos en el mismo flex, "Hasta" terminaba al lado del campo de "Desde"
     y el filtro se leía al revés. Cada rótulo va con el suyo. */
  const pares = page.locator('.rango__par');
  expect(await pares.count()).toBe(2);

  for (let i = 0; i < 2; i++) {
    const rotulo = await pares.nth(i).locator('label').boundingBox();
    const campo = await pares.nth(i).locator('input').boundingBox();
    const texto = await pares.nth(i).locator('label').innerText();
    expect.soft(Math.abs(rotulo!.y - campo!.y), `"${texto}" quedó en otra línea que su campo`)
      .toBeLessThan(20);
  }
});
