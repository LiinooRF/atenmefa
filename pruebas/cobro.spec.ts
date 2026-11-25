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
  conBase,
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
  await page.goto(`/sistema/atencion/${caso}/cobro`);

  /* Antes se corría quitar + volver a cargar; ahora el pagador se corrige
     en la misma fila (24-11). La consulta estaba «paciente»: pasa a seguro. */
  const fila = page.locator('tr', { hasText: CONSULTA });
  await fila.locator('select[name="paga"]').selectOption('aseguradora');
  await fila.locator('.fila__paga-boton').click();
  await expect(page.locator('.msj--bien').last()).toContainText('Pagador corregido');

  const cuenta = panelDeLaCuenta(page);
  await expect(cuenta.locator('.cuenta__total')).toContainText('122,00');
  await expect(cuenta.locator('li', { hasText: 'La aseguradora' })).toContainText('40,00');
  await expect(cuenta.locator('li', { hasText: 'El paciente' })).toContainText('82,00');

  // La fila lo dice con el selector del pagador en su estado nuevo.
  await expect(page.locator('tr', { hasText: CONSULTA }).locator('select[name="paga"]'))
    .toHaveValue('aseguradora');
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

/* El caso del cliente (24-11): quedó «todo lo paga el seguro menos la
   toma de muestra» y la corrección era quitar y volver a cargar. Ahora el
   pagador se corrige en la misma fila, sin quitar nada, y queda en la
   bitácora. */
test('el pagador de un renglón ya cargado se cambia desde su fila', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/atencion/${caso}/cobro`);

  /* Autosuficiente: la fila de material la carga el test de arriba (serial),
     pero si esta prueba corre sola con -g, la carga acá y sigue igual. */
  if ((await page.locator('tr', { hasText: MATERIAL }).count()) === 0) {
    await cargarAMano(page, caso, { descripcion: MATERIAL, cantidad: '2', precio: '18,50', paga: 'paciente' });
  }
  const fila = page.locator('tr', { hasText: MATERIAL });
  await fila.locator('select[name="paga"]').selectOption('empresa');
  await fila.locator('.fila__paga-boton').click();
  await expect(page.locator('.msj--bien').last()).toContainText('Pagador corregido');


  // La fila lo dice con el selector en su valor nuevo y la cuenta movió
  // el renglón de pagador.
  await expect(page.locator('tr', { hasText: MATERIAL }).locator('select[name="paga"]'))
    .toHaveValue('empresa');
  /* La lista de dólares: la de bolívares del cobro por taquilla repite
     «El paciente» con su propio total. */
  const dolares = page.locator('.cuenta', { hasText: 'Total USD' });
  await expect(dolares.locator('li', { hasText: 'La empresa' })).toContainText('37,00');
  await expect(dolares.locator('li', { hasText: 'El paciente' })).toContainText('45,00');

  // El cambio quedó en la bitácora con el antes y el después.
  const [b] = await conBase((sql) => sql`
    SELECT detalle ->> 'antes' AS antes, detalle ->> 'despues' AS despues
      FROM bitacora WHERE accion = 'cobro' AND atencion_id = ${caso}
        AND detalle ->> 'accion' = 'cambio_pagador' ORDER BY momento DESC LIMIT 1`);
  expect(b.antes).toBe('paciente');
  expect(b.despues).toBe('empresa');
});
