/**
 * El paso de «Diagnóstico y tratamiento», como lo pidió el cliente:
 *
 *   - «no puedo seleccionar más de un diagnóstico o que el médico escriba
 *     uno a mano extra»: además del principal, otros, del catálogo o a mano;
 *   - «seleccionar más de un tratamiento aplicado»: la vía admite varias;
 *   - «lo de referido está afuera de la atención, debe estar dentro»: se
 *     deriva desde el paso, sin salir de la historia, y sale en el informe.
 */
import { test, expect } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, borrarPacientes, historiaMinima, llenar,
  irAlPasoDe, irAlUltimoPaso, FICHA, idDeLaFicha,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(24, 0);
const CEDULA_DER = cedulaDePrueba(24, 1);
const limpiar = () => borrarPacientes(CEDULA, CEDULA_DER);
test.beforeAll(limpiar);
test.afterAll(limpiar);

test('varios diagnósticos, del catálogo y a mano, y varias vías a la vez', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=general`);
  await page.locator('#c-nombre').fill('Varios Diagnósticos Prueba');
  await llenar(page, historiaMinima);

  await irAlPasoDe(page, page.locator('#c-idx_otros-buscar'));
  await page.locator('#c-idx_otros-buscar').fill('i10');
  await page.locator('.dxo__resultados button', { hasText: 'I10' }).first().click();
  await page.locator('#c-idx_otros-mano').fill('Deshidratación leve');
  await page.locator('#c-idx_otros-mano').press('Enter');
  const lista = page.locator('.dxo__lista li');
  await expect(lista).toHaveCount(2);
  await expect(lista.first()).toContainText('I10 · Hipertensión esencial');

  // Uno de más y se quita.
  await page.locator('#c-idx_otros-mano').fill('Me equivoqué');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(lista).toHaveCount(3);
  await page.getByRole('button', { name: 'Quitar Me equivoqué' }).click();
  await expect(lista).toHaveCount(2);

  await page.locator('#c-via').getByLabel('Parenteral', { exact: true }).check();
  await page.locator('#c-via').getByLabel('Nebulización').check();

  // El borrador se reabre como se guardó (el guardado automático va solo).
  await expect(page.locator('#atencion-id')).not.toHaveValue('');
  const borrador = await page.locator('#atencion-id').inputValue();
  await expect.poll(async () => (await conBase((sql) => sql`
    SELECT datos ->> 'via' AS via FROM atencion WHERE id = ${borrador}`))[0]?.via).toBe('Parenteral, Nebulización');
  await page.goto(`/sistema/atencion/${borrador}/editar`);
  await irAlPasoDe(page, page.locator('#c-idx_otros-buscar'));
  await expect(page.locator('.dxo__lista li')).toHaveCount(2);
  await expect(page.locator('#c-via').getByLabel('Nebulización')).toBeChecked();
  await expect(page.locator('#c-via').getByLabel('Enteral', { exact: true })).not.toBeChecked();

  await irAlUltimoPaso(page);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(FICHA);
  const caso = idDeLaFicha(page.url());
  expect(caso).toBe(borrador);

  const [g] = await conBase((sql) => sql`
    SELECT datos ->> 'idx' AS idx, datos ->> 'idx_otros' AS otros, datos ->> 'via' AS via
      FROM atencion WHERE id = ${caso}`);
  expect(g.idx).toBe('Cólico biliar');
  expect(g.otros.split('\n')).toEqual(['I10 · Hipertensión esencial (primaria)', 'Deshidratación leve']);
  expect(g.via).toBe('Parenteral, Nebulización');

  // Se ven en la ficha y salen en el informe.
  await expect(page.locator('#historia').locator('xpath=..')).toContainText('Deshidratación leve');
  await page.goto(`/sistema/atencion/${caso}/documento`);
  await expect(page.locator('.hoja').first()).toContainText('I10 · Hipertensión esencial');
  await expect(page.locator('.hoja').first()).toContainText('Parenteral, Nebulización');

});

test('se deriva desde adentro de la atención y sale en el informe', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_DER)}&tipo=general`);
  await page.locator('#c-nombre').fill('Derivada Adentro Prueba');
  await llenar(page, historiaMinima);
  // El bloque necesita la atención guardada; el guardado automático la crea.
  await expect(page.locator('#atencion-id')).not.toHaveValue('');

  const bloque = page.locator('[data-derivar]');
  await irAlPasoDe(page, bloque);
  await expect(bloque).toContainText('Todavía no se derivó');
  await bloque.locator('summary', { hasText: 'Derivar' }).click();
  await bloque.getByLabel('Especialista de afuera').check();
  await bloque.locator('[data-campo="especialidad"]').selectOption('__otra');
  await bloque.locator('[data-campo="otra"]').fill('Oftalmología');
  await bloque.locator('[data-campo="motivo"]').fill('Fondo de ojo por hipertensión.');
  await bloque.getByRole('button', { name: 'Derivar' }).click();
  await expect(bloque.locator('.der__lista li')).toHaveCount(1);
  await expect(bloque.locator('.der__lista li')).toContainText('Oftalmología');

  const atencion = await page.locator('#atencion-id').inputValue();
  const [d] = await conBase((sql) => sql`
    SELECT tipo, especialidad, motivo FROM interconsulta WHERE atencion_id = ${atencion}`);
  expect(d).toMatchObject({ tipo: 'externa', especialidad: 'Oftalmología', motivo: 'Fondo de ojo por hipertensión.' });

  await irAlUltimoPaso(page);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(FICHA);
  await page.goto(`/sistema/atencion/${atencion}/documento`);
  await expect(page.locator('.hoja').first()).toContainText('Referido a');
  await expect(page.locator('.hoja').first()).toContainText('Oftalmología (especialista de afuera)');
});
