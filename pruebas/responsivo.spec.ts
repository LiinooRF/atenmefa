/**
 * El panel en un teléfono de 390 px.
 *
 * El médico lo usa de pie con una tablet, pero la secretaria lo abre en el
 * teléfono, y una pantalla que se desplaza de lado no se puede leer de un
 * barrido. Lo que se mide es el ancho del documento contra el de la
 * ventana: una tabla ancha puede desplazarse dentro de su caja, lo que no
 * puede es arrastrar la página entera.
 *
 * El documento imprimible queda fuera a propósito: es una hoja carta de
 * 215 mm y tiene que medir eso, en pantalla y en papel. No es una pantalla
 * del sistema, es el papel.
 */
import { test, expect } from '@playwright/test';
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

test.beforeAll(async ({ browser }) => {
  /* Los datos se cargan con la ventana grande: lo que se está probando es
     cómo se ven las pantallas, no si se pueden llenar en el teléfono. */
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contexto.newPage();
  await entrar(page, 'administracion');

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

  // Un servicio propio para poder abrir la pantalla de edición del catálogo.
  await page.goto('/sistema/servicios');
  await page.getByLabel('Servicio').fill(SERVICIO);
  await page.getByLabel('Precio').fill('21,00');
  await page.getByRole('button', { name: 'Agregar al catálogo' }).click();
  await page.getByRole('link', { name: SERVICIO }).first().click();
  await expect(page).toHaveURL(/\/sistema\/servicios\/[0-9a-f-]{36}$/);
  const servicio = new URL(page.url()).pathname;

  const mes = await mesDeLaAtencion(cerrada);

  rutas.push(
    '/sistema',
    `/sistema?q=${encodeURIComponent(CEDULA_CERRADA)}`,
    '/sistema/borradores',
    '/sistema/atencion/nueva',
    `/sistema/atencion/${cerrada}`,
    `/sistema/atencion/${cerrada}/cobro`,
    `/sistema/atencion/${cerrada}/editar`,
    `/sistema/atencion/${borrador}`,
    `/sistema/atencion/${borrador}/editar`,
    '/sistema/servicios',
    servicio,
    `/sistema/cierre?mes=${mes}`,
    `/sistema/cierre?mes=${mes}&cobrar_a=pacientes-directos`,
  );

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

  for (const ruta of rutas) {
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
  await entrar(page, 'administracion');
  await page.goto('/sistema/atencion/nueva');

  // La barra fija de arriba y la de guardar son las dos que pueden empujar.
  for (const caja of ['.sis__barra-int', '.form__pie-int']) {
    const medida = await page.locator(caja).evaluate((e) => ({
      ancho: e.scrollWidth,
      visible: e.clientWidth,
    }));
    expect.soft(medida.ancho, `${caja} no cabe`).toBeLessThanOrEqual(medida.visible + 1);
  }

  // Y los dos botones de guardar siguen alcanzables sin desplazar de lado.
  await expect(page.getByRole('button', { name: 'Guardar borrador' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar atención' })).toBeVisible();
});

/* La regla de la casa: 44 px de alto para todo lo que se toca con el dedo.
   .sis-boton arrancaba en 42 y los botones secundarios quedaban 2 px por
   debajo; el mínimo está unificado en la hoja del panel. */
test('todo lo que se toca mide 44 px de alto', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/atencion/nueva');

  const botones = page.locator('.sis-boton');
  for (let i = 0; i < (await botones.count()); i++) {
    const caja = await botones.nth(i).boundingBox();
    const rotulo = (await botones.nth(i).innerText()).trim();
    expect.soft(caja?.height ?? 0, `el botón "${rotulo}" mide ${caja?.height}`).toBeGreaterThanOrEqual(44);
  }
});
