/**
 * Tablero y filtro de fechas.
 *
 * Lo que se prueba no es que los gráficos se dibujen: es que los números
 * sean los correctos y que el filtro de fechas realmente filtre.
 */
import { test, expect } from '@playwright/test';
import {
  entrar, crearAtencionCerrada, crearBorrador, cedulaDePrueba,
  historiaMinima, borrarPacientes, cargarAMano, idDeLaFicha,
} from './apoyo';

const CEDULA = cedulaDePrueba(4);
const VIEJA = cedulaDePrueba(4, 1);
const HOY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const haceDias = (n: number) => {
  const d = new Date(`${HOY}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

let caso = '';

/* El rótulo del recuadro, no su texto entero: "Atenciones" también
   aparece dentro de la explicación del recuadro de sin cobro. */
const cifra = (page: import('@playwright/test').Page, rotulo: string) =>
  page.locator('.cifras li')
    .filter({ has: page.locator('.cifras__rotulo', { hasText: new RegExp(`^${rotulo}$`) }) })
    .locator('.cifras__dato');

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page, 'medico');
  caso = await crearAtencionCerrada(page, {
    ...historiaMinima, nombre: 'Paciente Tablero Hoy', cedula: CEDULA,
    fecha: HOY, idx: 'Faringitis de prueba', aseguradora: 'Seguros Tablero',
  });
  await crearAtencionCerrada(page, {
    ...historiaMinima, nombre: 'Paciente Tablero Viejo', cedula: VIEJA,
    fecha: haceDias(60), idx: 'Lumbalgia de prueba',
  });
  await crearBorrador(page, { nombre: 'Paciente Tablero Borrador', cedula: CEDULA });
  await cargarAMano(page, caso, { descripcion: 'Consulta de tablero', precio: '45,00', paga: 'aseguradora' });
  await page.close();
});

test.afterAll(async () => {
  await borrarPacientes(CEDULA, VIEJA);
});

test('el médico no puede abrir el tablero', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/tablero');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});

test('hoy cuenta la atención de hoy y no la de hace dos meses', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/tablero?d=${HOY}|${HOY}`);

  await expect(cifra(page, 'Atenciones')).toHaveText('1');
  await expect(page.locator('.cab__nota')).toContainText('1 día');
});

test('un rango ancho incluye las dos atenciones', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/tablero?d=${haceDias(90)}|${HOY}`);
  await expect(cifra(page, 'Atenciones')).toHaveText('2');
});

test('el borrador no cuenta pero sí se avisa', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/tablero?d=${haceDias(90)}|${HOY}`);
  await expect(page.locator('.pendiente')).toContainText('sin terminar');
});

test('el monto cargado aparece en las cifras', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/tablero?d=${HOY}|${HOY}`);
  await expect(cifra(page, 'Cargado para cobrar')).toContainText('45,00');
});

test('el diagnóstico del período aparece y el de afuera no', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/tablero?d=${HOY}|${HOY}`);
  const panel = page.locator('section', { hasText: 'Lo que más se diagnosticó' });
  await expect(panel).toContainText('Faringitis de prueba');
  await expect(panel).not.toContainText('Lumbalgia de prueba');
});

test('los atajos de fecha cambian el período', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');
  await page.getByRole('button', { name: 'Hoy' }).click();
  await expect(page.locator('.cab__nota')).toContainText('1 día');
  await expect(page.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true');
});

test('el rango libre filtra por las fechas escritas', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');
  await page.locator('#desde').fill(haceDias(90));
  await page.locator('#hasta').fill(haceDias(45));
  await page.getByRole('button', { name: 'Ver' }).click();

  // Solo la vieja cae en ese tramo.
  await expect(cifra(page, 'Atenciones')).toHaveText('1');
  const panel = page.locator('section', { hasText: 'Lo que más se diagnosticó' });
  await expect(panel).toContainText('Lumbalgia de prueba');
});

test('un período sin atenciones lo dice en vez de mostrar gráficos vacíos', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/tablero?d=${haceDias(400)}|${haceDias(380)}`);
  await expect(page.locator('.nada')).toContainText('Ninguna atención cerrada');
  await expect(page.locator('.rejilla')).toHaveCount(0);
});

test('las fechas al revés se dan vuelta solas', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/tablero?desde=${HOY}&hasta=${haceDias(90)}`);
  await expect(page.locator('#desde')).toHaveValue(haceDias(90));
  await expect(page.locator('#hasta')).toHaveValue(HOY);
});

test('el tablero no desborda en ningún ancho', async ({ page }) => {
  await entrar(page, 'administracion');
  for (const w of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`/sistema/tablero?d=${haceDias(90)}|${HOY}`);
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      v: document.documentElement.clientWidth,
    }));
    expect.soft(m.doc, `a ${w} mide ${m.doc}`).toBeLessThanOrEqual(m.v + 1);
  }
});
