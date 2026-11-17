/**
 * El informe del laboratorio, un examen por bloque (16-11).
 *
 * «Que diga examen general de orina… y diga examen químico, microscópico,
 * macroscópico, titulado de qué es ese examen… y una separación, dos
 * dedos, para que sepa que es otro examen.»
 *
 * Y lo que salió al revisarlo: una orden con hematología y orina perdía la
 * hemoglobina y los leucocitos de la orina, porque se tomaban por repetidos.
 */
import { test, expect, type Page } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba, borrarPacientes, borrarServicios, casillaDelExamen, FICHA } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(26, 0);
const HEMA = 'ZI Hematología Completa';
const ORINA = 'ZI Examen de Orina';
const SUELTO = 'ZI Glicemia suelta';
let orden = '';

const limpiar = async () => {
  await borrarPacientes(CEDULA);
  await borrarServicios(HEMA, ORINA, SUELTO);
};
test.beforeAll(async () => {
  await limpiar();
  await conBase((sql) => sql`
    INSERT INTO servicio (nombre, categoria, precio, moneda, activo, plantilla) VALUES
      (${HEMA}, 'laboratorio', 4, 'USD', true, 'HEMA'),
      (${ORINA}, 'laboratorio', 3, 'USD', true, 'ORINA'),
      (${SUELTO}, 'laboratorio', 2, 'USD', true, NULL)`);
});
test.afterAll(limpiar);

/** La casilla del valor de la n-ésima línea que se llama así. */
const valorDe = (page: Page, examen: string, n = 0) =>
  page.locator('#res-cuerpo tr')
    .filter({ has: page.locator(`input[name="examen"][value="${examen}"]`) })
    .nth(n).locator('[name="valor"]');

test('la orina no pierde su hemoglobina ni sus leucocitos al lado de la hematología', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);
  await page.locator('#c-nombre').fill('Informe Por Bloques Prueba');
  await page.locator('#c-edad').fill('40');
  await page.locator('#c-sexo').selectOption('Masculino');
  await page.locator('[data-ir="1"]').click();
  for (const e of [HEMA, ORINA, SUELTO]) await casillaDelExamen(page, e).check();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);
  orden = page.url().split('/atencion/')[1].split(/[/?#]/)[0];

  await page.context().clearCookies();
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/resultados`);
  // Dos de cada una: la de la sangre y la de la orina.
  await expect(page.locator('#res-cuerpo input[name="examen"][value="HEMOGLOBINA"]')).toHaveCount(2);
  await expect(page.locator('#res-cuerpo input[name="examen"][value="LEUCOCITOS"]')).toHaveCount(2);

  await valorDe(page, 'HEMOGLOBINA', 0).fill('14');
  await valorDe(page, 'COLOR').fill('AMARILLO');
  await valorDe(page, 'PROTEINAS').fill('NEGATIVO');
  await valorDe(page, 'LEUCOCITOS', 1).fill('0 - 1 x CMP');
  await valorDe(page, SUELTO).fill('90');
  await page.getByRole('button', { name: 'Dar por listos' }).click();
  await expect(page).toHaveURL(FICHA);
});

test('el informe sale por exámenes: título, sus partes, y dos por hoja en columnas', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/documento`);
  const tabla = page.locator('table.valores');

  // Cada examen pedido con su título; el suelto es su propio renglón.
  await expect(tabla.locator('.valores__examen')).toHaveText([HEMA, ORINA]);
  await expect(page.locator('table.valores__grupo')).toHaveCount(3);
  // Más de un examen: dos columnas, para que entren dos por hoja.
  await expect(page.locator('.examenes--dos')).toHaveCount(1);

  // Las partes de la orina van como subtítulos, dentro de la orina.
  const orina = page.locator('table.valores__grupo', { has: page.locator('.valores__examen', { hasText: ORINA }) });
  await expect(orina.locator('.valores__seccion')).toHaveText(['EXAMEN MACROSCOPICO', 'ANALISIS QUIMICO:', 'EXAMEN MICROSCOPICO:']);
  await expect(orina).toContainText('0 - 1 x CMP');
  // La hemoglobina de la sangre no se metió en la orina.
  const hema = page.locator('table.valores__grupo', { has: page.locator('.valores__examen', { hasText: HEMA }) });
  await expect(hema).toContainText('14');
  await expect(hema).not.toContainText('AMARILLO');
});

