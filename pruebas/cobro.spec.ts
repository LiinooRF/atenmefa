/**
 * La cuenta de una atención: cuánto es y quién paga cada cosa.
 *
 * El cliente lo explicó con la bodega: fue por carne, pero el médico mandó
 * también sal y adobo, y hay que saber quién paga la sal. Por eso el
 * pagador va en el renglón, y por eso lo que se mira acá es la aritmética
 * del total y el reparto cuando un renglón cambia de dueño.
 *
 * El camino del catálogo —copiar nombre y precio al renglón, desactivar un
 * servicio— se prueba en cobro-renglones.spec.ts. Acá los renglones van
 * escritos a mano, que es la forma de fijar los montos desde la prueba.
 */
import { test, expect } from '@playwright/test';
import {
  CORRIDA, borrarPacientes, cargarAMano, cedulaDePrueba, crearAtencionCerrada, entrar,
  panelDeLaCuenta, quitarRenglon,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(3, 0);
const NOMBRE = 'Jesús Alberto Quintero de Prueba';
const SEGURO = `Seguros Bodega ${CORRIDA}`;

const CONSULTA = 'Consulta de prueba';
const MATERIAL = 'Material de sutura de prueba';
const OXIGENO = 'Oxígeno de prueba';
const TAQUILLA = 'Vendas pagadas en taquilla de prueba';

let caso = '';

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page, 'medico');

  // Un caso con seguro: así mover un renglón al seguro significa algo.
  caso = await crearAtencionCerrada(page, { nombre: NOMBRE, cedula: CEDULA, aseguradora: SEGURO });

  await page.close();
});

test.afterAll(async () => {
  await borrarPacientes(CEDULA);
});

test('la cuenta suma lo que se cargó', async ({ page }) => {
  await entrar(page, 'administracion');

  await cargarAMano(page, caso, { descripcion: CONSULTA, precio: '40,00', paga: 'paciente' });
  await cargarAMano(page, caso, { descripcion: MATERIAL, cantidad: '2', precio: '18,50', paga: 'paciente' });
  // Cantidad fraccionada: 1,5 × 30,00 = 45,00, y el redondeo va por renglón.
  await cargarAMano(page, caso, { descripcion: OXIGENO, cantidad: '1,5', precio: '30,00', paga: 'paciente' });

  const material = page.locator('tr', { hasText: MATERIAL });
  await expect(material).toContainText('37,00');
  const oxigeno = page.locator('tr', { hasText: OXIGENO });
  await expect(oxigeno).toContainText('1,50');
  await expect(oxigeno).toContainText('45,00');

  const cuenta = panelDeLaCuenta(page);
  await expect(cuenta).toContainText('Total USD');
  await expect(cuenta.locator('.cuenta__total')).toContainText('122,00');
  await expect(cuenta.locator('li', { hasText: 'El paciente' })).toContainText('122,00');
  // Nadie más paga todavía, aunque el caso venga por un seguro.
  await expect(cuenta.locator('li', { hasText: 'La aseguradora' })).toHaveCount(0);
});

test('mover un renglón de pagador mueve el subtotal', async ({ page }) => {
  await entrar(page, 'administracion');

  // La consulta la cubre el seguro; el material y el oxígeno, el paciente.
  await quitarRenglon(page, caso, CONSULTA);
  await cargarAMano(page, caso, { descripcion: CONSULTA, precio: '40,00', paga: 'aseguradora' });

  const cuenta = panelDeLaCuenta(page);
  await expect(cuenta.locator('.cuenta__total')).toContainText('122,00');
  await expect(cuenta.locator('li', { hasText: 'La aseguradora' })).toContainText('40,00');
  await expect(cuenta.locator('li', { hasText: 'El paciente' })).toContainText('82,00');

  // La fila lo dice con palabras, no con la clave de la base.
  await expect(page.locator('tr', { hasText: CONSULTA })).toContainText('Lo paga el seguro');
});

test('los bolívares no se suman con los dólares', async ({ page }) => {
  await entrar(page, 'administracion');

  /* "1.250,00" es mil doscientos cincuenta, no uno con veinticinco: el
     punto es de miles cuando también viene la coma. */
  await cargarAMano(page, caso, {
    descripcion: TAQUILLA,
    precio: '1.250,00',
    moneda: 'VES',
    paga: 'paciente',
  });

  const cuenta = panelDeLaCuenta(page);
  await expect(cuenta).toContainText('Total USD');
  await expect(cuenta).toContainText('Total VES');
  await expect(cuenta).toContainText('1.250,00');
  await expect(cuenta).toContainText('Hay renglones en dos monedas y no se suman entre ellas');

  // El total en dólares no se movió por lo cobrado en bolívares.
  const dolares = cuenta.locator('.cuenta', { hasText: 'Total USD' });
  await expect(dolares.locator('.cuenta__total')).toContainText('122,00');
});

/* No existe todavía: la tabla de lo cargado solo ofrece "Quitar", y
   sistema/lib/cobro.ts no tiene cómo reasignar un renglón ya guardado. Hoy
   el pagador se corrige quitando el renglón y volviéndolo a cargar, que es
   lo que hace la prueba de arriba. Cuando se agregue el control, esta
   prueba es la que lo cubre. */
test.fixme('el pagador de un renglón ya cargado se cambia desde su fila', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/atencion/${caso}/cobro`);

  const fila = page.locator('tr', { hasText: MATERIAL });
  await fila.locator('select[name="paga"]').selectOption('empresa');
  await fila.getByRole('button', { name: 'Guardar' }).click();

  const cuenta = panelDeLaCuenta(page);
  await expect(cuenta.locator('li', { hasText: 'La empresa' })).toContainText('37,00');
  await expect(cuenta.locator('li', { hasText: 'El paciente' })).toContainText('45,00');
});
