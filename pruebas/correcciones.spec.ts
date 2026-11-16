/**
 * Corregir una atención ya cerrada, dejando el rastro (16-11).
 *
 * «A veces se equivocan en la cédula… que quede en el mismo circuito de
 * atención para modificar esa consulta paso a paso y modificar la
 * información del paciente, dejando eso en el historial.»
 *
 *   - la corrige quien la firmó o administración; otro médico no;
 *   - el mismo formulario por pasos, con motivo obligatorio;
 *   - cada campo queda con lo que decía antes;
 *   - la cédula mal escrita: si el paciente correcto existe, la atención
 *     pasa a él; si no, se le corrige la cédula al paciente;
 *   - el informe impreso lo dice al pie;
 *   - los resultados de una orden entregada se corrigen igual.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, borrarPacientes, crearAtencionCerrada, llenar, FICHA,
  sembrarExamen, borrarExamen, casillaDelExamen, soloDigitos,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const MAL = cedulaDePrueba(25, 0);      // la que se escribió
const BIEN = cedulaDePrueba(25, 1);     // la de verdad, sin paciente todavía
const OTRO = cedulaDePrueba(25, 2);     // un paciente que ya existe
const MAL2 = cedulaDePrueba(25, 3);
const LAB = cedulaDePrueba(25, 4);
const EXAMEN = 'ZC Glicemia de prueba';
let consulta = '';
let orden = '';

const limpiar = async () => {
  await borrarPacientes(MAL, BIEN, OTRO, MAL2, LAB);
  await borrarExamen(EXAMEN);
};
test.beforeAll(limpiar);
test.afterAll(limpiar);

const guardarCorreccion = (page: Page) => page.getByRole('button', { name: 'Guardar la corrección' }).click();

test('el médico corrige su consulta: la cédula y el récipe, y queda lo de antes', async ({ page }) => {
  await entrar(page, 'medico');
  consulta = await crearAtencionCerrada(page, { cedula: MAL, nombre: 'Corrección de Prueba Díaz', recipe: 'Ibuprofeno 400 mg' });
  const [antes] = await conBase((sql) => sql`SELECT paciente_id FROM atencion WHERE id = ${consulta}`);

  await page.getByRole('link', { name: 'Corregir', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/atencion/${consulta}/corregir$`));
  // Sin motivo no se guarda.
  await llenar(page, { cedula: BIEN, recipe: 'Ibuprofeno 400 mg cada 8 horas por 3 días' });
  await guardarCorreccion(page);
  await expect(page.locator('.form__error')).toContainText('motivo');

  await page.locator('#motivo_correccion').fill('La cédula estaba mal escrita y faltaba la dosis.');
  await guardarCorreccion(page);
  await expect(page).toHaveURL(new RegExp(`/atencion/${consulta}\\?corregida=1`));

  const caja = page.locator('#correcciones');
  await expect(caja).toContainText('La cédula estaba mal escrita');
  await expect(caja.locator('tr', { hasText: 'Récipe' })).toContainText('Ibuprofeno 400 mg');
  await expect(caja.locator('tr', { hasText: 'Cédula' }).locator('.correccion__antes')).toContainText(soloDigitos(MAL).slice(-4));

  // El paciente era solo de esta atención: se le corrigió la cédula a él.
  const [ahora] = await conBase((sql) => sql`
    SELECT a.paciente_id, p.cedula_busca, a.estado, a.datos ->> 'recipe' AS recipe
      FROM atencion a JOIN paciente p ON p.id = a.paciente_id WHERE a.id = ${consulta}`);
  expect(ahora.paciente_id).toBe(antes.paciente_id);
  expect(ahora.cedula_busca).toContain(soloDigitos(BIEN));
  expect(ahora.estado).toBe('cerrada');
  expect(ahora.recipe).toBe('Ibuprofeno 400 mg cada 8 horas por 3 días');

  const [c] = await conBase((sql) => sql`SELECT count(*)::int AS n FROM correccion WHERE atencion_id = ${consulta}`);
  expect(c.n).toBe(1);

  // El informe impreso lo dice.
  await page.goto(`/sistema/atencion/${consulta}/documento`);
  await expect(page.locator('.corregido').first()).toContainText('Corregido el');
  await expect(page.locator('.corregido').first()).toContainText('Médico de Prueba');
});

test('si la cédula correcta ya es de otro paciente, la atención pasa a él', async ({ page }) => {
  await entrar(page, 'medico');
  await crearAtencionCerrada(page, { cedula: OTRO, nombre: 'Paciente Que Ya Existe' });
  const equivocada = await crearAtencionCerrada(page, { cedula: MAL2, nombre: 'Paciente Que Ya Existe' });

  await page.goto(`/sistema/atencion/${equivocada}/corregir`);
  await page.locator('#motivo_correccion').fill('Era el paciente de siempre; la cédula se escribió mal.');
  await llenar(page, { cedula: OTRO });
  await guardarCorreccion(page);
  await expect(page).toHaveURL(/corregida=1/);
  await expect(page.locator('#correcciones')).toContainText('la atención pasó a otro paciente');

  const [r] = await conBase((sql) => sql`
    SELECT p.cedula_busca, c.paciente_antes IS NOT NULL AS movida
      FROM atencion a JOIN paciente p ON p.id = a.paciente_id
      JOIN correccion c ON c.atencion_id = a.id WHERE a.id = ${equivocada}`);
  expect(r.cedula_busca).toContain(soloDigitos(OTRO));
  expect(r.movida).toBe(true);
});

test('otro médico no corrige lo que firmó otro; administración sí', async ({ page }) => {
  await entrar(page, 'medico2');
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.getByRole('link', { name: 'Corregir', exact: true })).toHaveCount(0);
  await page.goto(`/sistema/atencion/${consulta}/corregir`);
  await expect(page.locator('h1')).toContainText('no la puede corregir');
  await expect(page.locator('#motivo_correccion')).toHaveCount(0);
});

test('administración también corrige', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.getByRole('link', { name: 'Corregir', exact: true })).toBeVisible();
});

test('sin cambios no hay corrección', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}/corregir`);
  await page.locator('#motivo_correccion').fill('Probando que no cambió nada.');
  await guardarCorreccion(page);
  await expect(page.locator('.form__error')).toContainText('No cambió nada');
});

test('el bioanalista corrige un resultado ya entregado', async ({ page }) => {
  await sembrarExamen(EXAMEN, '5.00');
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(LAB)}&tipo=laboratorio`);
  await page.locator('#c-nombre').fill('Resultado Corregido Prueba');
  await page.locator('#c-edad').fill('50');
  await page.locator('#c-sexo').selectOption('Femenino');
  await page.locator('[data-ir="1"]').click();
  await casillaDelExamen(page, EXAMEN).check();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);
  orden = page.url().split('/atencion/')[1].split(/[/?#]/)[0];

  await page.context().clearCookies();
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/resultados`);
  await page.locator('#res-cuerpo tr', { hasText: '' }).locator('input[name="valor"]').first().fill('89');
  await page.getByRole('button', { name: 'Dar por listos' }).click();
  await expect(page).toHaveURL(FICHA);

  await page.getByRole('link', { name: 'Corregir resultados' }).click();
  await expect(page).toHaveURL(/resultados\?corregir=1$/);
  await page.locator('#res-cuerpo input[name="valor"]').first().fill('98');
  await page.locator('input[name="motivo_correccion"]').fill('Se transcribió 89 y era 98.');
  await page.getByRole('button', { name: 'Guardar la corrección' }).click();
  await expect(page).toHaveURL(/corregida=1/);

  const fila = page.locator('#correcciones tr', { hasText: EXAMEN });
  await expect(fila.locator('.correccion__antes')).toContainText('89');
  await expect(fila).toContainText('98');
  const [r] = await conBase((sql) => sql`SELECT resultados, estado FROM atencion WHERE id = ${orden}`);
  expect(r.estado).toBe('cerrada');
  expect(r.resultados.find((x: { examen: string }) => x.examen === EXAMEN).valor).toBe('98');
});