test('cada hoja lleva la firma, el timbre y el QR; la orden entregada tiene su PIN', async ({ page }) => {
  /* «La idea es que la firma y el timbre queden en todas las hojas, con el
     QR.» Van en el pie que el navegador repite en cada hoja impresa. Y el
     PIN: las órdenes se entregaban sin él y el informe salía sin QR. */
  const [o] = await conBase((sql) => sql`SELECT pin FROM atencion WHERE id = ${orden}`);
  expect(o.pin).toBeTruthy();

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/documento`);
  const pie = page.locator('article.hoja table.corrida > tfoot');
  await expect(pie.locator('.firma__linea em')).toContainText('sello y firma');
  await expect(pie.locator('.sello__qr svg')).toHaveCount(1);
  // Y la firma ya no va suelta al final del texto.
  await expect(page.locator('article.hoja table.corrida > tbody .firma')).toHaveCount(0);
});

test('por defecto, media hoja por examen; se eligen los cortes y se puede pedir la hoja completa', async ({ page }) => {
  /* «Mejor mitad mitad… para que se pueda cortar por la mitad y la otra
     mitad se imprime con el otro examen… deja una versión así como hoy y la
     otra como default, y que al imprimir se pueda sacar el corte que uno
     desee.» */
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/documento`);

  const medias = page.locator('.hoja--medias .media');
  await expect(medias).toHaveCount(3);
  await expect(medias.locator('.media__titulo')).toHaveText([HEMA, ORINA, SUELTO]);
  // Cada corte vale solo: el paciente, la firma y el QR en cada uno.
  for (const m of await medias.all()) {
    await expect(m.locator('.media__paciente')).toContainText('Informe Por Bloques Prueba');
    await expect(m.locator('.media__firma')).toContainText('sello y firma');
    await expect(m.locator('.media__qr svg')).toHaveCount(1);
  }
  await expect(page.locator('.hoja--con-medias')).toBeHidden();

  // Se destilda un corte y no sale.
  await page.locator('.cortes label', { hasText: ORINA }).locator('input').uncheck();
  await expect(medias.nth(1)).toHaveAttribute('data-fuera', '');

  // Y la hoja completa de antes, si se elige.
  await page.locator('[data-formato="completa"]').click();
  await expect(page.locator('.hoja--con-medias')).toBeVisible();
  await expect(page.locator('.hoja--medias')).toBeHidden();
  await page.locator('[data-formato="medias"]').click();
});

test('el paciente abre el MISMO informe desde el correo, con la cédula y el PIN', async ({ page }) => {
  /* «Se debe enviar lo mismo por correo… actualmente se envía por mail algo
     que no es exactamente el examen.» El correo lleva al documento que se
     imprime; sin la cédula y el PIN, no se ve. */
  const [o] = await conBase((sql) => sql`SELECT pin FROM atencion WHERE id = ${orden}`);

  // Sin pasar por la verificación, el informe no abre.
  await page.goto(`/verificar/${orden}/informe`);
  await expect(page).toHaveURL(new RegExp(`/verificar/${orden}$`));

  // El enlace del correo: verifica y entra directo al informe.
  await page.goto(`/verificar/${orden}?informe=1`);
  await page.locator('#documento').fill(CEDULA);
  await page.locator('#pin').fill(o.pin);
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).toHaveURL(new RegExp(`/verificar/${orden}/informe$`));

  // Es el mismo documento: los mismos cortes, con firma y QR; sin nada del sistema.
  await expect(page.locator('.hoja--medias .media')).toHaveCount(3);
  await expect(page.locator('.media__titulo')).toHaveText([HEMA, ORINA, SUELTO]);
  await expect(page.locator('[data-formato="completa"]')).toBeVisible();
  await expect(page.getByText('Volver a la orden')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Excel' })).toHaveCount(0);
});

test('el correo de laboratorio lleva el enlace al informe, no una copia', async () => {
  const { htmlDelInforme, textoDelInforme } = await import('../src/sistema/correo/informe');
  const datos = {
    tipo: 'laboratorio' as const, numero: 7, fecha: '2026-11-16', paciente: 'Paciente', cedula: 'V-1',
    examenes: ['Hematología'], resultados: [{ examen: 'HEMOGLOBINA', valor: '13,9', unidad: 'g/dL', referencia: '12 - 16' }],
    firma: { nombre: 'Bioanalista', rol: 'Bioanalista' },
    verificacion: { url: 'https://atenmefa.site/verificar/abc?informe=1', pin: '123456', dominioCorto: 'atenmefa.site' },
    centro: { nombre: 'Atenmefa', direccion: 'Calle', telefono: '0414', razon: '', rif: '' },
  };
  const html = htmlDelInforme(datos);
  expect(html).toContain('Ver e imprimir sus resultados');
  expect(html).toContain('verificar/abc?informe=1');
  expect(html).toContain('123456');
  expect(html).not.toContain('13,9');
  expect(textoDelInforme(datos)).toContain('verificar/abc?informe=1');
});
